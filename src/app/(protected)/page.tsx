"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, LoadingState, Notice } from "@/components/ui/Feedback";
import { Field, SelectField } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import { usePersistentSort } from "@/hooks/usePersistentSort";
import { getFinancialOverview } from "@/services/financials";
import { subscribeFriendGroups } from "@/services/friendGroups";
import {
  createFolder,
  deleteFolder,
  subscribeFolders,
  updateFolder,
} from "@/services/folders";
import type { Folder, FolderFinancials } from "@/types";
import { formatDate } from "@/utils/format";
import { folderTotal, formatMoney } from "@/utils/money";
import { alpha, folderMetrics, millis } from "@/utils/sortMetrics";
type FolderSort =
  | "updated"
  | "newest"
  | "oldest"
  | "az"
  | "za"
  | "total-high"
  | "total-low"
  | "active-high"
  | "active-low";
const icons = ["📁", "✈️", "🍽️", "🏠", "🎉", "🛒", "🏖️"];
export default function DashboardPage() {
  const { currentUser } = useAuth();
  const uid = currentUser!.uid;
  const folderSub = useCallback(
    (
      next: Parameters<typeof subscribeFolders>[1],
      fail: Parameters<typeof subscribeFolders>[2],
    ) => subscribeFolders(uid, next, fail),
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
    groups = useCollectionData(groupSub);
  const [financials, setFinancials] = useState<FolderFinancials[]>([]),
    [editing, setEditing] = useState<Folder | "new" | null>(null),
    [deleting, setDeleting] = useState<Folder | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    getFinancialOverview(uid)
      .then(setFinancials)
      .catch(() => setMessage("Unable to load folder totals."));
  }, [uid, folders.items.length]);
  const [sort, setSort] = usePersistentSort<FolderSort>("folders", "updated");
  const sortedFolders = [...folders.items].sort((a, b) => {
    const am = folderMetrics(a.id, financials),
      bm = folderMetrics(b.id, financials),
      tie = alpha(a, b);
    switch (sort) {
      case "newest":
        return millis(b.createdAt) - millis(a.createdAt) || tie;
      case "oldest":
        return millis(a.createdAt) - millis(b.createdAt) || tie;
      case "az":
        return tie;
      case "za":
        return -tie;
      case "total-high":
        return bm.total - am.total || tie;
      case "total-low":
        return am.total - bm.total || tie;
      case "active-high":
        return bm.count - am.count || bm.updated - am.updated || tie;
      case "active-low":
        return am.count - bm.count || bm.updated - am.updated || tie;
      default:
        return bm.updated - am.updated || tie;
    }
  });
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const data = new FormData(event.currentTarget),
      input = {
        name: String(data.get("name")),
        icon: String(data.get("icon")),
        defaultFriendGroupId: String(data.get("group")) || null,
      };
    try {
      if (editing === "new") await createFolder(uid, input);
      else if (editing) await updateFolder(uid, editing.id, input);
      setEditing(null);
      setMessage(editing === "new" ? "Folder created." : "Folder updated.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Unable to save folder.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteFolder(uid, deleting.id);
      setDeleting(null);
      setMessage("Folder deleted.");
    } catch {
      setMessage("Unable to delete folder. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title={`Hi, ${currentUser?.displayName?.split(" ")[0] || "there"}`}
        description="Keep every shared expense organized by occasion."
        action={
          <div className="header-actions">
            <Link className="button button-primary" href="/contributions/new">
              <Plus size={18} /> Add Contribution
            </Link>
            <Button variant="secondary" onClick={() => setEditing("new")}>
              <Plus size={18} /> New folder
            </Button>
          </div>
        }
      />
      <label className="sort-control">
        Sort by{" "}
        <select
          aria-label="Sort folders by"
          value={sort}
          onChange={(event) => setSort(event.target.value as FolderSort)}
        >
          <option value="updated">Recently Updated</option>
          <option value="newest">Newest Created</option>
          <option value="oldest">Oldest Created</option>
          <option value="az">Alphabetical A–Z</option>
          <option value="za">Alphabetical Z–A</option>
          <option value="total-high">Highest Total Amount</option>
          <option value="total-low">Lowest Total Amount</option>
          <option value="active-high">Most Active</option>
          <option value="active-low">Least Active</option>
        </select>
      </label>
      <Notice
        message={folders.error || groups.error || message}
        tone={
          message?.includes("created") ||
          message?.includes("updated") ||
          message?.includes("deleted")
            ? "success"
            : "error"
        }
      />
      {folders.loading ? (
        <LoadingState label="Loading folders…" />
      ) : !folders.items.length ? (
        <EmptyState
          title="No folders yet"
          description="Create a folder for a trip, meal group, event, or shared activity."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus size={18} /> Create folder
            </Button>
          }
        />
      ) : (
        <div className="folder-grid">
          {sortedFolders.map((folder) => {
            const data = financials.find(
              (item) => item.folder.id === folder.id,
            );
            return (
              <article className="folder-card" key={folder.id}>
                <Link href={`/folders/${folder.id}`}>
                  <span className="folder-icon">{folder.icon || "📁"}</span>
                  <h2>{folder.name}</h2>
                  <p>
                    {folder.defaultFriendGroupId
                      ? groups.items.find(
                          (group) => group.id === folder.defaultFriendGroupId,
                        )?.name || "Group unavailable"
                      : "No default group"}
                  </p>
                  <div className="folder-card-total">
                    <small>Total</small>
                    <strong>
                      {formatMoney(folderTotal(data?.contributions || []))}
                    </strong>
                  </div>
                  <small>
                    {folder.createdAt
                      ? `Created ${formatDate(folder.createdAt)}`
                      : "Creation date unavailable"}
                  </small>
                </Link>
                <button
                  className="icon-button card-menu"
                  aria-label={`Edit ${folder.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditing(folder);
                  }}
                >
                  <MoreHorizontal />
                </button>
              </article>
            );
          })}
        </div>
      )}
      <Dialog
        open={!!editing}
        title={editing === "new" ? "Create folder" : "Edit folder"}
        onClose={() => setEditing(null)}
      >
        <form
          key={editing === "new" ? "new" : editing?.id}
          onSubmit={save}
          className="dialog-form"
        >
          <Field
            label="Folder name"
            name="name"
            autoFocus
            required
            maxLength={80}
            defaultValue={editing && editing !== "new" ? editing.name : ""}
          />
          <SelectField
            label="Icon"
            name="icon"
            defaultValue={editing && editing !== "new" ? editing.icon : "📁"}
          >
            {icons.map((icon) => (
              <option key={icon}>{icon}</option>
            ))}
          </SelectField>
          <SelectField
            label="Default friend group (optional)"
            name="group"
            defaultValue={
              editing && editing !== "new"
                ? editing.defaultFriendGroupId || ""
                : ""
            }
          >
            <option value="">None</option>
            {groups.items.map((group) => (
              <option value={group.id} key={group.id}>
                {group.name}
              </option>
            ))}
          </SelectField>
          <div className="dialog-actions">
            {editing !== "new" && (
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  setDeleting(editing as Folder);
                  setEditing(null);
                }}
              >
                Delete
              </Button>
            )}
            <span />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!deleting}
        title="Delete folder?"
        onClose={() => setDeleting(null)}
      >
        <p>
          This permanently deletes <strong>{deleting?.name}</strong> and its
          contributions. Only continue if you no longer need this history.
        </p>
        <div className="dialog-actions">
          <span />
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy} onClick={remove}>
            {busy ? "Deleting…" : "Delete folder"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
