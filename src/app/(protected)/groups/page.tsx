"use client";
import { useCallback, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, LoadingState, Notice } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { FriendAvatar } from "@/components/ui/FriendAvatar";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import { usePersistentSort } from "@/hooks/usePersistentSort";
import {
  createFriendGroup,
  deleteFriendGroup,
  removeFriendFromGroup,
  subscribeFriendGroups,
  updateFriendGroup,
} from "@/services/friendGroups";
import { subscribeFriends } from "@/services/friends";
import { subscribeFolders } from "@/services/folders";
import type { Friend, FriendGroup } from "@/types";
import { friendLabel } from "@/utils/format";
import { alpha, millis } from "@/utils/sortMetrics";
type GroupSort =
  | "az"
  | "za"
  | "members-high"
  | "members-low"
  | "newest"
  | "oldest";
export default function GroupsPage() {
  const uid = useAuth().currentUser!.uid;
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
  const friends = useCollectionData(friendSub);
  const groups = useCollectionData(groupSub);
  const folderSub=useCallback((next:Parameters<typeof subscribeFolders>[1],fail:Parameters<typeof subscribeFolders>[2])=>subscribeFolders(uid,next,fail),[uid]);
  const folders=useCollectionData(folderSub);
  const [editing, setEditing] = useState<FriendGroup | "new" | null>(null);
  const [viewingId,setViewingId]=useState<string|null>(null);
  const [removing,setRemoving]=useState<{group:FriendGroup;friend:Friend}|null>(null);
  const [deleting, setDeleting] = useState<FriendGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const available = friends.items.filter((friend) => !friend.archived);
  const viewing=viewingId?groups.items.find(group=>group.id===viewingId)||null:null;
  const [sort, setSort] = usePersistentSort<GroupSort>("groups", "az");
  const sortedGroups = [...groups.items].sort((a, b) => {
    const tie = alpha(a, b);
    switch (sort) {
      case "za":
        return -tie;
      case "members-high":
        return b.friendIds.length - a.friendIds.length || tie;
      case "members-low":
        return a.friendIds.length - b.friendIds.length || tie;
      case "newest":
        return millis(b.createdAt) - millis(a.createdAt) || tie;
      case "oldest":
        return millis(a.createdAt) - millis(b.createdAt) || tie;
      default:
        return tie;
    }
  });
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const input = {
      name: String(form.get("name")),
      friendIds: form.getAll("friends").map(String),
    };
    try {
      if (editing === "new") await createFriendGroup(uid, input);
      else if (editing) await updateFriendGroup(uid, editing.id, input);
      setEditing(null);
      setMessage(editing === "new" ? "Group created." : "Group updated.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Unable to save group.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteFriendGroup(uid, deleting.id);
      setDeleting(null);
      setMessage("Group deleted. Friends were not changed.");
    } catch {
      setMessage("Unable to delete group.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Friend Groups"
        description="Save participant sets you use often."
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus size={18} /> New group
          </Button>
        }
      />
      <label className="sort-control">
        Sort by{" "}
        <select
          aria-label="Sort groups by"
          value={sort}
          onChange={(event) => setSort(event.target.value as GroupSort)}
        >
          <option value="az">Alphabetical A–Z</option>
          <option value="za">Alphabetical Z–A</option>
          <option value="members-high">Most Members</option>
          <option value="members-low">Fewest Members</option>
          <option value="newest">Recently Created</option>
          <option value="oldest">Oldest Created</option>
        </select>
      </label>
      <Notice
        message={groups.error || friends.error || message}
        tone={message ? "success" : "error"}
      />
      {groups.loading ? (
        <LoadingState />
      ) : groups.items.length === 0 ? (
        <EmptyState
          title="No groups yet"
          description="Create a group to quickly select the same friends later."
        />
      ) : (
        <div className="group-grid">
          {sortedGroups.map((group) => (
            <article className="group-card group-card-clickable" key={group.id}>
              <button className="group-card-main" onClick={()=>setViewingId(group.id)} aria-label={`View ${group.name} Group details`}>
              <div>
                <h2>{group.name}</h2>
                <p>
                  {group.friendIds.length}{" "}
                  {group.friendIds.length === 1 ? "person" : "people"}
                </p>
              </div>
              <div className="member-stack">
                {group.friendIds.slice(0, 4).map((id) => (
                  <span
                    key={id}
                    title={
                      friends.items.find((friend) => friend.id === id)?.name
                    }
                  >
                    <FriendAvatar
                      friend={friends.items.find((friend) => friend.id === id)}
                    />
                  </span>
                ))}
              </div>
              </button>
              <div className="row-actions">
                <button
                  className="icon-button"
                  aria-label={`Edit ${group.name}`}
                  onClick={() => setEditing(group)}
                >
                  <Pencil size={18} />
                </button>
                <button
                  className="icon-button danger-text"
                  aria-label={`Delete ${group.name}`}
                  onClick={() => setDeleting(group)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <Dialog open={!!viewing} wide title={viewing?.name||"Friend Group"} onClose={()=>setViewingId(null)}>
        {viewing&&<div className="group-details"><p className="muted-copy">{viewing.friendIds.length} {viewing.friendIds.length===1?"member":"members"}{viewing.createdAt?.toDate?` · Created ${viewing.createdAt.toDate().toLocaleDateString("en-PH",{dateStyle:"medium"})}`:""}</p><section><h3>Members</h3><div className="group-member-list">{viewing.friendIds.length?viewing.friendIds.map(id=>friends.items.find(friend=>friend.id===id)).filter((friend):friend is Friend=>!!friend).map(friend=><div className="group-member-row" key={friend.id}><span className="person-label"><FriendAvatar friend={friend}/><strong>{friendLabel(friend)}</strong></span><Button variant="ghost" aria-label={`Remove ${friend.name} from ${viewing.name}`} onClick={()=>setRemoving({group:viewing,friend})}>Remove</Button></div>):<p className="muted-copy">No members yet.</p>}</div></section><section><h3>Used when creating Folders</h3>{folders.items.some(folder=>folder.defaultFriendGroupId===viewing.id)?<div className="group-folder-list">{folders.items.filter(folder=>folder.defaultFriendGroupId===viewing.id).map(folder=><div key={folder.id}>{folder.icon||"📁"} {folder.name}</div>)}</div>:<p className="muted-copy">No Folders currently reference this Group.</p>}</section><div className="dialog-actions"><Button variant="danger" onClick={()=>{setDeleting(viewing);setViewingId(null)}}>Delete Group</Button><span/><Button variant="secondary" onClick={()=>setViewingId(null)}>Close</Button><Button onClick={()=>{setEditing(viewing);setViewingId(null)}}><Pencil size={17}/> Edit Group</Button></div></div>}
      </Dialog>
      <Dialog open={!!removing} title={removing?`Remove ${removing.friend.name} from ${removing.group.name}?`:"Remove from Group?"} onClose={()=>setRemoving(null)}><p>This only removes {removing?.friend.name} from this Friend Group. Existing folders, expenses, links, settlements, and history will not be changed.</p><div className="dialog-actions"><span/><Button variant="secondary" onClick={()=>setRemoving(null)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={async()=>{if(!removing)return;setBusy(true);try{await removeFriendFromGroup(uid,removing.group,removing.friend.id,removing.friend.name);setMessage(`${removing.friend.name} removed from ${removing.group.name}.`);setRemoving(null)}catch(cause){setMessage(cause instanceof Error?cause.message:"Unable to remove Group member.")}finally{setBusy(false)}}}>Remove</Button></div></Dialog>
      <Dialog
        open={!!editing}
        title={editing === "new" ? "Create friend group" : "Edit friend group"}
        onClose={() => setEditing(null)}
      >
        <form
          key={editing === "new" ? "new" : editing?.id}
          onSubmit={save}
          className="dialog-form"
        >
          <Field
            label="Group name"
            name="name"
            autoFocus
            required
            maxLength={80}
            defaultValue={editing && editing !== "new" ? editing.name : ""}
          />
          <fieldset className="friend-selector">
            <legend>People</legend>
            {available.map((friend) => (
              <label key={friend.id}>
                <input
                  type="checkbox"
                  name="friends"
                  value={friend.id}
                  defaultChecked={
                    editing !== "new" &&
                    !!editing?.friendIds.includes(friend.id)
                  }
                />
                <FriendAvatar friend={friend} />
                <span>{friendLabel(friend)}</span>
              </label>
            ))}
          </fieldset>
          <div className="dialog-actions">
            <span />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button disabled={busy}>{busy ? "Saving…" : "Save group"}</Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!deleting}
        title="Delete this group?"
        onClose={() => setDeleting(null)}
      >
        <p>
          <strong>{deleting?.name}</strong> will be removed. Its friends will
          remain, and folders using it will have their default group cleared.
        </p>
        <div className="dialog-actions">
          <span />
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy} onClick={remove}>
            Delete group
          </Button>
        </div>
      </Dialog>
    </>
  );
}
