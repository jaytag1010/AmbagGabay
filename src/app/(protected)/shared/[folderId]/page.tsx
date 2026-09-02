"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { ArrowLeft, Plus, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SettlePaymentsDialog } from "@/components/settlements/SettlePaymentsDialog";
import { Field, SelectField } from "@/components/ui/Field";
import { EmptyState, LoadingState, Notice } from "@/components/ui/Feedback";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import { useSharedFolderAccess } from "@/hooks/useSharedFolderAccess";
import {
  deleteSharedContribution,
  requestFolderPeople,
  respondFolderPersonRequest,
  saveSharedContribution,
  recordSharedSettlement,
  subscribeSharedContributions,
  subscribeSharedSettlements,
  subscribeSharedPeople,
  subscribeFolderPersonRequests,
} from "@/services/sharing";
import { subscribeFriends } from "@/services/friends";
import { subscribeFriendGroups } from "@/services/friendGroups";
import type { ContributionWithExpenses, FolderFinancials, Friend } from "@/types";
import { calculateBalances, contributionTotal, effectiveExpensePayer, folderTotal, formatMoney } from "@/utils/money";
import { formatDate } from "@/utils/format";
import { resolveFolderPersonLabel } from "@/utils/sharedIdentity";
type DraftItem = {
  id: string;
  title: string;
  amount: string;
  payerFriendId: string;
  participantIds: string[];
};
export default function SharedFolderPage() {
  const { folderId } = useParams<{ folderId: string }>(),
    auth = useAuth(),
    uid = auth.currentUser!.uid,
    accessState = useSharedFolderAccess(folderId, auth.currentUser!.uid),
    access = accessState.access;
  const contributionSub = useCallback(
    (
      next: Parameters<typeof subscribeSharedContributions>[1],
      fail: Parameters<typeof subscribeSharedContributions>[2],
    ) => subscribeSharedContributions(folderId, next, fail),
    [folderId],
  );
  const peopleSub = useCallback(
    (
      next: Parameters<typeof subscribeSharedPeople>[1],
      fail: Parameters<typeof subscribeSharedPeople>[2],
    ) => subscribeSharedPeople(folderId, next, fail),
    [folderId],
  );
  const settlementsSub = useCallback((next: Parameters<typeof subscribeSharedSettlements>[1], fail: Parameters<typeof subscribeSharedSettlements>[2]) => subscribeSharedSettlements(folderId, next, fail), [folderId]);
  const requestsSub = useCallback((next: Parameters<typeof subscribeFolderPersonRequests>[1], fail: Parameters<typeof subscribeFolderPersonRequests>[2]) => subscribeFolderPersonRequests(folderId, next, fail), [folderId]);
  const friendsSub = useCallback((next: Parameters<typeof subscribeFriends>[1], fail: Parameters<typeof subscribeFriends>[2]) => subscribeFriends(uid, next, fail), [uid]);
  const groupsSub = useCallback((next: Parameters<typeof subscribeFriendGroups>[1], fail: Parameters<typeof subscribeFriendGroups>[2]) => subscribeFriendGroups(uid, next, fail), [uid]);
  const contributions = useCollectionData(access?.canRead ? contributionSub : null),
    people = useCollectionData(access?.canRead ? peopleSub : null),
    settlements = useCollectionData(access?.canRead ? settlementsSub : null),
    requests = useCollectionData(access?.canRead ? requestsSub : null),
    friends = useCollectionData(friendsSub),
    groups = useCollectionData(groupsSub),
    [error, setError] = useState<string | null>(null),
    [editing, setEditing] = useState<ContributionWithExpenses | "new" | null>(
      null,
    ),
    [title, setTitle] = useState(""),
    [payer, setPayer] = useState(""),
    [participants, setParticipants] = useState<string[]>([]),
    [items, setItems] = useState<DraftItem[]>([]),
    [proposing, setProposing] = useState(false),
    [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"contributions" | "expenses" | "people" | "summary">("contributions"),
    [settling, setSettling] = useState(false);
  const folder = access?.folder || null,
    membership = access?.membership,
    canEdit = access?.canEdit || false;
  const pendingRequests = requests.items.filter((item) => item.status === "pending");
  const currentPersonId = people.items.find(item => item.linkedUserId === uid)?.id || (folder?.ownerId === uid ? "me" : ""),
    balances = calculateBalances(contributions.items, settlements.items),
    currentBalance = balances.find(item => item.friendId === currentPersonId),
    settlementFriends = people.items.map(person => ({ id: person.id, name: labelForPerson(person.id), isMe: person.id === currentPersonId, archived: false, linkedUserId: person.linkedUserId || null })) as Friend[];
  const availableFriends = friends.items.filter((friend) => !friend.archived && !people.items.some((person) => person.linkedUserId && person.linkedUserId === (friend.id === "me" ? uid : friend.linkedUserId)));
  const toggleFriend = (id: string) => setSelectedFriendIds(values => values.includes(id) ? values.filter(value => value !== id) : [...values, id]);
  const selectGroup = (friendIds: string[]) => setSelectedFriendIds(values => [...new Set([...values, ...friendIds.filter(id => availableFriends.some(friend => friend.id === id))])]);
  async function submitPeopleRequest() {
    setBusy(true); setError(null);
    try { await requestFolderPeople(uid, auth.currentUser?.displayName || "User", folderId, friends.items.filter(friend => selectedFriendIds.includes(friend.id))); setSelectedFriendIds([]); setProposing(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to send request."); }
    finally { setBusy(false); }
  }
  const label = (id: string) => {
    const person = people.items.find((item) => item.id === id);
    return resolveFolderPersonLabel({ folder: folder!, person, currentUserUid: uid });
  };
  function labelForPerson(id: string) { const person = people.items.find(item => item.id === id); return folder && person ? resolveFolderPersonLabel({ folder, person, currentUserUid: uid }) : "Unknown"; }
  function open(value: ContributionWithExpenses | "new") {
    setEditing(value);
    if (value === "new") {
      const me =
        people.items.find((item) => item.linkedUserId === uid)?.id ||
        people.items[0]?.id ||
        "";
      setTitle("");
      setPayer(me);
      setParticipants(people.items.map((item) => item.id));
      setItems([
        {
          id: crypto.randomUUID(),
          title: "",
          amount: "",
          payerFriendId: me,
          participantIds: people.items.map((item) => item.id),
        },
      ]);
    } else {
      setTitle(value.title);
      setPayer(value.payerFriendId);
      setParticipants(value.participantIds);
      setItems(
        value.expenses.map((item) => ({
          id: item.id,
          title: item.title,
          amount: String(item.amount),
          payerFriendId: item.payerFriendId || value.payerFriendId,
          participantIds: item.participantIds,
        })),
      );
    }
  }
  async function save() {
    if (!folder) return;
    setBusy(true);
    try {
      await saveSharedContribution(
        uid,
        auth.currentUser?.displayName || "User",
        folderId,
        {
          title,
          date: new Date(),
          payerFriendId: payer,
          participantIds: participants,
          expenses: items.map((item) => ({
            title: item.title,
            amount: Number(item.amount),
            payerFriendId: item.payerFriendId,
            participantIds: item.participantIds,
          })),
        },
        editing === "new" ? undefined : editing?.id,
      );
      setEditing(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save contribution.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (accessState.loading)
    return <LoadingState label="Opening shared folder…" />;
  if (!access || !folder || !membership) {
    const copy = accessState.failure === "not-found" ? ["Folder not found.", "The shared Folder may have been deleted."] : accessState.failure === "pending" ? ["This Folder invitation is still pending.", "Accept the invitation first to access the Folder."] : accessState.failure === "removed" ? ["You no longer have access to this Folder.", "The Owner may have removed your membership."] : accessState.failure === "timeout" ? ["This Folder is taking longer than expected to open.", "Check your connection, then try again."] : accessState.failure === "denied" ? ["You don't have access to this Folder.", "Your access could not be verified."] : ["We couldn't open this Folder.", "Your access could not be verified or the Folder could not be loaded."];
    return <EmptyState title={copy[0]} description={copy[1]} action={<div className="row-actions"><Button onClick={accessState.retry}>Retry</Button><Link className="button button-secondary" href="/">Back to Home</Link></div>} />;
  }
  if (contributions.loading || people.loading || settlements.loading)
    return <LoadingState label="Loading Folder content…" />;
  return (
    <>
      <Link href="/" className="back-link">
        <ArrowLeft size={18} /> Home
      </Link>
      <header className="folder-hero">
        <span>{folder.icon || "📁"}</span>
        <div>
          <p>Shared by {folder.ownerNameSnapshot}</p>
          <h1>{folder.name}</h1>
          <small>
            {membership.role === "viewer"
              ? "Viewer access · Read only"
              : `${membership.role[0].toUpperCase() + membership.role.slice(1)} access`}
          </small>
        </div>
        {membership.role === "owner" && (
          <Link
            className="button button-secondary folder-action"
            href={`/shared/${folderId}/sharing`}
          >
            Manage Sharing
          </Link>
        )}
        <Button variant="secondary" disabled={!canEdit} onClick={() => setSettling(true)}>{canEdit ? "Settle Payments" : "Settle Payments · Read only"}</Button>
        {canEdit && (
          <Button onClick={() => open("new")}>
            <Plus size={17} /> Add Contribution
          </Button>
        )}
      </header>
      <Notice message={contributions.error || people.error || settlements.error || error} />
      {canEdit && (
        <section className="panel people-request-panel">
          <div className="section-heading"><div><h2>Folder People</h2><p>Editors may propose personal friends. The owner approves them before they can be used.</p></div><Button variant="secondary" onClick={() => setProposing(true)}><UserPlus size={17} /> Propose People</Button></div>
          {membership.role === "owner" && pendingRequests.length > 0 && <div className="request-list">{pendingRequests.map(request => <article className="request-card" key={request.id}><div><strong>{request.proposerNameSnapshot}</strong><p>{request.people.map(person => person.displayNameSnapshot).join(", ")}</p></div><div className="row-actions"><Button variant="secondary" disabled={busy} onClick={() => respondFolderPersonRequest(uid, folder, request, false).catch(cause => setError(cause.message))}>Reject</Button><Button disabled={busy} onClick={() => respondFolderPersonRequest(uid, folder, request, true).catch(cause => setError(cause.message))}>Approve</Button></div></article>)}</div>}
          {membership.role !== "owner" && pendingRequests.some(request => request.proposerUid === uid) && <small>Your pending proposals are awaiting the owner’s review.</small>}
        </section>
      )}
      <div className="tabs" role="tablist">{(["contributions","expenses","people","summary"] as const).map(value => <button role="tab" aria-selected={tab === value} className={tab === value ? "active" : ""} onClick={() => setTab(value)} key={value}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      <section className="tab-panel">
      {tab === "contributions" && (!contributions.items.length ? (
        <EmptyState
          title="No contributions yet"
          description="Shared contributions will appear here."
        />
      ) : (
        <div className="list">
          {contributions.items.map((item) => (
            <article
              className="data-row"
              key={item.id}
              onClick={() => canEdit && open(item)}
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
              </div>
              <strong>{formatMoney(contributionTotal(item))}</strong>
            </article>
          ))}
        </div>
      ))}
      {tab === "expenses" && (!contributions.items.length ? <EmptyState title="No expenses yet" description="Expense items will appear after a Contribution is added." /> : <div className="contribution-expense-groups">{contributions.items.map(contribution => <article className="contribution-expense-group" key={contribution.id}><header><div><h2 className="contribution-title">{contribution.title}</h2><p>{formatDate(contribution.date)}</p></div><strong>{formatMoney(contributionTotal(contribution))}</strong></header><div className="grouped-expense-list">{contribution.expenses.map(expense => <div className="grouped-expense-row" key={expense.id}><span><strong>{expense.title}</strong><small>Paid by {label(effectiveExpensePayer(contribution, expense))} · {expense.participantIds.length} people</small></span><strong>{formatMoney(expense.amount)}</strong></div>)}</div></article>)}</div>)}
      {tab === "people" && (!balances.length ? <EmptyState title="No balances yet" description="Balances will appear after shared expenses are recorded." /> : <div className="list">{balances.map(item => <article className="data-row" key={item.friendId}><div><h2>{label(item.friendId)}</h2><p>Paid {formatMoney(item.paid)} · Share {formatMoney(item.share)}</p></div><strong className={item.balance > 0 ? "money-incoming" : item.balance < 0 ? "money-outgoing" : "money-neutral"}>{item.balance > 0 ? `To receive ${formatMoney(item.balance)}` : item.balance < 0 ? `Owes ${formatMoney(-item.balance)}` : "Settled"}</strong></article>)}</div>)}
      {tab === "summary" && <div className="summary-grid"><article className="metric"><span>Total Expenses</span><strong>{formatMoney(folderTotal(contributions.items))}</strong></article><article className="metric"><span>Contributions</span><strong>{contributions.items.length}</strong></article><article className="metric"><span>You Paid</span><strong>{formatMoney(currentBalance?.paid || 0)}</strong></article><article className="metric"><span>Your Share</span><strong>{formatMoney(currentBalance?.share || 0)}</strong></article><article className="metric"><span>Current Balance</span><strong className={(currentBalance?.balance || 0) >= 0 ? "money-incoming" : "money-outgoing"}>{formatMoney(Math.abs(currentBalance?.balance || 0))}</strong></article></div>}
      </section>
      {currentPersonId && <SettlePaymentsDialog open={settling} onClose={() => setSettling(false)} uid={uid} userName={auth.currentUser?.displayName || "User"} friends={settlementFriends} financials={[{ folder, contributions: contributions.items, settlements: settlements.items } as FolderFinancials]} folderId={folder.id} currentPersonId={currentPersonId} recordAllocation={allocation => recordSharedSettlement(uid, folder.id, allocation)} />}
      <Dialog
        open={proposing}
        title="Propose People"
        onClose={() => setProposing(false)}
      >
        <div className="dialog-form">
          <p className="muted-copy">Choose individual friends or use a personal group as a selection shortcut. Only these snapshots are shared with the folder owner.</p>
          {!!groups.items.length && <div className="group-shortcuts">{groups.items.map(group => <Button key={group.id} variant="ghost" onClick={() => selectGroup(group.friendIds)}>{group.name}</Button>)}</div>}
          <div className="proposal-people-list">{availableFriends.map((friend: Friend) => <label className="check-control" key={friend.id}><input type="checkbox" checked={selectedFriendIds.includes(friend.id)} onChange={() => toggleFriend(friend.id)} /><span>{friend.id === "me" ? `Me (${auth.currentUser?.displayName || friend.name})` : friend.name}</span></label>)}</div>
          {!availableFriends.length && <Notice message="All available linked people are already in this folder." />}
          <div className="dialog-actions"><span /><Button variant="secondary" onClick={() => setProposing(false)}>Cancel</Button><Button disabled={busy || !selectedFriendIds.length} onClick={submitPeopleRequest}>Send for Approval</Button></div>
        </div>
      </Dialog>
      <Dialog
        open={!!editing}
        title={
          editing === "new"
            ? "Add Shared Contribution"
            : "Edit Shared Contribution"
        }
        onClose={() => setEditing(null)}
      >
        <div className="dialog-form">
          <Field
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <SelectField
            label="Default paid by"
            value={payer}
            onChange={(event) => setPayer(event.target.value)}
          >
            {people.items.map((person) => (
              <option key={person.id} value={person.id}>
                {label(person.id)}
              </option>
            ))}
          </SelectField>
          {items.map((item, index) => (
            <section className="expense-item-card" key={item.id}>
              <h3>Expense Item {index + 1}</h3>
              <Field
                label="Item"
                value={item.title}
                onChange={(event) =>
                  setItems((values) =>
                    values.map((value) =>
                      value.id === item.id
                        ? { ...value, title: event.target.value }
                        : value,
                    ),
                  )
                }
              />
              <Field
                label="Amount"
                type="number"
                min="0.01"
                step="0.01"
                value={item.amount}
                onChange={(event) =>
                  setItems((values) =>
                    values.map((value) =>
                      value.id === item.id
                        ? { ...value, amount: event.target.value }
                        : value,
                    ),
                  )
                }
              />
              <SelectField
                label="Paid by"
                value={item.payerFriendId}
                onChange={(event) =>
                  setItems((values) =>
                    values.map((value) =>
                      value.id === item.id
                        ? { ...value, payerFriendId: event.target.value }
                        : value,
                    ),
                  )
                }
              >
                {people.items.map((person) => (
                  <option key={person.id} value={person.id}>
                    {label(person.id)}
                  </option>
                ))}
              </SelectField>
            </section>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              setItems((values) => [
                ...values,
                {
                  id: crypto.randomUUID(),
                  title: "",
                  amount: "",
                  payerFriendId: payer,
                  participantIds: [...participants],
                },
              ])
            }
          >
            <Plus size={17} /> Add Another Item
          </Button>
          <div className="dialog-actions">
            {editing !== "new" && (
              <Button
                variant="danger"
                onClick={async () => {
                  if (editing && confirm(`Delete ${editing.title}?`)) {
                    await deleteSharedContribution(uid, folderId, editing.id);
                    setEditing(null);
                  }
                }}
              >
                <Trash2 size={17} /> Delete
              </Button>
            )}
            <span />
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
