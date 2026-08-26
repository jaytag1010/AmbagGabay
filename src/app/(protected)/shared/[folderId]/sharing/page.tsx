"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PublicAvatar } from "@/components/ui/PublicAvatar";
import { LoadingState, Notice } from "@/components/ui/Feedback";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import {
  cancelInvitation,
  changeMemberRole,
  deleteSharedFolder,
  getSharedFolder,
  removeMember,
  subscribeFolderInvitations,
  subscribeFolderMembers,
} from "@/services/sharing";
import type { SharedFolder } from "@/types";
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
    [error, setError] = useState<string | null>(null);
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
      <section className="panel">
        <h2>Members</h2>
        <div className="share-list">
          {members.items.map((member) => (
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
                    onClick={() => {
                      if (
                        confirm(
                          `Remove ${member.displayNameSnapshot}? They will immediately lose access to ${folder.name}.`,
                        )
                      )
                        removeMember(uid, folder, member);
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
