"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import { FriendAvatar } from "@/components/ui/FriendAvatar";
import { SettlePaymentsDialog } from "@/components/settlements/SettlePaymentsDialog";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, LoadingState, Notice } from "@/components/ui/Feedback";
import { SelectField } from "@/components/ui/Field";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import {
  deleteContribution,
  subscribeContributions,
} from "@/services/contributions";
import { subscribeFriends } from "@/services/friends";
import { subscribeFriendGroups } from "@/services/friendGroups";
import { getFolder } from "@/services/folders";
import { subscribeSettlements } from "@/services/settlements";
import { inviteToFolder } from "@/services/sharing";
import type { ContributionWithExpenses, Folder } from "@/types";
import { formatDate, friendLabel } from "@/utils/format";
import {
  calculateBalances,
  contributionObligations,
  contributionTotal,
  effectiveExpensePayer,
  folderTotal,
  formatMoney,
  fromCentavos,
  getActivePairRelationships,
  getPairNetBalance,
  settlementDirections,
  splitCentavos,
} from "@/utils/money";
const tabs = ["contributions", "expenses", "people", "summary"] as const;
type Tab = (typeof tabs)[number];
export default function FolderDetailPage() {
  const { folderId } = useParams<{ folderId: string }>();
  const search = useSearchParams(),
    auth = useAuth(),
    uid = auth.currentUser!.uid;
  const [folder, setFolder] = useState<Folder | null>(),
    [tab, setTab] = useState<Tab>("contributions"),
    [error, setError] = useState<string | null>(null),
    [detail, setDetail] = useState<ContributionWithExpenses | null>(null),
    [expenseDetail, setExpenseDetail] = useState<{
      contribution: ContributionWithExpenses;
      expenseId: string;
    } | null>(null),
    [personId, setPersonId] = useState<string | null>(null),
    [friendBreakdown, setFriendBreakdown] = useState<{ friendId: string; contributionId: string } | null>(null),
    [showAll, setShowAll] = useState(false),
    [deleting, setDeleting] = useState(false),
    [sharing, setSharing] = useState(false),
    [shareFriendId, setShareFriendId] = useState(""),
    [shareRole, setShareRole] = useState<"editor" | "viewer">("editor"),
    [sharingBusy, setSharingBusy] = useState(false),
    [shareError, setShareError] = useState<string | null>(null),
    [shareSuccess, setShareSuccess] = useState<string | null>(null),
    [settling, setSettling] = useState(false),
    [sharedFolderId, setSharedFolderId] = useState<string | null>(null);
  const contributionSub = useCallback(
    (
      next: Parameters<typeof subscribeContributions>[2],
      fail: Parameters<typeof subscribeContributions>[3],
    ) => subscribeContributions(uid, folderId, next, fail),
    [uid, folderId],
  );
  const friendSub = useCallback(
    (
      next: Parameters<typeof subscribeFriends>[1],
      fail: Parameters<typeof subscribeFriends>[2],
    ) => subscribeFriends(uid, next, fail),
    [uid],
  );
  const settlementSub = useCallback(
    (
      next: Parameters<typeof subscribeSettlements>[1],
      fail: NonNullable<Parameters<typeof subscribeSettlements>[2]>,
    ) => subscribeSettlements(uid, next, fail),
    [uid],
  );
  const groupSub=useCallback((next:Parameters<typeof subscribeFriendGroups>[1],fail:Parameters<typeof subscribeFriendGroups>[2])=>subscribeFriendGroups(uid,next,fail),[uid]);
  const contributions = useCollectionData(contributionSub),
    friends = useCollectionData(friendSub),
    groups=useCollectionData(groupSub),
    allSettlements = useCollectionData(settlementSub),
    settlements = allSettlements.items.filter(
      (item) => item.folderId === folderId,
    );
  useEffect(() => {
    getFolder(uid, folderId)
      .then(setFolder)
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Unable to open folder.",
        ),
      );
  }, [uid, folderId]);
  useEffect(() => {
    const id = search.get("contribution");
    if (id && contributions.items.length)
      setDetail(contributions.items.find((item) => item.id === id) || null);
  }, [search, contributions.items]);
  useEffect(() => {
    if (!detail) return;
    const dismiss = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === "Enter" &&
        !target.matches("input,textarea,select,[contenteditable=true]")
      ) {
        event.preventDefault();
        setDetail(null);
      }
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [detail]);
  const balances = useMemo(
      () => calculateBalances(contributions.items, settlements),
      [contributions.items, settlements],
    );
  const friend = (id: string) => friends.items.find((item) => item.id === id);
  const label = (id: string) =>
    friend(id) ? friendLabel(friend(id)!) : "Unknown";
  const expenses = contributions.items.flatMap((contribution) =>
    contribution.expenses.map((expense) => ({ contribution, expense })),
  );
  const total = folderTotal(contributions.items),
    me = balances.find((item) => item.friendId === "me");
  const activeRelationships = getActivePairRelationships(contributions.items, settlements);
  const linkedFriends=friends.items.filter(item=>!item.archived&&!item.isMe&&!!item.linkedUserId);
  const pairWithMe = (id:string) => getPairNetBalance(contributions.items, settlements, "me", id);
  const meIncoming = activeRelationships.filter(item=>item.toFriendId==="me"), meOutgoing=activeRelationships.filter(item=>item.fromFriendId==="me");
  async function remove() {
    if (!detail) return;
    if (!confirm(`Delete ${detail.title} and all of its expense items?`))
      return;
    setDeleting(true);
    try {
      await deleteContribution(uid, folderId, detail.id);
      setDetail(null);
    } catch {
      setError("Unable to delete contribution.");
    } finally {
      setDeleting(false);
    }
  }
  function payerSummary(item: ContributionWithExpenses) {
    const payers = [
      ...new Set(
        item.expenses.map((expense) => effectiveExpensePayer(item, expense)),
      ),
    ];
    return payers.length === 1
      ? `Paid by ${label(payers[0])}`
      : `Paid by ${payers.length} people`;
  }
  if (folder === undefined || contributions.loading || friends.loading)
    return <LoadingState label="Opening folder…" />;
  if (!folder)
    return (
      <>
        <Notice message={error || "Folder not found."} />
        <Link href="/" className="text-link">
          <ArrowLeft size={18} /> Back to folders
        </Link>
      </>
    );
  return (
    <>
      <Link href="/" className="back-link">
        <ArrowLeft size={18} /> All folders
      </Link>
      <header className="folder-hero">
        <span>{folder.icon || "📁"}</span>
        <div>
          <p>Folder</p>
          <h1>{folder.name}</h1>
        </div>
        <div className="header-actions folder-action">
          <Button variant="secondary" onClick={() => setSettling(true)}>
            Settle Payments
          </Button>
          <Button variant="secondary" onClick={() => {setShareError(null);setShareSuccess(null);setSharing(true)}}>
            <Share2 size={18} /> Share
          </Button>
          <Link
            className="button button-primary"
            href={`/contributions/new?folder=${folderId}`}
          >
            <Plus size={18} /> Add Contribution
          </Link>
        </div>
      </header>
      <Notice message={contributions.error || friends.error || error} />
      <div className="tabs" role="tablist">
        {tabs.map((item) => (
          <button
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
            key={item}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      <section className="tab-panel">
        {tab === "contributions" &&
          (!contributions.items.length ? (
            <EmptyState
              title="No contributions yet"
              description="Record your first shared expense."
              action={
                <Link
                  className="button button-primary"
                  href={`/contributions/new?folder=${folderId}`}
                >
                  <Plus size={18} /> Add Contribution
                </Link>
              }
            />
          ) : (
            <div className="list">
              {contributions.items.map((item) => (
                <button
                  className="data-row"
                  key={item.id}
                  onClick={() => setDetail(item)}
                >
                  <div>
                    <small>{formatDate(item.date)}</small>
                    <h2 className="contribution-title">{item.title}</h2>
                    {item.createdByUserId && (
                      <p>
                        Created by{" "}
                        {item.createdByUserId === uid
                          ? "You"
                          : item.createdByNameSnapshot || "Unknown"}
                      </p>
                    )}
                    <p>{payerSummary(item)}</p>
                  </div>
                  <div>
                    <strong>{formatMoney(contributionTotal(item))}</strong>
                    <small>{item.participantIds.length} people</small>
                  </div>
                </button>
              ))}
            </div>
          ))}
        {tab === "expenses" &&
          (!expenses.length ? (
            <EmptyState
              title="No expenses yet"
              description="Expense items will appear here after you add a contribution."
            />
          ) : (
            <div className="contribution-expense-groups">
              {contributions.items.map((contribution) => (
                <article className="contribution-expense-group" key={contribution.id}>
                  <header><div><h2 className="contribution-title">{contribution.title}</h2><p>{formatDate(contribution.date)}{contribution.createdByUserId ? ` · Created by ${contribution.createdByUserId === uid ? "You" : contribution.createdByNameSnapshot || "Unknown"}` : ""}</p></div><strong>{formatMoney(contributionTotal(contribution))} total · {contribution.expenses.length} item{contribution.expenses.length === 1 ? "" : "s"}</strong></header>
                  <div className="grouped-expense-list">
                    {contribution.expenses.map(expense => <button className="grouped-expense-row" key={expense.id} onClick={() => setExpenseDetail({ contribution, expenseId: expense.id })}><span><strong>{expense.title}</strong><small>Paid by {label(effectiveExpensePayer(contribution, expense))} · {expense.participantIds.length} people</small></span><strong>{formatMoney(expense.amount)}</strong></button>)}
                  </div>
                </article>
              ))}
            </div>
          ))}
        {tab === "people" &&
          (!balances.length ? (
            <EmptyState
              title="No balances yet"
              description="Balances will appear after shared expenses are recorded."
            />
          ) : (
            <>
              <label className="check-control">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(event) => setShowAll(event.target.checked)}
                />{" "}
                Show settled / zero balances
              </label>
              <div className="list">
                {balances
                  .filter((item) => showAll || (item.friendId === "me" ? meIncoming.length > 0 || meOutgoing.length > 0 : pairWithMe(item.friendId).netCentavos !== 0))
                  .map((item) => {
                    const person = friend(item.friendId),
                      pair = item.friendId === "me" ? null : pairWithMe(item.friendId),
                      incomingTotal=meIncoming.reduce((sum,value)=>sum+value.amountCentavos,0), outgoingTotal=meOutgoing.reduce((sum,value)=>sum+value.amountCentavos,0);
                    return (
                      <button
                        className="data-row"
                        key={item.friendId}
                        onClick={() => setPersonId(item.friendId)}
                      >
                        <div className="person-label">
                          <FriendAvatar friend={person} />
                          <div>
                            <h2>
                              {person ? friendLabel(person) : "Unknown"}
                              {person?.archived ? " · Archived" : ""}
                            </h2>
                            <p>
                              Paid {formatMoney(item.paid)} · Share{" "}
                              {formatMoney(item.share)}
                            </p>
                          </div>
                        </div>
                        <div>
                          {item.friendId === "me" ? <>{incomingTotal>0&&<strong className="money-incoming">To receive {formatMoney(fromCentavos(incomingTotal))} from {meIncoming.length===1?label(meIncoming[0].fromFriendId):`${meIncoming.length} people`}</strong>}{outgoingTotal>0&&<strong className="money-outgoing">You owe {formatMoney(fromCentavos(outgoingTotal))} to {meOutgoing.length===1?label(meOutgoing[0].toFriendId):`${meOutgoing.length} people`}</strong>}{!incomingTotal&&!outgoingTotal&&<strong className="money-neutral">Settled</strong>}</> : <><strong className={pair!.netCentavos>0?"money-incoming":pair!.netCentavos<0?"money-outgoing":"money-neutral"}>{pair!.netCentavos>0?`Owes ${formatMoney(fromCentavos(pair!.netCentavos))}`:pair!.netCentavos<0?`To receive ${formatMoney(fromCentavos(-pair!.netCentavos))}`:"Settled"}</strong>{pair!.netCentavos!==0&&<small>{pair!.netCentavos>0?"To":"From"} {label("me")}</small>}</>}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </>
          ))}
        {tab === "summary" &&
          (!contributions.items.length ? (
            <EmptyState
              title="No summary yet"
              description="Folder totals will appear after shared expenses are recorded."
            />
          ) : (
            <div className="summary-grid">
              <article className="metric">
                <span>Total Expenses</span>
                <strong>{formatMoney(total)}</strong>
              </article>
              <article className="metric">
                <span>You Paid</span>
                <strong>{formatMoney(me?.paid || 0)}</strong>
              </article>
              <article className="metric">
                <span>Your Share</span>
                <strong>{formatMoney(me?.share || 0)}</strong>
              </article>
              <article className="metric">
                <span>You Owe</span>
                <strong>
                  {formatMoney(me && me.balance < 0 ? -me.balance : 0)}
                </strong>
              </article>
              <article className="metric">
                <span>You Should Receive</span>
                <strong>
                  {formatMoney(me && me.balance > 0 ? me.balance : 0)}
                </strong>
              </article>
            </div>
          ))}
      </section>
      <Dialog
        open={sharing}
        title="Share Folder"
        onClose={() => {setSharing(false);setShareError(null);setShareSuccess(null)}}
      >
        <Notice message={shareError} />
        {shareSuccess && <p className="positive"><strong>{shareSuccess}</strong></p>}
        {linkedFriends.length ? <SelectField label="Friend" value={shareFriendId} onChange={event=>setShareFriendId(event.target.value)}><option value="">Select linked Friend</option>{linkedFriends.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</SelectField> : <div><p><strong>No linked Friends available.</strong></p><p className="muted-copy">Link a Friend to an AmbagGabay account first before sharing this Folder.</p><Link className="text-link" href="/friends">Go to Friends</Link></div>}
        <SelectField
          label="Role"
          value={shareRole}
          onChange={(event) =>
            setShareRole(event.target.value as "editor" | "viewer")
          }
        >
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </SelectField>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => {setSharing(false);setShareError(null);setShareSuccess(null)}}>
            Cancel
          </Button>
          <span />
          {sharedFolderId && (
            <Link
              className="button button-secondary"
              href={`/shared/${sharedFolderId}/sharing`}
            >
              Manage Sharing
            </Link>
          )}
          <Button
            disabled={sharingBusy||!shareFriendId}
            onClick={async () => {
              if (!folder) return;
              setSharingBusy(true);
              setShareError(null);
              setShareSuccess(null);
              try {
                const selected=friends.items.find(item=>item.id===shareFriendId);if(!selected)return;
                const involved=(folder.participantFriendIds||[]).includes(selected.id)||groups.items.find(group=>group.id===folder.defaultFriendGroupId)?.friendIds.includes(selected.id)||contributions.items.some(c=>c.participantIds.includes(selected.id)||c.payerFriendId===selected.id||c.expenses.some(e=>e.participantIds.includes(selected.id)||effectiveExpensePayer(c,e)===selected.id))||settlements.some(s=>s.fromFriendId===selected.id||s.toFriendId===selected.id);
                if(!involved&&!confirm(`This person is not currently involved in this Folder.\n\n${selected.name} is not part of the Folder's selected people and does not appear in any current Contribution or Expense.\n\nSharing will give them access to this Folder.\n\nProceed?`))return;
                const result = await inviteToFolder(
                  uid,
                  folder,
                  auth.currentUser!.displayName || "User",
                  selected,
                  shareRole,
                );
                setSharedFolderId(result.folderId);
                setShareSuccess("Invitation sent.");
              } catch (cause) {
                setShareError(
                  cause instanceof Error
                    ? cause.message
                    : "Unable to send invitation.",
                );
              } finally {
                setSharingBusy(false);
              }
            }}
          >
            Send Invitation
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={!!detail}
        title={detail?.title || "Contribution"}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <div className="detail-view">
            <p>
              {formatDate(detail.date)} · {payerSummary(detail)}
            </p>
            {detail.createdByUserId && (
              <p>
                Created by{" "}
                {detail.createdByUserId === uid
                  ? "You"
                  : detail.createdByNameSnapshot || "Unknown"}
              </p>
            )}
            <h3>{formatMoney(contributionTotal(detail))} total</h3>
            <div className="detail-expenses">
              {detail.expenses.map((expense) => (
                <button
                  key={expense.id}
                  onClick={() => {
                    setExpenseDetail({
                      contribution: detail,
                      expenseId: expense.id,
                    });
                    setDetail(null);
                  }}
                >
                  <span>
                    {expense.title}
                    <small>
                      Paid by {label(effectiveExpensePayer(detail, expense))} ·{" "}
                      {expense.participantIds.length} people
                    </small>
                  </span>
                  <strong>{formatMoney(expense.amount)}</strong>
                </button>
              ))}
            </div>
            <div className="dialog-actions">
              <Button variant="danger" disabled={deleting} onClick={remove}>
                <Trash2 size={17} /> Delete
              </Button>
              <span />
              <Link
                className="button button-secondary"
                href={`/contributions/new?folder=${folderId}&edit=${detail.id}`}
              >
                <Pencil size={17} /> Edit
              </Link>
              <Button onClick={() => setDetail(null)}>Okay</Button>
            </div>
          </div>
        )}
      </Dialog>
      <Dialog
        open={!!expenseDetail}
        title={
          expenseDetail?.contribution.expenses.find(
            (item) => item.id === expenseDetail.expenseId,
          )?.title || "Expense"
        }
        onClose={() => setExpenseDetail(null)}
      >
        {expenseDetail &&
          (() => {
            const expense = expenseDetail.contribution.expenses.find(
                (item) => item.id === expenseDetail.expenseId,
              )!,
              shares = splitCentavos(expense.amount, expense.participantIds);
            return (
              <div className="detail-view">
                <h3>{formatMoney(expense.amount)}</h3>
                <p>
                  Paid by{" "}
                  {label(
                    effectiveExpensePayer(expenseDetail.contribution, expense),
                  )}{" "}
                  · Shared by {expense.participantIds.length} people
                </p>
                <div className="share-list">
                  {[...shares].map(([id, cents]) => (
                    <div key={id}>
                      <span>{label(id)}</span>
                      <strong>{formatMoney(fromCentavos(cents))}</strong>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
      </Dialog>
      <Dialog
        open={!!personId}
        title={personId ? label(personId) : "Person details"}
        onClose={() => setPersonId(null)}
        wide
      >
        {personId &&
          (() => {
            const value = balances.find((item) => item.friendId === personId)!,
              pair = personId === "me" ? null : pairWithMe(personId),
              involved = expenses.filter(({ contribution, expense }) =>
                expense.participantIds.includes(personId) || effectiveExpensePayer(contribution, expense) === personId,
              ),
              grouped = [...involved.reduce((values, entry) => {
                const existing = values.get(entry.contribution.id);
                const share = fromCentavos(splitCentavos(entry.expense.amount, entry.expense.participantIds).get(personId) || 0);
                const relevantAmount = share || (effectiveExpensePayer(entry.contribution, entry.expense) === personId ? entry.expense.amount : 0);
                if (existing) { existing.items.push({ expense: entry.expense, share: relevantAmount }); existing.subtotal += relevantAmount; }
                else values.set(entry.contribution.id, { contribution: entry.contribution, items: [{ expense: entry.expense, share: relevantAmount }], subtotal: relevantAmount });
                return values;
              }, new Map<string, { contribution: ContributionWithExpenses; items: Array<{ expense: ContributionWithExpenses["expenses"][number]; share: number }>; subtotal: number }>()).values()];
            const expenseStatus = (contribution: ContributionWithExpenses) => {
              const remaining = contributionObligations([contribution], settlements);
              const relevantRemaining = remaining.filter(obligation => personId === "me"
                ? obligation.fromFriendId === "me" || obligation.toFriendId === "me"
                : (obligation.fromFriendId === "me" && obligation.toFriendId === personId) || (obligation.toFriendId === "me" && obligation.fromFriendId === personId));
              const original = settlementDirections([contribution]);
              const relevantOriginal = original.filter(flow => personId === "me"
                ? flow.fromFriendId === "me" || flow.toFriendId === "me"
                : (flow.fromFriendId === "me" && flow.toFriendId === personId) || (flow.toFriendId === "me" && flow.fromFriendId === personId));
              const displayFlows = relevantRemaining.length ? relevantRemaining : relevantOriginal;
              const incoming = displayFlows.filter(flow => flow.toFriendId === "me").reduce((sum, flow) => sum + flow.amount, 0);
              const outgoing = displayFlows.filter(flow => flow.fromFriendId === "me").reduce((sum, flow) => sum + flow.amount, 0);
              return { active: relevantRemaining.length > 0, amount: Math.abs(incoming - outgoing), direction: incoming > outgoing ? "money-incoming" : outgoing > incoming ? "money-outgoing" : "money-neutral" };
            };
            return (
              <div className="detail-view">
                <div className="summary-grid compact">
                  <article className="metric">
                    <span>Total Paid</span>
                    <strong>{formatMoney(value.paid)}</strong>
                  </article>
                  <article className="metric">
                    <span>Expense Share</span>
                    <strong>{formatMoney(value.share)}</strong>
                  </article>
                  <article className="metric">
                    <span>
                      {!pair ? "Net Position" : pair.netCentavos > 0 ? "Total Owed" : "To Receive"}
                    </span>
                    <strong className={!pair?"money-neutral":pair.netCentavos>0?"money-incoming":pair.netCentavos<0?"money-outgoing":"money-neutral"}>{formatMoney(!pair?Math.abs(value.balance):fromCentavos(Math.abs(pair.netCentavos)))}</strong>
                  </article>
                </div>
                {pair && pair.netCentavos !== 0 && (
                  <>
                    <h3>{pair.netCentavos > 0 ? "Receive from" : "Pay to"}</h3>
                    <div className="share-list">
                      <div><span>{pair.netCentavos > 0 ? label(personId) : label("me")}</span><strong className={pair.netCentavos>0?"money-incoming":"money-outgoing"}>{formatMoney(fromCentavos(Math.abs(pair.netCentavos)))}</strong></div>
                    </div>
                  </>
                )}
                {[{title:"Active Shared Expenses",items:grouped.filter(group=>expenseStatus(group.contribution).active)},{title:"Settled Shared Expenses",items:grouped.filter(group=>!expenseStatus(group.contribution).active)}].map(section=><section key={section.title}><h3>{section.title} ({section.items.length})</h3>{section.items.length?<div className="expense-groups">
                  {section.items.map(({ contribution, items, subtotal }) => { const status=expenseStatus(contribution); return (
                    <section className="expense-group" key={contribution.id}>
                      <button type="button" className="expense-group-card" onClick={() => { setFriendBreakdown({ friendId: personId, contributionId: contribution.id }); setPersonId(null); }}>
                      <header><strong>{contribution.title}</strong><span className={status.direction}>{formatMoney(status.amount||subtotal)}</span></header>
                      <small>{formatDate(contribution.date)}</small>
                      {section.title.startsWith("Settled")&&<small className="settled-badge">✓ Settled</small>}
                      <div className="share-list">
                        {[...items].sort((a, b) => b.share - a.share).slice(0, 5).map(({ expense, share }) => <div key={expense.id}><span>{expense.title}</span><strong>{formatMoney(share)}</strong></div>)}
                      </div>
                      {items.length > 5 && <span className="more-items">+ {items.length - 5} more item{items.length - 5 === 1 ? "" : "s"}</span>}
                      </button>
                    </section>
                  )})}
                </div>:<p className="muted-copy">No {section.title.toLowerCase()}.</p>}</section>)}
              </div>
            );
          })()}
      </Dialog>
      <Dialog
        open={!!friendBreakdown}
        wide
        title={contributions.items.find(item => item.id === friendBreakdown?.contributionId)?.title || "Contribution breakdown"}
        onClose={() => { const id = friendBreakdown?.friendId || null; setFriendBreakdown(null); setPersonId(id); }}
      >
        {friendBreakdown && (() => {
          const contribution = contributions.items.find(item => item.id === friendBreakdown.contributionId);
          if (!contribution) return <Notice message="This contribution is no longer available." />;
          const relevant = contribution.expenses.filter(expense => expense.participantIds.includes(friendBreakdown.friendId)).map(expense => ({ expense, share: fromCentavos(splitCentavos(expense.amount, expense.participantIds).get(friendBreakdown.friendId) || 0) })).sort((a, b) => b.share - a.share);
          const friendShare = relevant.reduce((sum, item) => sum + item.share, 0);
          return <div className="friend-breakdown">
            <p className="muted-copy">{formatDate(contribution.date)} · Created by {contribution.createdByUserId === uid ? "You" : contribution.createdByNameSnapshot || "Unknown"}</p>
            <div className="summary-grid"><article className="metric"><span>Contribution Total</span><strong>{formatMoney(contributionTotal(contribution))}</strong></article><article className="metric"><span>{label(friendBreakdown.friendId)} Share</span><strong>{formatMoney(friendShare)}</strong></article></div>
            <div className="breakdown-items">{relevant.map(({ expense, share }) => <article className="breakdown-item" key={expense.id}><h3>{expense.title}</h3><div className="breakdown-metrics"><span>Full Expense<strong>{formatMoney(expense.amount)}</strong></span><span>Friend Share<strong>{formatMoney(share)}</strong></span><span>Paid by<strong>{label(effectiveExpensePayer(contribution, expense))}</strong></span><span>Shared by<strong>{expense.participantIds.length} people</strong></span></div></article>)}</div>
          </div>;
        })()}
      </Dialog>
      <SettlePaymentsDialog open={settling} onClose={()=>setSettling(false)} uid={uid} userName={auth.currentUser?.displayName||"User"} friends={friends.items} financials={[{folder,contributions:contributions.items,settlements}]} folderId={folderId}/>
    </>
  );
}
