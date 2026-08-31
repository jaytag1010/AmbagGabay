"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ArrowLeft, Pencil, RotateCcw } from "lucide-react";
import { FriendAvatar } from "@/components/ui/FriendAvatar";
import { Button } from "@/components/ui/Button";
import { PaymentMethodsPanel } from "@/components/payments/PaymentMethods";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { EmptyState, LoadingState, Notice } from "@/components/ui/Feedback";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import { getFinancialOverview } from "@/services/financials";
import { setFriendArchived, subscribeFriends } from "@/services/friends";
import { recordSettlement } from "@/services/settlements";
import { notifyReceived, requestPayment } from "@/services/notifications";
import {
  findAccount,
  linkFriend,
  unlinkFriend,
} from "@/services/identityLinks";
import type {
  ContributionObligation,
  FolderFinancials,
  PublicProfile,
} from "@/types";
import { formatDate, friendLabel } from "@/utils/format";
import {
  calculateBalances,
  contributionFriendPosition,
  contributionObligations,
  effectiveExpensePayer,
  formatMoney,
  fromCentavos,
  getPairNetBalance,
  moneyDirectionClass,
  splitCentavos,
} from "@/utils/money";

type ObligationRow = { folder: FolderFinancials; obligation: ContributionObligation };

export default function FriendDetailsPage() {
  const { friendId } = useParams<{ friendId: string }>(), auth=useAuth(),
    uid = auth.currentUser!.uid;
  const friendSub = useCallback(
    (
      next: Parameters<typeof subscribeFriends>[1],
      fail: Parameters<typeof subscribeFriends>[2],
    ) => subscribeFriends(uid, next, fail),
    [uid],
  );
  const friends = useCollectionData(friendSub),
    [folders, setFolders] = useState<FolderFinancials[]>([]),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [breakdown, setBreakdown] = useState<ObligationRow[] | null>(null),
    [linking, setLinking] = useState(false),
    [gmail, setGmail] = useState(""),
    [found, setFound] = useState<{
      email: string;
      profile: PublicProfile;
    } | null>(null);
  const refresh = useCallback(
    () =>
      getFinancialOverview(uid)
        .then(setFolders)
        .catch(() => setError("Unable to load financial history.")),
    [uid],
  );
  useEffect(() => {
    refresh();
  }, [refresh]);
  const person = friends.items.find((item) => item.id === friendId),
    contributions = folders.flatMap((item) => item.contributions),
    settlements = folders.flatMap((item) => item.settlements);
  const summary = calculateBalances(contributions, settlements).find(
    (item) => item.friendId === friendId,
  );
  const totalInvolved = useMemo(
    () =>
      folders.reduce(
        (sum, item) =>
          sum +
          item.contributions.reduce(
            (inner, c) =>
              inner +
              c.expenses
                .filter(
                  (e) =>
                    e.participantIds.includes(friendId) ||
                    effectiveExpensePayer(c, e) === friendId,
                )
                .reduce((s, e) => s + e.amount, 0),
            0,
          ),
        0,
      ),
    [folders, friendId],
  );
  const rows: ObligationRow[] = folders.flatMap(item => contributionObligations(item.contributions, item.settlements).filter(flow => (flow.fromFriendId === friendId && flow.toFriendId === "me") || (flow.toFriendId === friendId && flow.fromFriendId === "me")).map(obligation => ({ folder: item, obligation })));
  const incoming = rows.filter(row => row.obligation.toFriendId === "me"),
    outgoing = rows.filter(row => row.obligation.fromFriendId === "me");
  const name = (id: string) =>
    friends.items.find((item) => item.id === id)?.name || "Unknown";
  const previous = (folder: FolderFinancials, flow: ContributionObligation) =>
    folder.settlements.find(
      (item) =>
        item.fromFriendId === flow.fromFriendId &&
        item.toFriendId === flow.toFriendId && item.contributionId === flow.contributionId,
    )?.amount || 0;
  async function settle(
    row: ObligationRow,
    source: "individual" | "all",
  ) {
    const { obligation: flow, folder } = row;
    await recordSettlement(uid, {
      folderId: folder.folder.id,
      contributionId: flow.contributionId,
      fromFriendId: flow.fromFriendId,
      toFriendId: flow.toFriendId,
      amount: flow.amount,
      expectedPreviouslySettled: previous(folder, flow),
      source,
      description: `${name(flow.fromFriendId)} paid ${name(flow.toFriendId)} ${formatMoney(flow.amount)} · ${folder.folder.name}`,
    });
  }
  async function settleRows(values: ObligationRow[], kind: string) {
    if (
      !values.length ||
      !confirm(
        `${kind}?\n\nThis will settle:\n${values.map(v => `${v.obligation.contributionTitle} — ${formatMoney(v.obligation.amount)}`).join("\n")}\n\nTotal: ${formatMoney(values.reduce((s, v) => s + v.obligation.amount, 0))}`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const direction=values[0]?.obligation.fromFriendId==="me"?"paid":"received";
      if(values.some(row=>(row.obligation.fromFriendId==="me")!==(direction==="paid"))) throw new Error("Paid and received obligations must be settled separately.");
      if(direction==="paid"&&person?.linkedUserId){await requestPayment({requesterUid:uid,approverUid:person.linkedUserId,requesterName:auth.currentUser?.displayName||"User",approverName:person.name,allocations:values.map(row=>({folderId:row.folder.folder.id,contributionId:row.obligation.contributionId,fromFriendId:row.obligation.fromFriendId,toFriendId:row.obligation.toFriendId,amount:row.obligation.amount,contributionTitle:row.obligation.contributionTitle,expectedPreviouslySettled:previous(row.folder,row.obligation)}))});}
      else {for (const row of values) await settle(row, "all"); if(direction==="received"&&person?.linkedUserId)await notifyReceived(uid,person.linkedUserId,auth.currentUser?.displayName||"User",values.reduce((sum,row)=>sum+row.obligation.amount,0));}
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to record payment.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function settleOne(row: ObligationRow) {
    await settleRows([row], `Mark ${row.obligation.fromFriendId === "me" ? "Paid" : "Received"}`);
  }
  if (friends.loading) return <LoadingState />;
  if (!person) return <Notice message="Friend not found." />;
  const pairBalance=fromCentavos(getPairNetBalance(contributions,settlements,"me",friendId).netCentavos);
  return (
    <>
      <Link href="/friends" className="back-link">
        <ArrowLeft size={18} /> Friends
      </Link>
      <header className="friend-detail-header">
        <FriendAvatar size="large" friend={person} />
        <div>
          <h1>{friendLabel(person)}</h1>
          <p>{person.archived ? "Archived Friend" : "Active Friend"}</p>
        </div>
        {person.archived ? (
          <Button onClick={() => setFriendArchived(uid, person, false)}>
            <RotateCcw size={17} /> Restore Friend
          </Button>
        ) : (
          !person.isMe && (
            <Link
              className="button button-secondary"
              href={`/friends?edit=${person.id}`}
            >
              <Pencil size={17} /> Edit Friend
            </Link>
          )
        )}
      </header>
      <Notice message={error} />
      <section className="summary-grid">
        <article className="metric">
          <span>Total Amount Involved</span>
          <strong>{formatMoney(totalInvolved)}</strong>
        </article>
        <article className="metric">
          <span>Total Paid</span>
          <strong>{formatMoney(summary?.paid || 0)}</strong>
        </article>
        <article className="metric">
          <span>Personal Share</span>
          <strong>{formatMoney(summary?.share || 0)}</strong>
        </article>
        <article className="metric">
          <span>Current Balance</span>
          <strong className={Math.abs(pairBalance)<0.005?"money-neutral":pairBalance > 0 ? "money-incoming" : "money-outgoing"}>
            {Math.abs(pairBalance) < 0.005
              ? "Settled"
              : pairBalance > 0
                ? `Owes ${formatMoney(pairBalance)}`
                : `To receive ${formatMoney(-pairBalance)}`}
          </strong>
        </article>
      </section>
      {!person.isMe && (
        <section className="panel linked-account">
          <h2>AmbagGabay Account</h2>
          {person.linkedUserId ? (
            <>
              <p>
                <strong>Linked</strong>
                <br />
                {person.linkedEmail}
              </p>
              <Button
                variant="secondary"
                onClick={async () => {
                  if (
                    confirm(`Unlink ${person.name} from ${person.linkedEmail}?`)
                  )
                    try {
                      await unlinkFriend(uid, person);
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "Unable to unlink account.",
                      );
                    }
                }}
              >
                Unlink Account
              </Button>
            </>
          ) : (
            <>
              <p className="muted-copy">Not linked</p>
              <Button variant="secondary" onClick={() => setLinking(true)}>
                Link Gmail
              </Button>
            </>
          )}
        </section>
      )}
      <PaymentMethodsPanel currentUid={uid} friend={person}/>
      <DebtSection
        title={`${person.name} Owes You`}
        rows={incoming}
        action="Received"
        all="Mark All Received"
        disabled={busy}
        name={name}
        subjectId={friendId}
        onOne={settleOne}
        onMany={(values) => settleRows(values, "Mark these contributions settled")}
        onAll={() => settleRows(incoming, "Mark all received")}
        onInspect={setBreakdown}
      />
      <DebtSection
        title={`You Owe ${person.name}`}
        rows={outgoing}
        action="Paid"
        all="Mark All Paid"
        disabled={busy}
        name={name}
        subjectId={friendId}
        onOne={settleOne}
        onMany={(values) => settleRows(values, "Mark these contributions settled")}
        onAll={() => settleRows(outgoing, "Mark all paid")}
        onInspect={setBreakdown}
      />
      <h2 className="section-title">Folders</h2>
      <div className="folder-breakdown">
        {folders.map((item) => {
          const folderPair=fromCentavos(getPairNetBalance(item.contributions,item.settlements,"me",friendId).netCentavos);
          return (
            <Link
              className="panel"
              href={`/folders/${item.folder.id}`}
              key={item.folder.id}
            >
              <h3>
                {item.folder.icon} {item.folder.name}
              </h3>
              <strong className={Math.abs(folderPair)<0.005?"money-neutral":folderPair>0?"money-incoming":"money-outgoing"}>
                {Math.abs(folderPair) < 0.005
                  ? "Settled"
                  : folderPair > 0
                    ? `Owes ${formatMoney(folderPair)}`
                    : `To receive ${formatMoney(-folderPair)}`}
              </strong>
            </Link>
          );
        })}
      </div>
      <h2 className="section-title">Contribution & Expense History</h2>
      {!contributions.length ? (
        <EmptyState
          title="No financial history"
          description="Contributions involving this friend will appear here."
        />
      ) : (
        <div className="list">
          {folders
            .flatMap(({ folder, contributions: items }) =>
              items.map((contribution) => ({ folder, contribution })),
            )
            .filter(({ contribution }) =>
              contribution.expenses.some(
                (e) =>
                  e.participantIds.includes(friendId) ||
                  effectiveExpensePayer(contribution, e) === friendId,
              ),
            )
            .map(({ folder, contribution }) => (
              <article
                className="history-card"
                key={`${folder.id}-${contribution.id}`}
              >
                <div>
                  <h3 className="contribution-title">{contribution.title}</h3>
                  <strong className="history-subtotal">
                    Share {formatMoney(contribution.expenses.filter(e => e.participantIds.includes(friendId)).reduce((sum, e) => sum + fromCentavos(splitCentavos(e.amount, e.participantIds).get(friendId) || 0), 0))}
                  </strong>
                  <p>
                    {formatDate(contribution.date)} · {folder.name}
                  </p>
                </div>
                <div className="history-expenses">
                  {contribution.expenses
                    .filter(
                      (e) =>
                        e.participantIds.includes(friendId) ||
                        effectiveExpensePayer(contribution, e) === friendId,
                    )
                    .map((e) => (
                      <p key={e.id}>
                        {e.title}: Paid{" "}
                        {formatMoney(
                          effectiveExpensePayer(contribution, e) === friendId
                            ? e.amount
                            : 0,
                        )}{" "}
                        · Share{" "}
                        {formatMoney(
                          fromCentavos(
                            splitCentavos(e.amount, e.participantIds).get(
                              friendId,
                            ) || 0,
                          ),
                        )}
                      </p>
                    ))}
                </div>
              </article>
            ))}
        </div>
      )}
      <Dialog
        open={linking}
        title="Link AmbagGabay Account"
        onClose={() => {
          setLinking(false);
          setFound(null);
        }}
      >
        <Field
          label="Registered Gmail"
          type="email"
          value={gmail}
          onChange={(event) => setGmail(event.target.value)}
        />
        {found && (
          <div className="account-found">
            <h3>Account found</h3>
            <p>
              <strong>{found.profile.displayName}</strong>
              <br />
              {found.email}
            </p>
            <p>
              Link this account to <strong>{person.name}</strong>?
            </p>
          </div>
        )}
        <div className="dialog-actions">
          <Button
            variant="secondary"
            onClick={() => {
              setLinking(false);
              setFound(null);
            }}
          >
            Cancel
          </Button>
          <span />
          {found ? (
            <Button
              onClick={async () => {
                setBusy(true);
                try {
                  await linkFriend(uid, person, found.email, found.profile);
                  setLinking(false);
                  setFound(null);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Unable to link account.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              Link Account
            </Button>
          ) : (
            <Button
              onClick={async () => {
                try {
                  setFound(await findAccount(gmail));
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Account lookup failed.",
                  );
                }
              }}
            >
              Find Account
            </Button>
          )}
        </div>
      </Dialog>
      <Dialog open={!!breakdown} wide title="Obligation breakdown" onClose={() => setBreakdown(null)}>
        {breakdown && (() => {
          const unique = [...new Map(breakdown.map(row => [`${row.folder.folder.id}-${row.obligation.contributionId}`, row])).values()];
          const gross = breakdown.reduce((sum, row) => sum + row.obligation.grossAmount, 0), applied = breakdown.reduce((sum, row) => sum + row.obligation.settledAmount, 0), outstanding = breakdown.reduce((sum, row) => sum + row.obligation.amount, 0);
          const positions = unique.map(row => ({ row, contribution: row.folder.contributions.find(item => item.id === row.obligation.contributionId)! })).filter(item => item.contribution).map(item => ({ ...item, position: contributionFriendPosition(item.contribution, friendId) }));
          return <div className="obligation-breakdown"><div className="summary-grid"><article className="metric"><span>Current Outstanding</span><strong>{formatMoney(outstanding)}</strong></article><article className="metric"><span>Applied Settlements</span><strong>{formatMoney(applied)}</strong></article></div><div className="breakdown-contributions">{positions.map(({ row, contribution, position }) => <article className="breakdown-contribution" key={`${row.folder.folder.id}-${contribution.id}`}><header><div><h3>{contribution.title}</h3><p>{formatDate(contribution.date)} · {row.folder.folder.name}</p></div><strong>{name(row.obligation.fromFriendId)} → {name(row.obligation.toFriendId)}</strong></header><div className="calculation-lines"><span>Personal Share<strong>+{formatMoney(position.share)}</strong></span><span>Amount Paid<strong>−{formatMoney(position.paid)}</strong></span><span>Net Effect<strong className={position.netEffect >= 0 ? "negative" : "positive"}>{position.netEffect >= 0 ? "+" : "−"}{formatMoney(Math.abs(position.netEffect))}</strong></span></div><div className="item-calculations">{contribution.expenses.filter(expense => expense.participantIds.includes(friendId) || effectiveExpensePayer(contribution, expense) === friendId).map(expense => { const share = fromCentavos(splitCentavos(expense.amount, expense.participantIds).get(friendId) || 0), paid = effectiveExpensePayer(contribution, expense) === friendId ? expense.amount : 0; return <div key={expense.id}><span>{expense.title}<small>Share {formatMoney(share)} · Paid {formatMoney(paid)}</small></span><strong>{share - paid >= 0 ? "+" : "−"}{formatMoney(Math.abs(share - paid))}</strong></div>; })}</div>{row.obligation.settledAmount > 0 && <p className="settlement-applied">Payments / settlements: −{formatMoney(row.obligation.settledAmount)}</p>}<strong className="outstanding-line">Outstanding to {name(row.obligation.toFriendId)}: {formatMoney(row.obligation.amount)}</strong></article>)}</div><footer className="reconciliation"><span>Gross pair balance<strong>{formatMoney(gross)}</strong></span><span>Settlements<strong>−{formatMoney(applied)}</strong></span><span>Current Outstanding<strong>{formatMoney(outstanding)}</strong></span></footer></div>;
        })()}
      </Dialog>
      <h2 className="section-title">Settlement History</h2>
      {!settlements.filter(
        (s) => s.fromFriendId === friendId || s.toFriendId === friendId,
      ).length ? (
        <p className="muted-copy">No payments recorded yet.</p>
      ) : (
        <div className="list">
          {settlements
            .filter(
              (s) => s.fromFriendId === friendId || s.toFriendId === friendId,
            )
            .sort(
              (a, b) =>
                (b.updatedAt?.toMillis?.() || 0) -
                (a.updatedAt?.toMillis?.() || 0),
            )
            .map((s) => (
              <article className="history-card" key={s.id}>
                <strong>
                  {name(s.fromFriendId)} paid {name(s.toFriendId)}{" "}
                  {formatMoney(s.amount)}
                </strong>
                <p>
                  {folders.find((f) => f.folder.id === s.folderId)?.folder
                    .name || "Folder"}{" "}
                  · {s.contributionId ? folders.flatMap(f => f.contributions).find(c => c.id === s.contributionId)?.title || "Contribution" : "Legacy folder payment · not applied"}{" "}
                  ·{" "}
                  {s.updatedAt?.toDate?.().toLocaleString("en-PH") ||
                    "Recently"}
                </p>
              </article>
            ))}
        </div>
      )}
    </>
  );
}
function DebtSection({
  title,
  rows,
  action,
  all,
  disabled,
  name,
  subjectId,
  onOne,
  onMany,
  onAll,
  onInspect,
}: {
  title: string;
  rows: ObligationRow[];
  action: string;
  all: string;
  disabled: boolean;
  name: (id: string) => string;
  subjectId: string;
  onOne: (row: ObligationRow) => void;
  onMany: (rows: ObligationRow[]) => void;
  onAll: () => void;
  onInspect: (rows: ObligationRow[]) => void;
}) {
  const [view, setView] = useState<"contribution" | "person">("contribution");
  if (!rows.length) return null;
  const grouped = [...rows.reduce((values, row) => { const other = row.obligation.fromFriendId === subjectId ? row.obligation.toFriendId : row.obligation.fromFriendId; const key = `${row.folder.folder.id}-${other}`; const current = values.get(key); if (current) current.push(row); else values.set(key, [row]); return values; }, new Map<string, ObligationRow[]>()).values()];
  const activate = (event: KeyboardEvent<HTMLDivElement>, values: ObligationRow[]) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onInspect(values); } };
  return (
    <section className="panel settlement-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <div className="settlement-controls"><label>View by<select value={view} onChange={event => setView(event.target.value as "contribution" | "person")}><option value="contribution">Per Contribution</option><option value="person">Per Person</option></select></label><Button variant="secondary" disabled={disabled} onClick={onAll}>{all}</Button></div>
      </div>
      <div className="obligation-list">
        {(view === "contribution" ? rows.map(row => [row]) : grouped).map((values) => {
          const row = values[0], amount = values.reduce((sum, item) => sum + item.obligation.amount, 0), other = row.obligation.fromFriendId === subjectId ? row.obligation.toFriendId : row.obligation.fromFriendId;
          return (
            <div
              className="obligation-row" role="button" tabIndex={0} onClick={() => onInspect(values)} onKeyDown={event => activate(event, values)}
              key={view === "contribution" ? `${row.folder.folder.id}-${row.obligation.contributionId}-${row.obligation.fromFriendId}-${row.obligation.toFriendId}` : `${row.folder.folder.id}-${other}`}
            >
              <span>
                <strong>{view === "contribution" ? row.obligation.contributionTitle : name(other)}</strong>
                <small>{view === "contribution" ? `${formatDate(row.obligation.contributionDate)} · ${row.folder.folder.name}` : `${row.folder.folder.name} · From ${values.length} contribution${values.length === 1 ? "" : "s"}`}</small>
                <small>{name(row.obligation.fromFriendId)} → {name(row.obligation.toFriendId)}</small>
              </span>
              <strong className={moneyDirectionClass(row.obligation.fromFriendId,row.obligation.toFriendId)}>{formatMoney(amount)}</strong>
              <Button disabled={disabled} onClick={(event) => { event.stopPropagation(); if (view === "contribution") onOne(row); else onMany(values); }}>
                {action}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
