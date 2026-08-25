"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, SelectField } from "@/components/ui/Field";
import { LoadingState, Notice } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import {
  saveContribution,
  subscribeContributions,
} from "@/services/contributions";
import { subscribeFolders } from "@/services/folders";
import { subscribeFriendGroups } from "@/services/friendGroups";
import { createFriendRecord, subscribeFriends } from "@/services/friends";
import type { ContributionWithExpenses, ExpenseDraft } from "@/types";
import { friendLabel, localDateInputValue } from "@/utils/format";
import { formatMoney } from "@/utils/money";
const newItem = (ids: string[], payer: string): ExpenseDraft => ({
  id: crypto.randomUUID(),
  title: "",
  amount: "",
  payerFriendId: payer,
  participantIds: [...ids],
});
export function ContributionEditor() {
  const uid = useAuth().currentUser!.uid;
  const router = useRouter();
  const params = useSearchParams();
  const initialFolder = params.get("folder") || "";
  const editId = params.get("edit");
  const folderSub = useCallback(
    (
      next: Parameters<typeof subscribeFolders>[1],
      fail: Parameters<typeof subscribeFolders>[2],
    ) => subscribeFolders(uid, next, fail),
    [uid],
  );
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
  const folders = useCollectionData(folderSub),
    friends = useCollectionData(friendSub),
    groups = useCollectionData(groupSub);
  const active = friends.items.filter((item) => !item.archived);
  const [folderId, setFolderId] = useState(initialFolder),
    [title, setTitle] = useState(""),
    [date, setDate] = useState(localDateInputValue()),
    [payer, setPayer] = useState("me"),
    [participantIds, setParticipantIds] = useState<string[]>([]),
    [items, setItems] = useState<ExpenseDraft[]>([]),
    [groupId, setGroupId] = useState(""),
    [choosing, setChoosing] = useState(false),
    [search, setSearch] = useState(""),
    [newFriend, setNewFriend] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false);
  const selectedFolder = folders.items.find((item) => item.id === folderId),
    selectedGroup = groups.items.find((item) => item.id === groupId);
  const contributionSub = useCallback(
    (
      next: (values: ContributionWithExpenses[]) => void,
      fail: (error: Error) => void,
    ) => subscribeContributions(uid, folderId, next, fail),
    [uid, folderId],
  );
  const contributions = useCollectionData(
    editId && folderId ? contributionSub : null,
  );
  function applyGroup(id: string) {
    const group = groups.items.find((value) => value.id === id);
    setGroupId(id);
    if (!group) return;
    const valid = group.friendIds.filter((friendId) =>
      active.some((friend) => friend.id === friendId),
    );
    setParticipantIds((current) => [
      ...new Set(
        [...current, ...valid, "me"].filter((friendId) =>
          active.some((friend) => friend.id === friendId),
        ),
      ),
    ]);
  }
  useEffect(() => {
    if (
      !folderId ||
      groups.loading ||
      friends.loading ||
      editId ||
      participantIds.length
    )
      return;
    const folder = folders.items.find((item) => item.id === folderId);
    const defaultId = folder?.defaultFriendGroupId || "";
    if (defaultId) applyGroup(defaultId);
    else if (active.some((friend) => friend.id === "me")) {
      setParticipantIds(["me"]);
      setPayer("me");
    }
  // The initialization intentionally runs only when its collection inputs change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    folderId,
    folders.items,
    groups.items,
    groups.loading,
    friends.loading,
    editId,
  ]);
  useEffect(() => {
    if (!editId || loaded || contributions.loading) return;
    const value = contributions.items.find((item) => item.id === editId);
    if (!value) {
      setError("Contribution not found.");
      return;
    }
    setTitle(value.title);
    setDate(localDateInputValue(value.date.toDate()));
    setPayer(value.payerFriendId);
    setParticipantIds(value.participantIds);
    setItems(
      value.expenses.map((expense) => ({
        id: expense.id,
        title: expense.title,
        amount: String(expense.amount),
        payerFriendId: expense.payerFriendId || value.payerFriendId,
        participantIds: expense.participantIds,
      })),
    );
    setLoaded(true);
  }, [editId, loaded, contributions.loading, contributions.items]);
  function changeFolder(next: string) {
    if (
      folderId &&
      next !== folderId &&
      (participantIds.length > 1 || items.length) &&
      !confirm("Change folder and keep your current people and expense items?")
    )
      return;
    setFolderId(next);
    if (!items.length) {
      setParticipantIds([]);
      setGroupId("");
    }
  }
  function removeOverall(id: string) {
    const count = items.filter((item) =>
      item.participantIds.includes(id),
    ).length;
    if (
      count &&
      !confirm(
        `Remove this person from the contribution? They are included in ${count} expense item${count === 1 ? "" : "s"} and will also be removed there.`,
      )
    )
      return;
    setParticipantIds((current) => current.filter((value) => value !== id));
    setItems((current) =>
      current.map((item) => ({
        ...item,
        participantIds: item.participantIds.filter((value) => value !== id),
      })),
    );
    if (payer === id)
      setPayer(participantIds.find((value) => value !== id) || "");
  }
  function addOverall(id: string) {
    setParticipantIds((current) =>
      current.includes(id) ? current : [...current, id],
    );
    if (!payer) setPayer(id);
  }
  function patchItem(id: string, change: Partial<ExpenseDraft>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
  }
  async function createInlineFriend() {
    if (!newFriend.trim() || busy) return;
    setBusy(true);
    try {
      const id = await createFriendRecord(uid, newFriend);
      addOverall(id);
      setNewFriend("");
      setError("Friend added to this contribution.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to add friend.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await saveContribution(
        uid,
        folderId,
        {
          title,
          date: new Date(`${date}T12:00:00`),
          payerFriendId: payer,
          participantIds,
          expenses: items.map((item) => ({
            title: item.title,
            amount: Number(item.amount),
            payerFriendId: item.payerFriendId,
            participantIds: item.participantIds,
          })),
        },
        editId || undefined,
      );
      router.push(`/folders/${folderId}?contribution=${id}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save contribution.",
      );
      setBusy(false);
    }
  }
  const total = items.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0,
  );
  if (folders.loading || friends.loading || groups.loading)
    return <LoadingState label="Preparing contribution…" />;
  return (
    <>
      <PageHeader
        title={editId ? "Edit Contribution" : "Add Contribution"}
        description="Record who paid and who shared each item."
      />
      <Notice
        message={folders.error || friends.error || groups.error || error}
        tone={error?.includes("added") ? "success" : "error"}
      />
      <form className="contribution-form" onSubmit={submit}>
        <section className="panel form-section">
          <h2>Details</h2>
          <SelectField
            label="Folder"
            value={folderId}
            onChange={(event) => changeFolder(event.target.value)}
            required
            disabled={!!initialFolder}
          >
            <option value="">Select a folder</option>
            {folders.items.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.icon} {folder.name}
              </option>
            ))}
          </SelectField>
          <Field
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            placeholder="Food Trip"
          />
          <div className="form-grid">
            <Field
              label="Date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
            <SelectField
              label="Default paid by"
              value={payer}
              onChange={(event) => setPayer(event.target.value)}
              required
            >
              <option value="">Select payer</option>
              {active
                .filter((friend) => participantIds.includes(friend.id))
                .map((friend) => (
                  <option key={friend.id} value={friend.id}>
                    {friendLabel(friend)}
                  </option>
                ))}
            </SelectField>
          </div>
          <small className="muted-copy">
            New expense items use this payer. Existing items keep their own
            payer.
          </small>
        </section>
        <section className="panel form-section">
          <div className="section-heading">
            <div>
              <h2>People involved</h2>
              <p>
                {selectedGroup
                  ? `Using: ${selectedGroup.name}`
                  : selectedFolder?.defaultFriendGroupId
                    ? "Default group unavailable"
                    : "No default group for this folder"}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setChoosing(true)}
            >
              <Plus size={18} /> Add More
            </Button>
          </div>
          <SelectField
            label="Change group"
            value={groupId}
            onChange={(event) => applyGroup(event.target.value)}
          >
            <option value="">Manual selection</option>
            {groups.items.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </SelectField>
          <div className="participant-chips">
            {active
              .filter((friend) => participantIds.includes(friend.id))
              .map((friend) => (
                <button
                  type="button"
                  className="person-chip"
                  key={friend.id}
                  onClick={() => removeOverall(friend.id)}
                >
                  <Avatar name={friend.name} photoURL={friend.photoURL} />
                  {friendLabel(friend)} ×
                </button>
              ))}
          </div>
          <small>{participantIds.length} selected</small>
        </section>
        <section className="panel form-section">
          <div className="section-heading">
            <div>
              <h2>Expense items</h2>
              <p>Choose a payer and visible sharing list for every item.</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setItems((current) => [
                  ...current,
                  newItem(participantIds, payer),
                ])
              }
            >
              <Plus size={18} /> Add Item
            </Button>
          </div>
          {!items.length ? (
            <p className="muted-copy">Add your first expense item.</p>
          ) : (
            <div className="expense-card-list">
              {items.map((item, index) => {
                const available = participantIds.filter(
                  (id) => !item.participantIds.includes(id),
                );
                return (
                  <article className="expense-item-card" key={item.id}>
                    <div className="expense-title-row">
                      <h3>Expense Item {index + 1}</h3>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setItems((current) =>
                            current.filter((value) => value.id !== item.id),
                          )
                        }
                      >
                        <Trash2 size={17} /> Delete Item
                      </Button>
                    </div>
                    <div className="expense-fields">
                      <Field
                        label="Item"
                        value={item.title}
                        onChange={(event) =>
                          patchItem(item.id, { title: event.target.value })
                        }
                        required
                      />
                      <Field
                        label="Amount (₱)"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={item.amount}
                        onChange={(event) =>
                          patchItem(item.id, { amount: event.target.value })
                        }
                        required
                      />
                      <SelectField
                        label="Paid by"
                        value={item.payerFriendId}
                        onChange={(event) =>
                          patchItem(item.id, {
                            payerFriendId: event.target.value,
                          })
                        }
                        required
                      >
                        <option value="">Select payer</option>
                        {active
                          .filter((friend) =>
                            participantIds.includes(friend.id),
                          )
                          .map((friend) => (
                            <option key={friend.id} value={friend.id}>
                              {friendLabel(friend)}
                            </option>
                          ))}
                      </SelectField>
                    </div>
                    <h4>Sharing this item</h4>
                    <div className="participant-chips">
                      {active
                        .filter((friend) =>
                          item.participantIds.includes(friend.id),
                        )
                        .map((friend) => (
                          <button
                            type="button"
                            className="person-chip"
                            key={friend.id}
                            onClick={() =>
                              patchItem(item.id, {
                                participantIds: item.participantIds.filter(
                                  (id) => id !== friend.id,
                                ),
                              })
                            }
                          >
                            <Avatar
                              name={friend.name}
                              photoURL={friend.photoURL}
                            />
                            {friendLabel(friend)} ×
                          </button>
                        ))}
                    </div>
                    <div className="item-share-footer">
                      <small>
                        {item.participantIds.length} of {participantIds.length}{" "}
                        people
                      </small>
                      {available.length > 0 && (
                        <select
                          aria-label="Add person to item"
                          value=""
                          onChange={(event) => {
                            if (event.target.value)
                              patchItem(item.id, {
                                participantIds: [
                                  ...item.participantIds,
                                  event.target.value,
                                ],
                              });
                          }}
                        >
                          <option value="">+ Add Person</option>
                          {available.map((id) => (
                            <option key={id} value={id}>
                              {friendLabel(
                                active.find((friend) => friend.id === id)!,
                              )}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {items.length > 0 && (
            <Button type="button" variant="secondary" onClick={() => setItems((current) => [...current, newItem(participantIds, payer)])}>
              <Plus size={18} /> Add Another Item
            </Button>
          )}
          <div className="contribution-total">
            <span>Total</span>
            <strong>{formatMoney(total)}</strong>
          </div>
        </section>
        <div className="sticky-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button disabled={busy}>
            {busy ? "Saving…" : "Save Contribution"}
          </Button>
        </div>
      </form>
      <Dialog
        open={choosing}
        title="Add more people"
        onClose={() => setChoosing(false)}
      >
        <Field
          label="Search friends"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name"
        />
        <div className="friend-selector">
          {active
            .filter((friend) =>
              friend.name.toLowerCase().includes(search.toLowerCase()),
            )
            .map((friend) => (
              <label key={friend.id}>
                <input
                  type="checkbox"
                  checked={participantIds.includes(friend.id)}
                  onChange={() =>
                    participantIds.includes(friend.id)
                      ? removeOverall(friend.id)
                      : addOverall(friend.id)
                  }
                />
                <Avatar name={friend.name} photoURL={friend.photoURL} />
                <span>{friendLabel(friend)}</span>
              </label>
            ))}
        </div>
        <div className="inline-add">
          <Field
            label="Add a new friend"
            value={newFriend}
            onChange={(event) => setNewFriend(event.target.value)}
            placeholder="Friend name"
          />
          <Button
            type="button"
            disabled={busy || !newFriend.trim()}
            onClick={createInlineFriend}
          >
            Add
          </Button>
        </div>
        <div className="dialog-actions">
          <span />
          <Button onClick={() => setChoosing(false)}>Done</Button>
        </div>
      </Dialog>
    </>
  );
}
