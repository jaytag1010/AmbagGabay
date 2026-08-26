"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, RotateCcw } from "lucide-react";
import { FriendAvatar } from "@/components/ui/FriendAvatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { EmptyState, LoadingState, Notice } from "@/components/ui/Feedback";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import { getFinancialOverview } from "@/services/financials";
import { setFriendArchived, subscribeFriends } from "@/services/friends";
import { recordSettlement } from "@/services/settlements";
import {
  findAccount,
  linkFriend,
  unlinkFriend,
} from "@/services/identityLinks";
import type {
  FolderFinancials,
  PublicProfile,
  SettlementDirection,
} from "@/types";
import { formatDate, friendLabel } from "@/utils/format";
import {
  calculateBalances,
  effectiveExpensePayer,
  formatMoney,
  fromCentavos,
  settlementDirections,
  splitCentavos,
} from "@/utils/money";

export default function FriendDetailsPage() {
  const { friendId } = useParams<{ friendId: string }>(),
    uid = useAuth().currentUser!.uid;
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
  const rows = folders.flatMap((item) =>
    settlementDirections(item.contributions, item.settlements)
      .filter(
        (flow) =>
          flow.fromFriendId === friendId || flow.toFriendId === friendId,
      )
      .map((flow) => ({ folder: item, flow })),
  );
  const owes = rows.filter((row) => row.flow.fromFriendId === friendId),
    receives = rows.filter((row) => row.flow.toFriendId === friendId);
  const name = (id: string) =>
    friends.items.find((item) => item.id === id)?.name || "Unknown";
  const previous = (folder: FolderFinancials, flow: SettlementDirection) =>
    folder.settlements.find(
      (item) =>
        item.fromFriendId === flow.fromFriendId &&
        item.toFriendId === flow.toFriendId,
    )?.amount || 0;
  async function settle(
    row: (typeof rows)[number],
    source: "individual" | "all",
  ) {
    const { flow, folder } = row;
    await recordSettlement(uid, {
      folderId: folder.folder.id,
      fromFriendId: flow.fromFriendId,
      toFriendId: flow.toFriendId,
      amount: flow.amount,
      expectedPreviouslySettled: previous(folder, flow),
      source,
      description: `${name(flow.fromFriendId)} paid ${name(flow.toFriendId)} ${formatMoney(flow.amount)} · ${folder.folder.name}`,
    });
  }
  async function settleRows(values: typeof rows, kind: string) {
    if (
      !values.length ||
      !confirm(
        `${kind} ${values.length} payment${values.length === 1 ? "" : "s"} totaling ${formatMoney(values.reduce((s, v) => s + v.flow.amount, 0))}?`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      for (const row of values) await settle(row, "all");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to record payment.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function settleOne(row: (typeof rows)[number]) {
    if (!confirm(`Record ${formatMoney(row.flow.amount)} as settled?`)) return;
    setBusy(true);
    try {
      await settle(row, "individual");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to record payment.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (friends.loading) return <LoadingState />;
  if (!person) return <Notice message="Friend not found." />;
  const balance = summary?.balance || 0;
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
          <strong className={balance < 0 ? "negative" : "positive"}>
            {Math.abs(balance) < 0.005
              ? "Settled"
              : balance < 0
                ? `Owes ${formatMoney(-balance)}`
                : `To receive ${formatMoney(balance)}`}
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
      <DebtSection
        title={person.isMe ? "You Owe" : `${person.name} Owes`}
        rows={owes}
        action="Paid"
        all="Mark All Paid"
        disabled={busy}
        name={name}
        onOne={settleOne}
        onAll={() => settleRows(owes, "Mark all paid")}
      />
      <DebtSection
        title="To Receive"
        rows={receives}
        action="Received"
        all="Mark All Received"
        disabled={busy}
        name={name}
        onOne={settleOne}
        onAll={() => settleRows(receives, "Mark all received")}
      />
      <h2 className="section-title">Folders</h2>
      <div className="folder-breakdown">
        {folders.map((item) => {
          const value = calculateBalances(
            item.contributions,
            item.settlements,
          ).find((v) => v.friendId === friendId);
          return (
            <Link
              className="panel"
              href={`/folders/${item.folder.id}`}
              key={item.folder.id}
            >
              <h3>
                {item.folder.icon} {item.folder.name}
              </h3>
              <strong>
                {!value || Math.abs(value.balance) < 0.005
                  ? "Settled"
                  : value.balance < 0
                    ? `Owes ${formatMoney(-value.balance)}`
                    : `To receive ${formatMoney(value.balance)}`}
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
  onOne,
  onAll,
}: {
  title: string;
  rows: Array<{ folder: FolderFinancials; flow: SettlementDirection }>;
  action: string;
  all: string;
  disabled: boolean;
  name: (id: string) => string;
  onOne: (
    row: Array<{ folder: FolderFinancials; flow: SettlementDirection }>[number],
  ) => void;
  onAll: () => void;
}) {
  if (!rows.length) return null;
  return (
    <section className="panel settlement-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <Button variant="secondary" disabled={disabled} onClick={onAll}>
          {all}
        </Button>
      </div>
      <div className="share-list">
        {rows.map((row) => {
          return (
            <div
              key={`${row.folder.folder.id}-${row.flow.fromFriendId}-${row.flow.toFriendId}`}
            >
              <span>
                <strong>{row.folder.folder.name}</strong>
                <small>
                  {name(row.flow.fromFriendId)} → {name(row.flow.toFriendId)}
                </small>
              </span>
              <strong>{formatMoney(row.flow.amount)}</strong>
              <Button disabled={disabled} onClick={() => onOne(row)}>
                {action}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
