"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, LoadingState, Notice } from "@/components/ui/Feedback";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import {
  deleteContribution,
  subscribeContributions,
} from "@/services/contributions";
import { subscribeFriends } from "@/services/friends";
import { getFolder } from "@/services/folders";
import { subscribeSettlements } from "@/services/settlements";
import type { ContributionWithExpenses, Folder } from "@/types";
import { formatDate, friendLabel } from "@/utils/format";
import {
  calculateBalances,
  contributionTotal,
  effectiveExpensePayer,
  folderTotal,
  formatMoney,
  fromCentavos,
  settlementDirections,
  splitCentavos,
} from "@/utils/money";
const tabs = ["contributions", "expenses", "people", "summary"] as const;
type Tab = (typeof tabs)[number];
export default function FolderDetailPage() {
  const { folderId } = useParams<{ folderId: string }>();
  const search = useSearchParams(),
    uid = useAuth().currentUser!.uid;
  const [folder, setFolder] = useState<Folder | null>(),
    [tab, setTab] = useState<Tab>("contributions"),
    [error, setError] = useState<string | null>(null),
    [detail, setDetail] = useState<ContributionWithExpenses | null>(null),
    [expenseDetail, setExpenseDetail] = useState<{
      contribution: ContributionWithExpenses;
      expenseId: string;
    } | null>(null),
    [personId, setPersonId] = useState<string | null>(null),
    [showAll, setShowAll] = useState(false),
    [deleting, setDeleting] = useState(false);
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
    (next: Parameters<typeof subscribeSettlements>[1], fail: NonNullable<Parameters<typeof subscribeSettlements>[2]>) => subscribeSettlements(uid, next, fail),
    [uid],
  );
  const contributions = useCollectionData(contributionSub),
    friends = useCollectionData(friendSub),
    allSettlements = useCollectionData(settlementSub),
    settlements = allSettlements.items.filter((item) => item.folderId === folderId);
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
      if (event.key === "Enter" && !target.matches("input,textarea,select,[contenteditable=true]")) {
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
    ),
    directions = useMemo(
      () => settlementDirections(contributions.items, settlements),
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
  const directionSummary = (id: string) =>
    directions.filter(
      (item) => item.fromFriendId === id || item.toFriendId === id,
    );
  async function remove() {
    if (!detail) return;
    if (!confirm(`Delete ${detail.title} and all of its expense items?`)) return;
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
        <Link
          className="button button-primary folder-action"
          href={`/contributions/new?folder=${folderId}`}
        >
          <Plus size={18} /> Add Contribution
        </Link>
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
                    <h2>{item.title}</h2>
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
            <div className="list">
              {expenses.map(({ contribution, expense }) => (
                <button
                  className="data-row"
                  key={expense.id}
                  onClick={() =>
                    setExpenseDetail({ contribution, expenseId: expense.id })
                  }
                >
                  <div>
                    <small>
                      {formatDate(contribution.date)} · {contribution.title}
                    </small>
                    <h2>{expense.title}</h2>
                    <p>
                      Paid by{" "}
                      {label(effectiveExpensePayer(contribution, expense))} ·{" "}
                      {expense.participantIds.length} people
                    </p>
                  </div>
                  <strong>{formatMoney(expense.amount)}</strong>
                </button>
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
                  .filter((item) => showAll || Math.abs(item.balance) >= 0.005)
                  .map((item) => {
                    const person = friend(item.friendId),
                      flows = directionSummary(item.friendId);
                    return (
                      <button
                        className="data-row"
                        key={item.friendId}
                        onClick={() => setPersonId(item.friendId)}
                      >
                        <div className="person-label">
                          <Avatar
                            name={person?.name || "Unknown"}
                            photoURL={person?.photoURL}
                          />
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
                          <strong
                            className={
                              item.balance >= 0 ? "positive" : "negative"
                            }
                          >
                            {item.balance > 0.004
                              ? `To receive ${formatMoney(item.balance)}`
                              : item.balance < -0.004
                                ? `Owes ${formatMoney(-item.balance)}`
                                : "Settled"}
                          </strong>
                          {flows.length > 0 && (
                            <small>
                              {item.balance < 0 ? "To" : "From"}{" "}
                              {label(
                                item.balance < 0
                                  ? flows[0].toFriendId
                                  : flows[0].fromFriendId,
                              )}
                              {flows.length > 1
                                ? ` + ${flows.length - 1} other${flows.length > 2 ? "s" : ""}`
                                : ""}
                            </small>
                          )}
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
        open={!!detail}
        title={detail?.title || "Contribution"}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <div className="detail-view">
            <p>
              {formatDate(detail.date)} · {payerSummary(detail)}
            </p>
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
      >
        {personId &&
          (() => {
            const value = balances.find((item) => item.friendId === personId)!,
              flows = directionSummary(personId),
              involved = expenses.filter(({ expense }) =>
                expense.participantIds.includes(personId),
              );
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
                      {value.balance < 0 ? "Total Owed" : "To Receive"}
                    </span>
                    <strong>{formatMoney(Math.abs(value.balance))}</strong>
                  </article>
                </div>
                {flows.length > 0 && (
                  <>
                    <h3>{value.balance < 0 ? "Pay to" : "Receive from"}</h3>
                    <div className="share-list">
                      {flows.map((flow, index) => (
                        <div key={index}>
                          <span>
                            {label(
                              value.balance < 0
                                ? flow.toFriendId
                                : flow.fromFriendId,
                            )}
                          </span>
                          <strong>{formatMoney(flow.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <h3>Shared expenses</h3>
                <div className="share-list">
                  {involved.map(({ contribution, expense }) => (
                    <div key={expense.id}>
                      <span>
                        {expense.title}
                        <small>{contribution.title}</small>
                      </span>
                      <strong>
                        {formatMoney(
                          fromCentavos(
                            splitCentavos(
                              expense.amount,
                              expense.participantIds,
                            ).get(personId) || 0,
                          ),
                        )}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
      </Dialog>
    </>
  );
}
