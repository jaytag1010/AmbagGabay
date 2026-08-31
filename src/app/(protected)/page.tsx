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
import {
  backfillSharedFolderMemberships,
  respondInvitation,
  subscribeInvitations,
  subscribeSharedFolders,
} from "@/services/sharing";
import { subscribeFriendGroups } from "@/services/friendGroups";
import { subscribeFriends } from "@/services/friends";
import {
  createFolder,
  deleteFolder,
  subscribeFolders,
  updateFolder,
} from "@/services/folders";
import type { Folder, FolderFinancials, Friend } from "@/types";
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
  const invitationSub = useCallback(
    (
      next: Parameters<typeof subscribeInvitations>[1],
      fail: Parameters<typeof subscribeInvitations>[2],
    ) => subscribeInvitations(uid, next, fail),
    [uid],
  );
  const friendSub=useCallback((next:(items:Friend[])=>void,fail:(error:Error)=>void)=>subscribeFriends(uid,next,fail),[uid]);
  const sharedSub = useCallback(
    (
      next: Parameters<typeof subscribeSharedFolders>[1],
      fail: Parameters<typeof subscribeSharedFolders>[2],
    ) => subscribeSharedFolders(uid, next, fail),
    [uid],
  );
  const folders = useCollectionData(folderSub),
    groups = useCollectionData(groupSub),
    invitations = useCollectionData(invitationSub),
    shared = useCollectionData(sharedSub), friends=useCollectionData(friendSub);
  const [financials, setFinancials] = useState<FolderFinancials[]>([]),
    [editing, setEditing] = useState<Folder | "new" | null>(null),
    [deleting, setDeleting] = useState<Folder | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string | null>(null),[selectedPeople,setSelectedPeople]=useState<string[]>([]),[manualPeople,setManualPeople]=useState<string[]>([]),[selectedGroup,setSelectedGroup]=useState(""),[addingFriends,setAddingFriends]=useState(false),[friendDraft,setFriendDraft]=useState<string[]>([]);
  useEffect(()=>{if(!editing)return;const folder=editing==="new"?null:editing,groupId=folder?.defaultFriendGroupId||"",groupIds=groups.items.find(group=>group.id===groupId)?.friendIds||[],people=folder?.participantFriendIds||groupIds;setSelectedGroup(groupId);setSelectedPeople([...new Set(people.filter(id=>id!=="me"))]);setManualPeople(people.filter(id=>!groupIds.includes(id)&&id!=="me"))},[editing,groups.items]);
  useEffect(() => {
    backfillSharedFolderMemberships(uid).catch(() => setMessage("Unable to refresh shared-folder access."));
  }, [uid]);
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
        participantFriendIds:[...new Set(selectedPeople.filter(id=>id!=="me"))],
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
        message={
          folders.error ||
          groups.error ||
          invitations.error ||
          shared.error ||
          message
        }
        tone={
          message?.includes("created") ||
          message?.includes("updated") ||
          message?.includes("deleted")
            ? "success"
            : "error"
        }
      />
      {invitations.items.length > 0 && (
        <section className="invitation-section">
          <h2>Invitations ({invitations.items.length})</h2>
          <div className="folder-grid">
            {invitations.items.map((invitation) => (
              <article className="panel invitation-card" key={invitation.id}>
                <small>Folder Invitation</small>
                <h3>{invitation.folderNameSnapshot}</h3>
                <p>From {invitation.ownerNameSnapshot}</p>
                <strong>
                  {invitation.role === "editor"
                    ? "Editor access"
                    : "Viewer access"}
                </strong>
                <div className="dialog-actions">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      respondInvitation(
                        uid,
                        invitation,
                        false,
                        currentUser!.displayName || "User",
                      )
                    }
                  >
                    Decline
                  </Button>
                  <span />
                  <Button
                    onClick={() =>
                      respondInvitation(
                        uid,
                        invitation,
                        true,
                        currentUser!.displayName || "User",
                      )
                    }
                  >
                    Accept
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <h2 className="section-title">My Folders</h2>
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
            const promoted = shared.items.find(
              (item) =>
                item.membership.role === "owner" &&
                item.folder.sourceFolderId === folder.id,
            );
            return (
              <article className="folder-card" key={folder.id}>
                <Link
                  href={
                    promoted
                      ? `/shared/${promoted.folder.id}`
                      : `/folders/${folder.id}`
                  }
                >
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
                {!promoted && (
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
                )}
              </article>
            );
          })}
        </div>
      )}
      {shared.items.some((item) => item.membership.role !== "owner") && (
        <>
          <h2 className="section-title">Shared With Me</h2>
          <div className="folder-grid">
            {shared.items
              .filter((item) => item.membership.role !== "owner")
              .map(({ folder, membership }) => (
                <article className="folder-card" key={folder.id}>
                  <Link href={`/shared/${folder.id}`}>
                    <span className="folder-icon">{folder.icon || "📁"}</span>
                    <h2>{folder.name}</h2>
                    <p>Shared by {folder.ownerNameSnapshot}</p>
                    <div className="folder-card-total">
                      <small>Access</small>
                      <strong>
                        {membership.role[0].toUpperCase() +
                          membership.role.slice(1)}
                      </strong>
                    </div>
                    <small>
                      {folder.createdAt
                        ? `Created ${formatDate(folder.createdAt)}`
                        : "Creation date unavailable"}
                    </small>
                  </Link>
                </article>
              ))}
          </div>
        </>
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
            value={selectedGroup}
            onChange={event=>{const id=event.target.value,groupIds=groups.items.find(group=>group.id===id)?.friendIds||[];setSelectedGroup(id);setSelectedPeople([...new Set([...manualPeople,...groupIds].filter(value=>value!=="me"))])}}
          >
            <option value="">None</option>
            {groups.items.map((group) => (
              <option value={group.id} key={group.id}>
                {group.name}
              </option>
            ))}
          </SelectField>
          <div className="folder-people-picker"><div className="section-heading"><div><strong>People</strong><p>Participants only. Folder access is managed separately through Sharing.</p></div><Button type="button" variant="secondary" onClick={()=>{setFriendDraft(selectedPeople);setAddingFriends(true)}}>+ Add Friends</Button></div><div className="participant-chips">{selectedPeople.map(id=>{const person=friends.items.find(friend=>friend.id===id);return <button type="button" className="person-chip" key={id} onClick={()=>{setSelectedPeople(values=>values.filter(value=>value!==id));setManualPeople(values=>values.filter(value=>value!==id))}}>{person?.name||"Unknown"} ×</button>})}{!selectedPeople.length&&<span className="muted-copy">Me only</span>}</div></div>
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
      <Dialog open={addingFriends} title="Add Friends" onClose={()=>setAddingFriends(false)}><div className="friend-selector">{friends.items.filter(friend=>!friend.isMe&&!friend.archived).map(friend=><label key={friend.id}><input type="checkbox" checked={friendDraft.includes(friend.id)} onChange={()=>setFriendDraft(values=>values.includes(friend.id)?values.filter(id=>id!==friend.id):[...values,friend.id])}/><span>{friend.name}</span></label>)}</div><div className="dialog-actions"><Button variant="secondary" onClick={()=>setAddingFriends(false)}>Cancel</Button><span/><Button onClick={()=>{setSelectedPeople([...new Set(friendDraft)]);const groupIds=groups.items.find(group=>group.id===selectedGroup)?.friendIds||[];setManualPeople(friendDraft.filter(id=>!groupIds.includes(id)));setAddingFriends(false)}}>Add Selected</Button></div></Dialog>
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
