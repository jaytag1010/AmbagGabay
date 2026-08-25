"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { FriendAvatar } from "@/components/ui/FriendAvatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, LoadingState, Notice } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import { usePersistentSort } from "@/hooks/usePersistentSort";
import { getFinancialOverview } from "@/services/financials";
import { subscribeFriendGroups } from "@/services/friendGroups";
import {
  createFriendRecord,
  renameFriend,
  setFriendArchived,
  subscribeFriends,
  updateFriendPhoto,
} from "@/services/friends";
import {
  removeProfilePicture,
  uploadProfilePicture,
  validateImage,
} from "@/services/profilePictures";
import type { FolderFinancials, Friend } from "@/types";
import { cleanName, friendLabel } from "@/utils/format";
import {
  calculateBalances,
  effectiveExpensePayer,
  formatMoney,
  settlementDirections,
} from "@/utils/money";
import {
  alpha,
  friendAmountInvolved,
  friendContributionCount,
  friendLastFinancialActivity,
  friendOutstanding,
} from "@/utils/sortMetrics";
type FriendSort =
  | "az"
  | "za"
  | "active-high"
  | "active-low"
  | "amount-high"
  | "amount-low"
  | "outstanding"
  | "recent";
export default function FriendsPage() {
  const uid = useAuth().currentUser!.uid;
  const params = useSearchParams();
  const friendSub = useCallback(
    (
      next: Parameters<typeof subscribeFriends>[1],
      fail: Parameters<typeof subscribeFriends>[2],
    ) => subscribeFriends(uid, next, fail),
    [uid],
  );
  const groupSub = useCallback(
    (
      next: Parameters<typeof subscribeFriendGroups>[1],
      fail: Parameters<typeof subscribeFriendGroups>[2],
    ) => subscribeFriendGroups(uid, next, fail),
    [uid],
  );
  const data = useCollectionData(friendSub),
    groups = useCollectionData(groupSub);
  const [financials, setFinancials] = useState<FolderFinancials[]>([]),
    [editing, setEditing] = useState<Friend | "new" | null>(null),
    [archiveTarget, setArchiveTarget] = useState<Friend | null>(null),
    [showArchived, setShowArchived] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string | null>(null),
    [dialogMessage, setDialogMessage] = useState<string | null>(null),
    [photo, setPhoto] = useState<File | null>(null),
    [removePhoto, setRemovePhoto] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    getFinancialOverview(uid)
      .then(setFinancials)
      .catch(() => setMessage("Unable to load balance previews."));
  }, [uid]);
  useEffect(() => {
    const id = params.get("edit");
    const match = data.items.find((item) => item.id === id);
    if (match) setEditing(match);
  }, [params, data.items]);
  const [sort, setSort] = usePersistentSort<FriendSort>("friends", "az");
  const shown = data.items
    .filter((friend) => showArchived || !friend.archived)
    .sort((a, b) => {
      const tie = alpha(a, b);
      switch (sort) {
        case "za":
          return -tie;
        case "active-high":
          return (
            friendContributionCount(b.id, financials) -
              friendContributionCount(a.id, financials) || tie
          );
        case "active-low":
          return (
            friendContributionCount(a.id, financials) -
              friendContributionCount(b.id, financials) || tie
          );
        case "amount-high":
          return (
            friendAmountInvolved(b.id, financials) -
              friendAmountInvolved(a.id, financials) || tie
          );
        case "amount-low":
          return (
            friendAmountInvolved(a.id, financials) -
              friendAmountInvolved(b.id, financials) || tie
          );
        case "outstanding":
          return (
            friendOutstanding(b.id, financials) -
              friendOutstanding(a.id, financials) || tie
          );
        case "recent":
          return (
            friendLastFinancialActivity(b.id, financials) -
              friendLastFinancialActivity(a.id, financials) || tie
          );
        default:
          return tie;
      }
    });
  const allContributions = financials.flatMap((item) => item.contributions);
  const allSettlements = financials.flatMap((item) => item.settlements);
  const balanceFor = (id: string) =>
    calculateBalances(allContributions, allSettlements).find(
      (item) => item.friendId === id,
    )?.balance || 0;
  function close() {
    if (busy) return;
    setEditing(null);
    setPhoto(null);
    setRemovePhoto(false);
    setDialogMessage(null);
  }
  async function persist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const keepOpen =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
        "data-intent",
      ) === "another";
    const name = cleanName(
      String(new FormData(event.currentTarget).get("name")),
    );
    if (!name) {
      setDialogMessage("Friend name is required.");
      return;
    }
    setBusy(true);
    setDialogMessage(null);
    try {
      let id: string, oldPath: string | null | undefined;
      if (editing === "new") id = await createFriendRecord(uid, name);
      else if (editing) {
        id = editing.id;
        oldPath = editing.photoStoragePath;
        await renameFriend(uid, id, name);
      } else return;
      if (removePhoto) {
        await updateFriendPhoto(uid, id, null, null);
        await removeProfilePicture(oldPath);
      }
      if (photo) {
        validateImage(photo);
        const uploaded = await uploadProfilePicture(
          uid,
          `friends/${id}`,
          photo,
        );
        await updateFriendPhoto(
          uid,
          id,
          uploaded.photoURL,
          uploaded.photoStoragePath,
        );
        await removeProfilePicture(oldPath);
      }
      if (keepOpen && editing === "new") {
        formRef.current?.reset();
        setPhoto(null);
        setRemovePhoto(false);
        setDialogMessage(`${name} added.`);
        requestAnimationFrame(() =>
          formRef.current
            ?.querySelector<HTMLInputElement>("input[name=name]")
            ?.focus(),
        );
      } else {
        setMessage(editing === "new" ? `${name} added.` : "Friend updated.");
        close();
      }
    } catch (cause) {
      setDialogMessage(
        cause instanceof Error ? cause.message : "Unable to save friend.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!archiveTarget) return;
    setBusy(true);
    try {
      await setFriendArchived(uid, archiveTarget, !archiveTarget.archived);
      setMessage(
        archiveTarget.archived
          ? "Friend restored."
          : "Friend archived. Financial history was preserved.",
      );
      setArchiveTarget(null);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Unable to update friend.",
      );
    } finally {
      setBusy(false);
    }
  }
  const archiveBalance = archiveTarget ? balanceFor(archiveTarget.id) : 0;
  const archiveGroups = archiveTarget
    ? groups.items.filter((group) => group.friendIds.includes(archiveTarget.id))
    : [];
  const archiveFolders = archiveTarget
    ? financials.filter((item) =>
        calculateBalances(item.contributions, item.settlements).some(
          (value) => value.friendId === archiveTarget.id,
        ),
      )
    : [];
  const archiveDirections = archiveTarget
    ? settlementDirections(allContributions, allSettlements).filter(
        (item) =>
          item.fromFriendId === archiveTarget.id ||
          item.toFriendId === archiveTarget.id,
      )
    : [];
  return (
    <>
      <PageHeader
        title="Friends"
        description="The people you split expenses with."
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus size={18} /> Add friend
          </Button>
        }
      />
      <div className="toolbar">
        <label>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />{" "}
          Show archived
        </label>
      </div>
      <label className="sort-control">
        Sort by{" "}
        <select
          aria-label="Sort friends by"
          value={sort}
          onChange={(event) => setSort(event.target.value as FriendSort)}
        >
          <option value="az">Alphabetical A–Z</option>
          <option value="za">Alphabetical Z–A</option>
          <option value="active-high">Most Active</option>
          <option value="active-low">Least Active</option>
          <option value="amount-high">Highest Amount Involved</option>
          <option value="amount-low">Lowest Amount Involved</option>
          <option value="outstanding">Highest Outstanding Balance</option>
          <option value="recent">Recently Active</option>
        </select>
      </label>
      <Notice
        message={data.error || groups.error || message}
        tone={message ? "success" : "error"}
      />
      {data.loading ? (
        <LoadingState />
      ) : !shown.length ? (
        <EmptyState
          title="No friends yet"
          description="Add your first friend to start creating groups."
        />
      ) : (
        <div className="list">
          {shown.map((friend) => {
            const balance = balanceFor(friend.id);
            return (
              <article
                className={`list-row friend-row ${friend.archived ? "muted" : ""}`}
                key={friend.id}
              >
                <Link href={`/friends/${friend.id}`} className="friend-main">
                  <FriendAvatar friend={friend} />
                  <div>
                    <h2>{friendLabel(friend)}</h2>
                    <p>
                      {friend.archived ? "Archived · " : ""}
                      {balance < -0.004
                        ? `Owes ${formatMoney(-balance)}`
                        : balance > 0.004
                          ? `To receive ${formatMoney(balance)}`
                          : "Settled"}
                    </p>
                  </div>
                </Link>
                <div className="row-actions">
                  {!friend.isMe && <button className="icon-button" aria-label={`Edit ${friend.name}`} onClick={() => setEditing(friend)}><Pencil size={18}/></button>}
                  {!friend.isMe && (
                    <button
                      className="icon-button"
                      aria-label={
                        friend.archived
                          ? `Restore ${friend.name}`
                          : `Archive ${friend.name}`
                      }
                      onClick={() => setArchiveTarget(friend)}
                    >
                      {friend.archived ? (
                        <RotateCcw size={18} />
                      ) : (
                        <Archive size={18} />
                      )}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Dialog
        open={!!editing}
        title={editing === "new" ? "Add friend" : "Edit friend"}
        onClose={close}
      >
        <form
          key={editing === "new" ? "new" : editing?.id}
          ref={formRef}
          onSubmit={persist}
          className="dialog-form"
        >
          <Notice
            message={dialogMessage}
            tone={dialogMessage?.endsWith("added.") ? "success" : "error"}
          />
          <div className="photo-picker">
            <Avatar
              size="large"
              name={editing && editing !== "new" ? editing.name : "Friend"}
              photoURL={
                removePhoto
                  ? null
                  : photo
                    ? URL.createObjectURL(photo)
                    : editing && editing !== "new"
                      ? editing.photoURL
                      : null
              }
            />
            <label className="button button-secondary">
              Choose photo
              <input
                hidden
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  if (file)
                    try {
                      validateImage(file);
                      setPhoto(file);
                      setRemovePhoto(false);
                    } catch (cause) {
                      setDialogMessage(
                        cause instanceof Error
                          ? cause.message
                          : "Invalid image.",
                      );
                    }
                }}
              />
            </label>
            {editing !== "new" && editing?.photoURL && !removePhoto && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPhoto(null);
                  setRemovePhoto(true);
                }}
              >
                <Trash2 size={17} /> Remove
              </Button>
            )}
          </div>
          <Field
            label="Name"
            name="name"
            autoFocus
            required
            maxLength={80}
            defaultValue={editing && editing !== "new" ? editing.name : ""}
          />
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <span />
            {editing === "new" && (
              <Button
                type="submit"
                data-intent="another"
                variant="secondary"
                disabled={busy}
              >
                Save & Add Another
              </Button>
            )}
            <Button disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!archiveTarget}
        title={`${archiveTarget?.archived ? "Restore" : "Archive"} ${archiveTarget?.name}?`}
        onClose={() => setArchiveTarget(null)}
      >
        {archiveTarget && !archiveTarget.archived && (
          <div className="archive-warning">
            {Math.abs(archiveBalance) > 0.004 ? (
              <>
                <p>
                  <strong>
                    {archiveTarget.name} still has an unsettled balance.
                  </strong>
                </p>
                <h3>
                  {archiveBalance < 0
                    ? `Owes ${formatMoney(-archiveBalance)}`
                    : `To receive ${formatMoney(archiveBalance)}`}
                </h3>
                <div className="share-list">
                  {archiveDirections.map((item, index) => {
                    const other =
                      item.fromFriendId === archiveTarget.id
                        ? item.toFriendId
                        : item.fromFriendId;
                    return (
                      <div key={index}>
                        <span>
                          {item.fromFriendId === archiveTarget.id
                            ? "To"
                            : "From"}{" "}
                          {data.items.find((value) => value.id === other)
                            ?.name || "Unknown"}
                        </span>
                        <strong>{formatMoney(item.amount)}</strong>
                      </div>
                    );
                  })}
                </div>
                <p>Archiving will not erase or settle these balances.</p>
              </>
            ) : (
              <p>
                {archiveTarget.name} will be removed from active friend
                selections. You can restore this friend later.
              </p>
            )}
            {archiveGroups.length > 0 && (
              <p>
                Currently included in:{" "}
                <strong>
                  {archiveGroups.map((group) => group.name).join(", ")}
                </strong>
                .
              </p>
            )}
            {archiveFolders.length > 0 && (
              <p>
                Financial history exists in {archiveFolders.length} folder
                {archiveFolders.length === 1 ? "" : "s"} and will remain intact.
              </p>
            )}
          </div>
        )}
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setArchiveTarget(null)}>
            Cancel
          </Button>
          {archiveTarget &&
            !archiveTarget.archived &&
            Math.abs(archiveBalance) > 0.004 && (
              <Link
                className="button button-secondary"
                href={`/friends/${archiveTarget.id}`}
              >
                View Balance
              </Link>
            )}
          <span />
          <Button
            variant={archiveTarget?.archived ? "primary" : "danger"}
            disabled={busy}
            onClick={archive}
          >
            {archiveTarget?.archived
              ? "Restore Friend"
              : Math.abs(archiveBalance) > 0.004
                ? "Archive Anyway"
                : "Archive Friend"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
