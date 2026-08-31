"use client";
import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Feedback";
import { PayeePaymentMethods } from "@/components/payments/PaymentMethods";
import type { FolderFinancials, Friend, SettlementAllocation } from "@/types";
import {
  contributionObligations,
  formatMoney,
  moneyDirectionClass,
  toCentavos,
} from "@/utils/money";
import { recordSettlement } from "@/services/settlements";
import { notifyReceived, requestPayment } from "@/services/notifications";
import { getFinancialOverview } from "@/services/financials";

type Entry = {
  key: string;
  folder: FolderFinancials;
  allocation: SettlementAllocation;
};
const pairTotals = (entries: Entry[]) => {
  const incoming = entries
      .filter((e) => e.allocation.toFriendId === "me")
      .reduce((s, e) => s + toCentavos(e.allocation.amount), 0),
    outgoing = entries
      .filter((e) => e.allocation.fromFriendId === "me")
      .reduce((s, e) => s + toCentavos(e.allocation.amount), 0);
  return { incoming, outgoing, net: incoming - outgoing };
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
}) {
  const [people, setPeople] = useState<string[]>(
      preselectedFriendId ? [preselectedFriendId] : [],
    ),
    [selected, setSelected] = useState<Record<string, string[]>>({}),
    [calculated, setCalculated] = useState(false),
    [busy, setBusy] = useState<Record<string, boolean>>({}),
    [completed, setCompleted] = useState<Record<string, string>>({}),
    [message, setMessage] = useState<string | null>(null);
  const scoped = useMemo(
    () =>
      folderId
        ? financials.filter((item) => item.folder.id === folderId)
        : financials,
    [financials, folderId],
  );
  const byPerson = useMemo(
    () =>
      new Map(
        friends
          .filter((friend) => friend.id !== "me" && !friend.archived)
          .map((friend) => {
            const entries: Entry[] = scoped.flatMap((folder) =>
              contributionObligations(folder.contributions, folder.settlements)
                .filter(
                  (item) =>
                    (item.fromFriendId === "me" &&
                      item.toFriendId === friend.id) ||
                    (item.toFriendId === "me" &&
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
                    expectedPreviouslySettled:
                      folder.settlements.find(
                        (s) =>
                          s.contributionId === item.contributionId &&
                          s.fromFriendId === item.fromFriendId &&
                          s.toFriendId === item.toFriendId,
                      )?.amount || 0,
                  },
                })),
            );
            return [friend.id, entries] as const;
          })
          .filter(([, entries]) => entries.length),
      ),
    [friends, scoped],
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
    setMessage(null);
    onClose();
  };
  async function finalize(personId: string) {
    const person = friends.find((item) => item.id === personId),
      entries = chosen(personId),
      { net } = pairTotals(entries);
    if (!person || !entries.length || !net) return;
    setBusy((v) => ({ ...v, [personId]: true }));
    setMessage(null);
    try {
      const latestFinancials = await getFinancialOverview(uid);
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
      const currentNet = pairTotals(refreshedEntries).net;
      if (refreshedEntries.length !== entries.length || currentNet !== net) {
        throw new Error(
          `Balance changed while this settlement was open. Previous amount: ${formatMoney(Math.abs(net) / 100)}. Current amount: ${formatMoney(Math.abs(currentNet) / 100)}. Review the updated balance before marking it ${net > 0 ? "received" : "paid"}.`,
        );
      }
      if (net < 0 && person.linkedUserId) {
        await requestPayment({
          requesterUid: uid,
          approverUid: person.linkedUserId,
          requesterName: userName,
          approverName: person.name,
          allocations: entries.map((item) => item.allocation),
        });
        setCompleted((v) => ({ ...v, [personId]: "Pending confirmation" }));
      } else {
        for (const item of entries)
          await recordSettlement(uid, {
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
            description: `Settlement recorded · ${item.allocation.contributionTitle}`,
            executedByUserId: uid,
          });
        if (person.linkedUserId && net > 0)
          await notifyReceived(
            uid,
            person.linkedUserId,
            userName,
            Math.abs(net) / 100,
          );
        setCompleted((v) => ({
          ...v,
          [personId]: net > 0 ? "Received ✓" : "Paid ✓",
        }));
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
      (sum, id) => sum + pairTotals(chosen(id)).incoming,
      0,
    ),
    sessionOutgoing = people.reduce(
      (sum, id) => sum + pairTotals(chosen(id)).outgoing,
      0,
    );
  return (
    <Dialog open={open} wide title="Settle Payments" onClose={reset}>
      <div className="settle-workflow">
        <div className="step-indicator">
          <strong>1. People</strong>
          <strong>2. Contributions</strong>
          <strong>3. Results</strong>
        </div>
        <Notice message={message} />
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
              const totals = pairTotals(byPerson.get(person.id) || []);
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
            totals = pairTotals(picked);
          return (
            <section className="settlement-person-group" key={id}>
              <div className="section-heading">
                <div>
                  <h3>{person.name}</h3>
                  <p>{picked.length} selected</p>
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
                {entries.map((entry) => (
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
                        {entry.allocation.fromFriendId === "me"
                          ? `You need to pay ${formatMoney(entry.allocation.amount)}`
                          : `You should receive ${formatMoney(entry.allocation.amount)}`}
                      </small>
                    </span>
                    <strong
                      className={moneyDirectionClass(
                        entry.allocation.fromFriendId,
                        entry.allocation.toFriendId,
                      )}
                    >
                      {entry.allocation.fromFriendId === "me" ? "−" : "+"}
                      {formatMoney(entry.allocation.amount)}
                    </strong>
                  </label>
                ))}
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
                { net } = pairTotals(entries);
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
                          <small>
                            {item.allocation.fromFriendId === "me"
                              ? `You → ${person.name}`
                              : `${person.name} → You`}
                          </small>
                        </span>
                        <strong
                          className={moneyDirectionClass(
                            item.allocation.fromFriendId,
                            item.allocation.toFriendId,
                          )}
                        >
                          {item.allocation.fromFriendId === "me" ? "−" : "+"}
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
                        />
                      )}
                      <Button disabled={busy[id]} onClick={() => finalize(id)}>
                        {net > 0 ? "Received" : "Paid"}
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
  );
}
