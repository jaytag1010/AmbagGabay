"use client";
import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { EmptyState, Notice } from "@/components/ui/Feedback";
import { PayeePaymentMethods } from "@/components/payments/PaymentMethods";
import type { FolderFinancials, Friend, SettlementAllocation } from "@/types";
import {
  contributionObligations,
  fromCentavos,
  formatMoney,
  moneyDirectionClass,
  settlementIntegrityIssues,
  toCentavos,
} from "@/utils/money";
import { oldestFirstAllocations } from "@/utils/settlementAllocation";
import { recordSettlement } from "@/services/settlements";
import { notifyReceived, requestPayment } from "@/services/notifications";
import { getFinancialOverview } from "@/services/financials";

type Entry = {
  key: string;
  folder: FolderFinancials;
  allocation: SettlementAllocation;
};
const pairTotals = (entries: Entry[], currentPersonId = "me") => {
  const incoming = entries
      .filter((e) => e.allocation.toFriendId === currentPersonId)
      .reduce((s, e) => s + toCentavos(e.allocation.amount), 0),
    outgoing = entries
      .filter((e) => e.allocation.fromFriendId === currentPersonId)
      .reduce((s, e) => s + toCentavos(e.allocation.amount), 0);
  return { incoming, outgoing, net: incoming - outgoing };
};
const parseCentavos = (value: string) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};

export function SettlePaymentsDialog({
  open,
  onClose,
  uid,
  userName,
  friends,
  financials,
  folderId,
  preselectedFriendId,
  onComplete,
  currentPersonId = "me",
  recordAllocation,
  refreshFinancials,
  directSettlement = false,
}: {
  open: boolean;
  onClose: () => void;
  uid: string;
  userName: string;
  friends: Friend[];
  financials: FolderFinancials[];
  folderId?: string;
  preselectedFriendId?: string;
  onComplete?: () => Promise<void> | void;
  currentPersonId?: string;
  recordAllocation?: (allocation: SettlementAllocation) => Promise<void>;
  refreshFinancials?: () => Promise<FolderFinancials[]>;
  directSettlement?: boolean;
}) {
  const [people, setPeople] = useState<string[]>(
      preselectedFriendId ? [preselectedFriendId] : [],
    ),
    [selected, setSelected] = useState<Record<string, string[]>>({}),
    [calculated, setCalculated] = useState(false),
    [busy, setBusy] = useState<Record<string, boolean>>({}),
    [completed, setCompleted] = useState<Record<string, string>>({}),
    [receiveFor, setReceiveFor] = useState<string | null>(null),
    [receiveMode, setReceiveMode] = useState<"full" | "partial">("full"),
    [partialMethod, setPartialMethod] = useState<"amount" | "contributions">("amount"),
    [partialAmount, setPartialAmount] = useState(""),
    [receiveContributionKeys, setReceiveContributionKeys] = useState<string[]>([]),
    [receipt, setReceipt] = useState<{person:string;received:number;applied:SettlementAllocation[];remaining:number}|null>(null),
    [message, setMessage] = useState<string | null>(null);
  const scoped = useMemo(
    () =>
      folderId
        ? financials.filter((item) => item.folder.id === folderId)
        : financials,
    [financials, folderId],
  );
  const integrityIssues = useMemo(() => scoped.flatMap(folder => settlementIntegrityIssues(folder.contributions, folder.settlements)), [scoped]);
  const byPerson = useMemo(
    () =>
      new Map(
        friends
          .filter((friend) => friend.id !== currentPersonId && !friend.archived)
          .map((friend) => {
            const entries: Entry[] = scoped.flatMap((folder) =>
              contributionObligations(folder.contributions, folder.settlements)
                .filter(
                  (item) =>
                    (item.fromFriendId === currentPersonId &&
                      item.toFriendId === friend.id) ||
                    (item.toFriendId === currentPersonId &&
                      item.fromFriendId === friend.id),
                )
                .map((item) => ({
                  key: `${folder.folder.id}-${item.contributionId}-${item.fromFriendId}-${item.toFriendId}`,
                  folder,
                  allocation: {
                    folderId: folder.folder.id,
                    contributionId: item.contributionId,
                    fromFriendId: item.fromFriendId,
                    toFriendId: item.toFriendId,
                    amount: item.amount,
                    contributionTitle: item.contributionTitle,
                    folderName: folder.folder.name,
                    ledger: folder.settlementContext?.kind || "private",
                    storedFromFriendId: folder.settlementContext?.personIds?.[item.fromFriendId] || item.fromFriendId,
                    storedToFriendId: folder.settlementContext?.personIds?.[item.toFriendId] || item.toFriendId,
                    expectedPreviouslySettled:
                      folder.settlements.find(
                        (s) =>
                          s.contributionId === item.contributionId &&
                          s.fromFriendId === item.fromFriendId &&
                          s.toFriendId === item.toFriendId,
                      )?.amount || 0,
                    contributionDate: item.contributionDate,
                    contributionCreatedAt: folder.contributions.find(value => value.id === item.contributionId)?.createdAt,
                  },
                })),
            );
            return [friend.id, entries] as const;
          })
          .filter(([, entries]) => entries.length),
      ),
    [currentPersonId, friends, scoped],
  );
  const candidates = friends.filter((friend) => byPerson.has(friend.id));
  const chosen = (id: string) =>
    (byPerson.get(id) || []).filter((entry) =>
      (selected[id] || []).includes(entry.key),
    );
  const togglePerson = (id: string) => {
    setPeople((values) =>
      values.includes(id)
        ? values.filter((value) => value !== id)
        : [...values, id],
    );
    setSelected((values) =>
      values[id]
        ? values
        : { ...values, [id]: (byPerson.get(id) || []).map((e) => e.key) },
    );
    setCalculated(false);
  };
  const reset = () => {
    setPeople(preselectedFriendId ? [preselectedFriendId] : []);
    setSelected({});
    setCalculated(false);
    setCompleted({});
    setReceiveFor(null);
    setReceiveContributionKeys([]);
    setReceipt(null);
    setMessage(null);
    onClose();
  };
  async function finalize(personId: string, receivedCentavos?: number, contributionKeys: string[] = []) {
    const person = friends.find((item) => item.id === personId),
      entries = chosen(personId),
      { net } = pairTotals(entries, currentPersonId);
    if (!person || !entries.length || !net) return;
    setBusy((v) => ({ ...v, [personId]: true }));
    setMessage(null);
    try {
      const latestFinancials = refreshFinancials ? await refreshFinancials() : recordAllocation ? financials : await getFinancialOverview(uid);
      const refreshedEntries = entries.flatMap((entry) => {
        const latestFolder = latestFinancials.find(
          (item) => item.folder.id === entry.allocation.folderId,
        );
        if (!latestFolder) return [];
        const latestObligation = contributionObligations(
          latestFolder.contributions,
          latestFolder.settlements,
        ).find(
          (item) =>
            item.contributionId === entry.allocation.contributionId &&
            item.fromFriendId === entry.allocation.fromFriendId &&
            item.toFriendId === entry.allocation.toFriendId,
        );
        if (!latestObligation) return [];
        return [
          {
            ...entry,
            folder: latestFolder,
            allocation: {
              ...entry.allocation,
              amount: latestObligation.amount,
            },
          },
        ];
      });
      const currentNet = pairTotals(refreshedEntries, currentPersonId).net;
      if (refreshedEntries.length !== entries.length || currentNet !== net) {
        throw new Error(
          `Balance changed while this settlement was open. Previous amount: ${formatMoney(Math.abs(net) / 100)}. Current amount: ${formatMoney(Math.abs(currentNet) / 100)}. Review the updated balance before marking it ${net > 0 ? "received" : "paid"}.`,
        );
      }
      const incomingEntries=refreshedEntries.filter(item => item.allocation.toFriendId === currentPersonId),
        selectedContributionEntries=contributionKeys.length?incomingEntries.filter(item=>contributionKeys.includes(item.key)):[],
        receivedAllocations = net > 0 && receivedCentavos
        ? (selectedContributionEntries.length?selectedContributionEntries.map(item=>item.allocation):oldestFirstAllocations(incomingEntries.map(item => item.allocation), receivedCentavos)).map(item=>({...item,receiptKind:receivedCentavos<currentNet?"partial" as const:"exact" as const}))
        : [];
      const entriesToRecord = receivedAllocations.length
        ? receivedAllocations.map(allocation => ({
            ...refreshedEntries.find(item => item.allocation.folderId === allocation.folderId && item.allocation.contributionId === allocation.contributionId && item.allocation.fromFriendId === allocation.fromFriendId && item.allocation.toFriendId === allocation.toFriendId)!,
            allocation,
          }))
        : refreshedEntries;
      if (net > 0 && receivedCentavos && (receivedCentavos <= 0 || receivedCentavos > currentNet)) throw new Error("The received amount is no longer valid. Review the updated balance.");
      if (!directSettlement && net < 0 && person.linkedUserId) {
        await requestPayment({
          requesterUid: uid,
          approverUid: person.linkedUserId,
          requesterName: userName,
          approverName: person.name,
          allocations: entries.map((item) => item.allocation),
        });
        setCompleted((v) => ({ ...v, [personId]: "Pending confirmation" }));
      } else {
        for (const item of entriesToRecord)
          await (recordAllocation ? recordAllocation({
            ...item.allocation,
            expectedPreviouslySettled: item.folder.settlements.find((s) => s.contributionId === item.allocation.contributionId && s.fromFriendId === item.allocation.fromFriendId && s.toFriendId === item.allocation.toFriendId)?.amount || 0,
          }) : recordSettlement(uid, {
            ...item.allocation,
            expectedPreviouslySettled:
              item.folder.settlements.find(
                (s) =>
                  s.contributionId === item.allocation.contributionId &&
                  s.fromFriendId === item.allocation.fromFriendId &&
                  s.toFriendId === item.allocation.toFriendId,
              )?.amount || 0,
            source:
              person.linkedUserId && net > 0
                ? "received"
                : "nonlinked-executory",
            description: `${receivedCentavos && receivedCentavos < currentNet ? "Partial payment received" : "Settlement recorded"} · ${item.allocation.contributionTitle} · ${formatMoney(item.allocation.amount)}`,
            executedByUserId: uid,
          }));
        if (!directSettlement && person.linkedUserId && net > 0)
          await notifyReceived(
            uid,
            person.linkedUserId,
            userName,
            fromCentavos(receivedCentavos || Math.abs(net)),
            fromCentavos(Math.max(0, currentNet - (receivedCentavos || currentNet))),
          );
        setCompleted((v) => ({
          ...v,
          [personId]: net > 0 && receivedCentavos && receivedCentavos < currentNet ? "Partially received" : net > 0 ? "Received ✓" : "Paid ✓",
        }));
        if(net>0&&receivedCentavos)setReceipt({person:person.name,received:fromCentavos(receivedCentavos),applied:receivedAllocations,remaining:fromCentavos(Math.max(0,currentNet-receivedCentavos))});
        setReceiveFor(null);
        await onComplete?.();
      }
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : `Unable to settle with ${person.name}.`,
      );
    } finally {
      setBusy((v) => ({ ...v, [personId]: false }));
    }
  }
  const selectedEntries = people.flatMap((id) => chosen(id)),
    sessionIncoming = people.reduce(
      (sum, id) => sum + pairTotals(chosen(id), currentPersonId).incoming,
      0,
    ),
    sessionOutgoing = people.reduce(
      (sum, id) => sum + pairTotals(chosen(id), currentPersonId).outgoing,
      0,
    ),
    receivePerson = receiveFor ? friends.find(item => item.id === receiveFor) : null,
    receiveNet = receiveFor ? pairTotals(chosen(receiveFor), currentPersonId).net : 0,
    receiveEntries = receiveFor ? chosen(receiveFor).filter(item=>item.allocation.toFriendId===currentPersonId) : [],
    partialCentavos = parseCentavos(partialAmount),
    partialValid = partialCentavos !== null && partialCentavos >= 1 && partialCentavos < receiveNet,
    selectedContributionCentavos = receiveEntries.filter(item=>receiveContributionKeys.includes(item.key)).reduce((sum,item)=>sum+toCentavos(item.allocation.amount),0),
    contributionSelectionValid = selectedContributionCentavos >= 1 && selectedContributionCentavos < receiveNet;
  if (!candidates.length) return <Dialog open={open} wide title="Settle Payments" onClose={reset}>{integrityIssues.length>0&&<Notice message={`${integrityIssues.length} edited Contribution settlement ${integrityIssues.length===1?"record requires":"records require"} review. Historical payments were preserved without creating a negative balance or credit.`}/>}<EmptyState title="No outstanding payments to settle" description="All accessible Contribution relationships are currently settled." /></Dialog>;
  return (
    <><Dialog open={open} wide title="Settle Payments" onClose={reset}>
      <div className="settle-workflow">
        <div className="step-indicator">
          <strong>1. People</strong>
          <strong>2. Contributions</strong>
          <strong>3. Results</strong>
        </div>
        <Notice message={message} />
        {integrityIssues.length > 0 && <Notice message={`${integrityIssues.length} edited Contribution settlement ${integrityIssues.length===1?"record requires":"records require"} review. Historical payments were preserved and were not converted into a new debt or credit.`} />}
        <section>
          <div className="section-heading">
            <div>
              <h3>Who do you want to settle with?</h3>
              <p>Only people with outstanding balances are shown.</p>
            </div>
            {candidates.length > 1 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setPeople(candidates.map((p) => p.id));
                  setSelected(
                    Object.fromEntries(
                      candidates.map((p) => [
                        p.id,
                        (byPerson.get(p.id) || []).map((e) => e.key),
                      ]),
                    ),
                  );
                  setCalculated(false);
                }}
              >
                Select All Outstanding
              </Button>
            )}
          </div>
          <div className="settlement-people">
            {candidates.map((person) => {
              const totals = pairTotals(byPerson.get(person.id) || [], currentPersonId);
              return (
                <label key={person.id}>
                  <input
                    type="checkbox"
                    checked={people.includes(person.id)}
                    onChange={() => togglePerson(person.id)}
                  />
                  <span>
                    <strong>{person.name}</strong>
                    <small
                      className={
                        totals.net >= 0 ? "money-incoming" : "money-outgoing"
                      }
                    >
                      {totals.net >= 0
                        ? `You should receive ${formatMoney(totals.net / 100)}`
                        : `You need to pay ${formatMoney(-totals.net / 100)}`}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
          {!candidates.length && (
            <p className="muted-copy">
              There are no outstanding people in this scope.
            </p>
          )}
        </section>
        {people.map((id) => {
          const person = friends.find((p) => p.id === id)!,
            entries = byPerson.get(id) || [],
            picked = chosen(id),
            totals = pairTotals(picked, currentPersonId),
            grouped = [...entries.reduce((map, entry) => { const key=entry.folder.folder.id, group=map.get(key)||{folder:entry.folder.folder,entries:[] as Entry[]};group.entries.push(entry);map.set(key,group);return map;},new Map<string,{folder:FolderFinancials["folder"];entries:Entry[]}>()).values()];
          return (
            <section className="settlement-person-group" key={id}>
              <div className="section-heading">
                <div>
                  <h3>{person.name}</h3>
                  <p>{new Set(picked.map(entry=>entry.folder.folder.id)).size} folders · {picked.length} Contributions selected</p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelected((v) => ({
                      ...v,
                      [id]: entries.map((e) => e.key),
                    }));
                    setCalculated(false);
                  }}
                >
                  Select All Outstanding
                </Button>
              </div>
              <div className="settlement-contributions">
                {grouped.map(group => <section className="settlement-folder-group" key={group.folder.id}><div className="settlement-folder-heading"><strong>{group.folder.name}</strong><Button variant="ghost" onClick={()=>{setSelected(value=>({...value,[id]:[...new Set([...(value[id]||[]),...group.entries.map(entry=>entry.key)])]}));setCalculated(false)}}>Select Folder</Button></div>{group.entries.map((entry) => (
                  <label key={entry.key}>
                    <input
                      type="checkbox"
                      checked={(selected[id] || []).includes(entry.key)}
                      onChange={() => {
                        setSelected((v) => ({
                          ...v,
                          [id]: (v[id] || []).includes(entry.key)
                            ? (v[id] || []).filter((k) => k !== entry.key)
                            : [...(v[id] || []), entry.key],
                        }));
                        setCalculated(false);
                      }}
                    />
                    <span>
                      <strong>{entry.allocation.contributionTitle}</strong>
                      <small>{entry.folder.folder.name}</small>
                      <small>
                        {entry.allocation.fromFriendId === currentPersonId
                          ? `You need to pay ${formatMoney(entry.allocation.amount)}`
                          : `You should receive ${formatMoney(entry.allocation.amount)}`}
                      </small>
                    </span>
                    <strong
                      className={moneyDirectionClass(
                        entry.allocation.fromFriendId,
                        entry.allocation.toFriendId,
                        currentPersonId,
                      )}
                    >
                      {entry.allocation.fromFriendId === currentPersonId ? "−" : "+"}
                      {formatMoney(entry.allocation.amount)}
                    </strong>
                  </label>
                ))}</section>)}
              </div>
              <div className="summary-grid">
                <article className="metric">
                  <span>Receivable</span>
                  <strong className="money-incoming">
                    {formatMoney(totals.incoming / 100)}
                  </strong>
                </article>
                <article className="metric">
                  <span>Payable</span>
                  <strong className="money-outgoing">
                    {formatMoney(totals.outgoing / 100)}
                  </strong>
                </article>
              </div>
            </section>
          );
        })}
        {people.length > 0 && (
          <section className="session-summary">
            <strong>
              {people.length} people selected · {selectedEntries.length}{" "}
              Contributions selected
            </strong>
            <span>
              Total Receivable{" "}
              <strong className="money-incoming">
                {formatMoney(sessionIncoming / 100)}
              </strong>
            </span>
            <span>
              Total Payable{" "}
              <strong className="money-outgoing">
                {formatMoney(sessionOutgoing / 100)}
              </strong>
            </span>
          </section>
        )}
        {!calculated ? (
          <Button
            disabled={!selectedEntries.length}
            onClick={() => setCalculated(true)}
          >
            Calculate
          </Button>
        ) : (
          <section className="settlement-results">
            <h2>Settlement Results</h2>
            {people.map((id) => {
              const person = friends.find((p) => p.id === id)!,
                entries = chosen(id),
                { net } = pairTotals(entries, currentPersonId);
              if (!entries.length) return null;
              return (
                <article className="settlement-result-card" key={id}>
                  <header>
                    <h3>{person.name}</h3>
                    {completed[id] && (
                      <span className="settled-badge">{completed[id]}</span>
                    )}
                  </header>
                  <div className="calculation-breakdown">
                    {entries.map((item) => (
                      <div key={item.key}>
                        <span>
                          {item.allocation.contributionTitle}
                          <small>{item.folder.folder.name}</small>
                          <small>
                            {item.allocation.fromFriendId === currentPersonId
                              ? `You → ${person.name}`
                              : `${person.name} → You`}
                          </small>
                        </span>
                        <strong
                          className={moneyDirectionClass(
                            item.allocation.fromFriendId,
                            item.allocation.toFriendId,
                            currentPersonId,
                          )}
                        >
                          {item.allocation.fromFriendId === currentPersonId ? "−" : "+"}
                          {formatMoney(item.allocation.amount)}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <h3
                    className={
                      net > 0
                        ? "money-incoming"
                        : net < 0
                          ? "money-outgoing"
                          : "money-neutral"
                    }
                  >
                    {net === 0
                      ? "No payment is needed"
                      : net > 0
                        ? `You should receive ${formatMoney(net / 100)}`
                        : `You need to pay ${formatMoney(-net / 100)}`}
                  </h3>
                  {!completed[id] && net !== 0 && (
                    <div className="settlement-result-actions">
                      {net < 0 && (
                        <PayeePaymentMethods
                          currentUid={uid}
                          friend={person}
                          amount={-net / 100}
                          providerName={userName}
                        />
                      )}
                      <Button disabled={busy[id]} onClick={() => net > 0 ? (setReceiveFor(id),setReceiveMode("full"),setPartialMethod("amount"),setPartialAmount(""),setReceiveContributionKeys([]),setReceipt(null)) : finalize(id)}>
                        {net > 0 ? "Record Received Payment" : "Paid"}
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
            <Button variant="secondary" onClick={() => setCalculated(false)}>
              Back
            </Button>
          </section>
        )}
      </div>
    </Dialog>
    <Dialog open={!!receiveFor||!!receipt} title="Record Payment Received" onClose={()=>{setReceiveFor(null);setReceipt(null)}}>
      {receipt ? <div className="receive-payment-summary"><p>Received <strong>{formatMoney(receipt.received)}</strong> from {receipt.person}.</p><h3>Applied to</h3><ul>{receipt.applied.map(item=><li key={`${item.folderId}-${item.contributionId}`}><span>{item.contributionTitle}</span><strong>{formatMoney(item.amount)}</strong></li>)}</ul>{receipt.remaining>0?<p className="money-outgoing"><strong>{formatMoney(receipt.remaining)}</strong> remains outstanding.</p>:<p className="money-incoming">Selected obligations are settled.</p>}<div className="dialog-actions"><span/><Button onClick={()=>{setReceipt(null);setReceiveFor(null)}}>Done</Button></div></div> : receivePerson ? <div className="receive-payment-dialog">
        <Notice message={message}/><p><strong>{receivePerson.name} → You</strong></p><div className="metric"><span>Selected outstanding</span><strong>{formatMoney(fromCentavos(receiveNet))}</strong></div>
        <div className="receive-choice-grid"><label className="radio-row"><input type="radio" name="receive-mode" checked={receiveMode==="full"} onChange={()=>setReceiveMode("full")}/><span><strong>Full Payment</strong><small>Record the complete {formatMoney(fromCentavos(receiveNet))} outstanding balance.</small></span></label><label className="radio-row"><input type="radio" name="receive-mode" checked={receiveMode==="partial"} onChange={()=>setReceiveMode("partial")}/><span><strong>Partial Payment</strong><small>Record an amount or specific Contributions.</small></span></label></div>
        {receiveMode==="partial"&&<div className="partial-payment-options"><h3>How should the partial payment be recorded?</h3><label className="radio-row"><input type="radio" name="partial-method" checked={partialMethod==="amount"} onChange={()=>setPartialMethod("amount")}/><span><strong>Enter an amount</strong><small>Applied to the oldest selected Contribution first.</small></span></label><label className="radio-row"><input type="radio" name="partial-method" checked={partialMethod==="contributions"} onChange={()=>setPartialMethod("contributions")}/><span><strong>Select Contributions</strong><small>Mark only the chosen Contributions as received.</small></span></label>
          {partialMethod==="amount"?<div><label htmlFor="partial-received">Amount received</label><input id="partial-received" className="input" inputMode="decimal" placeholder="0.00" value={partialAmount} onChange={event=>setPartialAmount(event.target.value)}/><small>Maximum partial amount: {formatMoney(fromCentavos(Math.max(0,receiveNet-1)))}</small>{partialAmount&&partialCentavos!==null&&partialCentavos===receiveNet?<p className="field-error">For the full outstanding balance, choose Full Payment.</p>:partialAmount&&!partialValid?<p className="field-error">Enter an amount from ₱0.01 up to {formatMoney(fromCentavos(Math.max(0,receiveNet-1)))}.</p>:null}</div>:<div className="receive-contribution-list">{receiveEntries.map(item=><label key={item.key}><input type="checkbox" checked={receiveContributionKeys.includes(item.key)} onChange={()=>setReceiveContributionKeys(values=>values.includes(item.key)?values.filter(key=>key!==item.key):[...values,item.key])}/><span><strong>{item.allocation.contributionTitle}</strong><small>{item.folder.folder.name}</small></span><strong>{formatMoney(item.allocation.amount)}</strong></label>)}{receiveContributionKeys.length>0&&!contributionSelectionValid&&<p className="field-error">The selected Contributions must total less than the full outstanding balance. Choose Full Payment to record everything.</p>}<p><span>Selected</span> <strong>{formatMoney(fromCentavos(selectedContributionCentavos))}</strong></p></div>}
        </div>}
        <div className="dialog-actions"><Button variant="secondary" onClick={()=>setReceiveFor(null)}>Cancel</Button><span/><Button disabled={busy[receiveFor!]||(receiveMode==="partial"&&(partialMethod==="amount"?!partialValid:!contributionSelectionValid))} onClick={()=>finalize(receiveFor!,receiveMode==="full"?receiveNet:partialMethod==="amount"?partialCentavos!:selectedContributionCentavos,receiveMode==="partial"&&partialMethod==="contributions"?receiveContributionKeys:[])}>Payment Received</Button></div>
      </div> : null}
    </Dialog></>
  );
}
