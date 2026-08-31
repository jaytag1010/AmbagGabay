"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Field";
import { PublicAvatar } from "@/components/ui/PublicAvatar";
import { LoadingState, Notice } from "@/components/ui/Feedback";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import {
  cancelInvitation,
  changeMemberRole,
  deleteSharedFolder,
  getSharedFolder,
  getSharedMemberBalance,
  inviteToFolder,
  isSharedFriendInvolved,
  removeMember,
  subscribeFolderInvitations,
  subscribeFolderMembers,
} from "@/services/sharing";
import { subscribeFriends } from "@/services/friends";
import type { Friend, SharedFolder } from "@/types";
import { deleteFolder } from "@/services/folders";
export default function ManageSharingPage() {
  const { folderId } = useParams<{ folderId: string }>(),
    uid = useAuth().currentUser!.uid,
    router = useRouter();
  const memberSub = useCallback(
    (
      next: Parameters<typeof subscribeFolderMembers>[1],
      fail: Parameters<typeof subscribeFolderMembers>[2],
    ) => subscribeFolderMembers(folderId, next, fail),
    [folderId],
  );
  const inviteSub = useCallback(
    (
      next: Parameters<typeof subscribeFolderInvitations>[1],
      fail: Parameters<typeof subscribeFolderInvitations>[2],
    ) => subscribeFolderInvitations(folderId, next, fail),
    [folderId],
  );
  const members = useCollectionData(memberSub),
    invitations = useCollectionData(inviteSub),
    [folder, setFolder] = useState<SharedFolder | null>(null),
    [error, setError] = useState<string | null>(null),[friendId,setFriendId]=useState(""),[role,setRole]=useState<"editor"|"viewer">("editor"),[busy,setBusy]=useState(false);
  const friendSub=useCallback((next:(items:Friend[])=>void,fail:(error:Error)=>void)=>subscribeFriends(uid,next,fail),[uid]);
  const friends=useCollectionData(friendSub),linked=friends.items.filter(item=>!item.archived&&!item.isMe&&!!item.linkedUserId&&!members.items.some(member=>member.userId===item.linkedUserId)&&!invitations.items.some(invite=>invite.recipientUid===item.linkedUserId));
  useEffect(() => {
    getSharedFolder(folderId)
      .then(setFolder)
      .catch(() => setError("Unable to load sharing settings."));
  }, [folderId]);
  if (!folder || members.loading || invitations.loading)
    return <LoadingState />;
  if (folder.ownerId !== uid)
    return <Notice message="Only the Folder Owner can manage sharing." />;
  return (
    <>
      <Link href={`/shared/${folderId}`} className="back-link">
        <ArrowLeft size={18} /> Shared Folder
      </Link>
      <h1>Manage Sharing</h1>
      <p className="muted-copy">{folder.name}</p>
      <Notice message={members.error || invitations.error || error} />
      <section className="panel"><h2>Add Person</h2>{linked.length?<><SelectField label="Friend" value={friendId} onChange={e=>setFriendId(e.target.value)}><option value="">Select linked Friend</option>{linked.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</SelectField><SelectField label="Role" value={role} onChange={e=>setRole(e.target.value as "editor"|"viewer")}><option value="editor">Editor</option><option value="viewer">Viewer</option></SelectField><Button disabled={busy||!friendId} onClick={async()=>{const selected=linked.find(item=>item.id===friendId);if(!selected)return;const involved=await isSharedFriendInvolved(folder,selected);if(!involved&&!confirm(`This person is not currently involved in this Folder.\n\n${selected.name} is not part of the Folder's selected people and does not appear in any current Contribution or Expense. Sharing will give them access.\n\nProceed?`))return;setBusy(true);setError(null);try{await inviteToFolder(uid,folder,folder.ownerNameSnapshot,selected,role);setFriendId("")}catch(e){setError(e instanceof Error?e.message:"Unable to invite Friend.")}finally{setBusy(false)}}}>Send Invitation</Button></>:<><p><strong>No linked Friends available.</strong></p><p className="muted-copy">Link a Friend to an AmbagGabay account first before sharing this Folder.</p><Link className="text-link" href="/friends">Go to Friends</Link></>}</section>
      <section className="panel">
        <h2>Owner</h2><p><strong>{folder.ownerNameSnapshot}</strong></p><h2>Currently Shared With</h2>
        <div className="share-list">
          {members.items.filter(member=>member.role!=="owner").map((member) => (
            <div key={member.userId}>
              <span className="person-label">
                <PublicAvatar
                  uid={member.userId}
                  name={member.displayNameSnapshot}
                />
                <span>
                  <strong>{member.displayNameSnapshot}</strong>
                  <small>{member.role}</small>
                </span>
              </span>
              {member.role !== "owner" && (
                <>
                  <select
                    aria-label={`Role for ${member.displayNameSnapshot}`}
                    value={member.role}
                    onChange={(event) =>
                      changeMemberRole(
                        uid,
                        folder,
                        member,
                        event.target.value as "editor" | "viewer",
                      )
                    }
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      const balance=await getSharedMemberBalance(folder.id,member.userId),active=Math.abs(balance)>=0.005,summary=balance>0?`Owes ₱${balance.toFixed(2)}`:`To receive ₱${Math.abs(balance).toFixed(2)}`;
                      if (confirm(active?`Remove ${member.displayNameSnapshot} from ${folder.name}?\n\n${member.displayNameSnapshot} still has active shared expenses in this Folder.\n\nCurrent balance: ${summary}\n\nRemoving access will not remove or settle these obligations. Historical records and the Friend link will remain intact.`:`Remove ${member.displayNameSnapshot} from ${folder.name}?\n\nThey will lose access to this Folder. Historical Contributions, Expenses, settlements, involvement, balances, and the Friend link will remain intact.`))
                        await removeMember(uid, folder, member);
                    }}
                  >
                    Remove
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Delete Shared Folder</h2>
        <p className="muted-copy">
          Deleting this folder removes access for every member and permanently
          deletes its shared contributions.
        </p>
        <Button
          variant="danger"
          onClick={async () => {
            if (
              confirm(
                `Delete ${folder.name}? This will remove access for all members.`,
              )
            ) {
              await deleteSharedFolder(folder);
              if (folder.sourceFolderId)
                await deleteFolder(uid, folder.sourceFolderId);
              router.replace("/");
            }
          }}
        >
          Delete Folder
        </Button>
      </section>
      <section className="panel">
        <h2>Pending Invitations</h2>
        {!invitations.items.length ? (
          <p className="muted-copy">No pending invitations.</p>
        ) : (
          <div className="share-list">
            {invitations.items.map((invite) => (
              <div key={invite.id}>
                <span>
                  <strong>{invite.recipientNameSnapshot}</strong>
                  <small>
                    {invite.recipientEmail} · {invite.role}
                  </small>
                </span>
                <Button
                  variant="secondary"
                  onClick={() => cancelInvitation(uid, invite)}
                >
                  Cancel Invite
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
