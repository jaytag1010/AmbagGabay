import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { requireDb } from "@/lib/firebase";
import type {
  ContributionWithExpenses,
  Expense,
  Folder,
  FolderInvitation,
  FolderMembership,
  FolderPersonRequest,
  Friend,
  SharedFolder,
  SharedPerson,
  Settlement,
} from "@/types";
import { logActivity } from "@/services/activities";
import { getPairNetBalance } from "@/utils/money";
const sharedId = (uid: string, folderId: string) => `${uid}_${folderId}`;
async function shareStep<T>(operation:string,path:string,action:()=>Promise<T>){try{return await action()}catch(cause){if(process.env.NODE_ENV==="development")console.error("Folder invitation failed",{operation,path,code:typeof cause==="object"&&cause&&"code" in cause?String(cause.code):"unknown",message:cause instanceof Error?cause.message:String(cause)});throw cause}}
export async function promotePrivateFolder(
  uid: string,
  folder: Folder,
  ownerName: string,
) {
  const db = requireDb(),
    id = sharedId(uid, folder.id),
    target = doc(db, "sharedFolders", id),
    ownedFolders=await shareStep("check-owned-shared-folder","sharedFolders",()=>getDocs(query(collection(db,"sharedFolders"),where("ownerId","==",uid)))),
    existing = ownedFolders.docs.find(item=>item.id===id);
  if (existing && existing.data().migrationComplete !== false) return id;
  const contributions = await getDocs(
    collection(db, "users", uid, "folders", folder.id, "contributions"),
  );
  const friends = await getDocs(collection(db, "users", uid, "friends"));
  const settlements = await getDocs(
    query(
      collection(db, "users", uid, "settlements"),
      where("folderId", "==", folder.id),
    ),
  );
  const now = serverTimestamp();
  if (!existing) {
    const parentSetup = writeBatch(db);
    parentSetup.set(target, {
      ...folder,
      id,
      ownerId: uid,
      ownerNameSnapshot: ownerName,
      sourceFolderId: folder.id,
      migrationComplete: false,
      createdAt: folder.createdAt || now,
      updatedAt: now,
    });
    await shareStep("create-shared-folder",`sharedFolders/${id}`,()=>parentSetup.commit());
  }
  const ownerMember=doc(target,"members",uid);
  if(!(await getDoc(ownerMember)).exists()){
    const memberSetup=writeBatch(db);
    memberSetup.set(ownerMember, {
      userId: uid,
      role: "owner",
      displayNameSnapshot: ownerName,
      joinedAt: now,
    });
    await shareStep("create-owner-membership",`sharedFolders/${id}/members/${uid}`,()=>memberSetup.commit());
  }
  const accessSetup=writeBatch(db);
  accessSetup.set(doc(db, "users", uid, "sharedFolderMemberships", id), { userId: uid, folderId: id, role: "owner", updatedAt: now },{merge:true});
  await shareStep("create-owner-access",`users/${uid}/sharedFolderMemberships/${id}`,()=>accessSetup.commit());
  const batch = writeBatch(db);
  friends.forEach((friend) =>
    batch.set(doc(target, "people", friend.id), {
      friendId: friend.id,
      linkedUserId:
        friend.id === "me" ? uid : friend.data().linkedUserId || null,
      displayNameSnapshot: friend.id === "me" ? ownerName : friend.data().name,
      photoURLSnapshot: friend.data().photoURL || null,
    }),
  );
  settlements.forEach((item) =>
    batch.set(doc(target, "settlements", item.id), item.data()),
  );
  for (const contribution of contributions.docs) {
    batch.set(
      doc(target, "contributions", contribution.id),
      contribution.data(),
    );
    const expenses = await getDocs(collection(contribution.ref, "expenses"));
    expenses.forEach((expense) =>
      batch.set(
        doc(target, "contributions", contribution.id, "expenses", expense.id),
        expense.data(),
      ),
    );
  }
  batch.update(target,{migrationComplete:true,updatedAt:serverTimestamp()});
  await shareStep("copy-folder-data",`sharedFolders/${id}`,()=>batch.commit());
  return id;
}
export async function inviteToFolder(
  uid: string,
  folder: Folder | SharedFolder,
  ownerName: string,
  friend: Friend,
  role: "editor" | "viewer",
) {
  if (!friend.linkedUserId) throw new Error("Select a Friend with an accepted AmbagGabay account link.");
  if (friend.linkedUserId === uid) throw new Error("You already own this folder.");
  const profile = { uid: friend.linkedUserId, displayName: friend.name };
  const folderId = "ownerId" in folder ? folder.id : await promotePrivateFolder(uid, folder, ownerName),
    db = requireDb(),
    member = await getDoc(
      doc(db, "sharedFolders", folderId, "members", profile.uid),
    );
  if (member.exists())
    throw new Error(`${friend.name} already has access to this Folder.`);
  const notificationRef=doc(collection(db,"users",profile.uid,"notifications"));
  const ownedInvitations=await shareStep("check-pending-invitation","folderInvitations",()=>getDocs(query(collection(db,"folderInvitations"),where("ownerId","==",uid)))),pendingInvitation=ownedInvitations.docs.find(item=>item.data().folderId===folderId&&item.data().recipientUid===profile.uid&&item.data().status==="pending");
  if(pendingInvitation)throw new Error(`An invitation to ${friend.name} is already pending.`);
  const invitationRef = doc(collection(db, "folderInvitations"));
  const invitationBatch=writeBatch(db);
  invitationBatch.set(invitationRef, {
      folderId,
      folderNameSnapshot: folder.name,
      ownerId: uid,
      ownerNameSnapshot: ownerName,
      recipientUid: profile.uid,
      recipientEmail: friend.linkedEmail || "",
      recipientNameSnapshot: profile.displayName,
      role,
      status: "pending",
      createdAt: serverTimestamp(),
      respondedAt: null,
    });
  invitationBatch.set(notificationRef,{type:"folder-invitation",title:"Folder Invitation",message:`${ownerName} invited you to ${folder.name} as ${role}.`,actorUid:uid,recipientUid:profile.uid,recipientNameSnapshot:profile.displayName,folderInvitationId:invitationRef.id,read:false,createdAt:serverTimestamp()});
  await shareStep("create-invitation-and-notification",`folderInvitations/${invitationRef.id} + users/${profile.uid}/notifications/${notificationRef.id}`,()=>invitationBatch.commit());
  try{
    await logActivity(uid, {
      action: "Folder invitation sent",
      description: `${profile.displayName} invited to ${folder.name} as ${role}`,
      entityType: "folder",
      entityId: folderId,
    });
  }catch(cause){if(process.env.NODE_ENV==="development")console.error("Folder invitation activity failed",{operation:"create-owner-activity",path:`users/${uid}/activities`,cause})}
  return { folderId, profile };
}
export function subscribeInvitation(id:string,next:(value:FolderInvitation|null)=>void,onError:(error:Error)=>void){return onSnapshot(doc(requireDb(),"folderInvitations",id),snapshot=>next(snapshot.exists()?({id:snapshot.id,...snapshot.data()}) as FolderInvitation:null),onError)}
export function subscribeInvitations(
  uid: string,
  next: (items: FolderInvitation[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(requireDb(), "folderInvitations"),
      where("recipientUid", "==", uid),
    ),
    (snapshot) =>
      next(
        snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }) as FolderInvitation)
          .filter((item) => item.status === "pending"),
      ),
    onError,
  );
}
export async function respondInvitation(
  uid: string,
  invitation: FolderInvitation,
  accept: boolean,
  displayName: string,
) {
  const db = requireDb(),
    ref = doc(db, "folderInvitations", invitation.id);
  await runTransaction(db, async (tx) => {
    const current = await tx.get(ref);
    if (
      !current.exists() ||
      current.data().status !== "pending" ||
      current.data().recipientUid !== uid
    )
      throw new Error("This invitation is no longer available.");
    if (accept) {
      const memberRef = doc(
        db,
        "sharedFolders",
        invitation.folderId,
        "members",
        uid,
      );
      if ((await tx.get(memberRef)).exists())
        throw new Error("This user already has access to this folder.");
      tx.set(memberRef, {
        userId: uid,
        role: invitation.role,
        displayNameSnapshot: displayName,
        invitationId: invitation.id,
        joinedAt: serverTimestamp(),
      });
      tx.set(doc(db, "users", uid, "sharedFolderMemberships", invitation.folderId), { userId: uid, folderId: invitation.folderId, role: invitation.role, updatedAt: serverTimestamp() });
    }
    tx.update(ref, {
      status: accept ? "accepted" : "declined",
      respondedAt: serverTimestamp(),
    });
    tx.set(doc(collection(db,"users",invitation.ownerId,"notifications")),{type:accept?"folder-invitation-accepted":"folder-invitation-declined",title:accept?"Folder Invitation Accepted":"Folder Invitation Declined",message:accept?`${displayName} accepted your invitation to ${invitation.folderNameSnapshot} as ${invitation.role}.`:`${displayName} declined your invitation to ${invitation.folderNameSnapshot}.`,actorUid:uid,recipientUid:invitation.ownerId,folderInvitationId:invitation.id,read:false,createdAt:serverTimestamp()});
  });
  await logActivity(uid, {
    action: accept
      ? "Folder invitation accepted"
      : "Folder invitation declined",
    description: accept
      ? `${displayName} joined ${invitation.folderNameSnapshot}`
      : invitation.folderNameSnapshot,
    entityType: "folder",
    entityId: invitation.folderId,
  });
}
export function subscribeMemberships(
  uid: string,
  next: (items: FolderMembership[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(requireDb(), "userFolderMemberships"),
      where("userId", "==", uid),
    ),
    (snapshot) =>
      next(
        snapshot.docs.map(
          (item) => ({ id: item.id, ...item.data() }) as FolderMembership,
        ),
      ),
    onError,
  );
}
export async function getSharedFolder(folderId: string) {
  const snapshot = await getDoc(doc(requireDb(), "sharedFolders", folderId));
  return snapshot.exists()
    ? ({ ...snapshot.data(), id: snapshot.id } as SharedFolder)
    : null;
}
export type SharedFolderAccessFailure = "not-found" | "pending" | "removed" | "denied" | "error";
export type SharedFolderAccess = {
  folder: SharedFolder;
  membership: FolderMembership;
  role: "owner" | "editor" | "viewer";
  canRead: true;
  canEdit: boolean;
  canManageSharing: boolean;
};
export type SharedFolderAccessResult = { access: SharedFolderAccess; failure: null } | { access: null; failure: SharedFolderAccessFailure };
export async function resolveSharedFolderAccess(folderId: string, uid: string): Promise<SharedFolderAccessResult> {
  const db = requireDb(), folderPath = `sharedFolders/${folderId}`, memberPath = `${folderPath}/members/${uid}`;
  try {
    const folderSnapshot = await getDoc(doc(db, "sharedFolders", folderId));
    if (!folderSnapshot.exists()) return { access: null, failure: "not-found" };
    const folder = { ...folderSnapshot.data(), id: folderSnapshot.id } as SharedFolder;
    if (folder.ownerId === uid) return { access: { folder, membership: { id: uid, userId: uid, role: "owner", displayNameSnapshot: folder.ownerNameSnapshot, joinedAt: folder.createdAt }, role: "owner", canRead: true, canEdit: true, canManageSharing: true }, failure: null };
    const memberSnapshot = await getDoc(doc(db, "sharedFolders", folderId, "members", uid));
    if (!memberSnapshot.exists()) return { access: null, failure: "removed" };
    const membership = { ...memberSnapshot.data(), id: memberSnapshot.id } as FolderMembership;
    if (membership.userId !== uid || !["editor", "viewer"].includes(membership.role)) return { access: null, failure: "denied" };
    return { access: { folder, membership, role: membership.role as "editor" | "viewer", canRead: true, canEdit: membership.role === "editor", canManageSharing: false }, failure: null };
  } catch (cause) {
    const code = typeof cause === "object" && cause && "code" in cause ? String(cause.code) : "unknown";
    if (process.env.NODE_ENV === "development") console.error("[Folder Open] access resolution failed", { folderPath, memberPath, code, message: cause instanceof Error ? cause.message : String(cause) });
    if (code.includes("permission-denied")) {
      try {
        const invitation = await getDoc(doc(db, "folderInvitations", `${folderId}_${uid}`));
        if (invitation.exists() && invitation.data().status === "pending") return { access: null, failure: "pending" };
        if (invitation.exists() && ["declined", "cancelled"].includes(invitation.data().status)) return { access: null, failure: "denied" };
      } catch { /* Access denial remains the authoritative result. */ }
      return { access: null, failure: "denied" };
    }
    return { access: null, failure: "error" };
  }
}
export function subscribeSharedContributions(
  folderId: string,
  next: (items: ContributionWithExpenses[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(requireDb(), "sharedFolders", folderId, "contributions")),
    async (snapshot) => {
      try {
        const people = await getDocs(collection(requireDb(), "sharedFolders", folderId, "people"));
        const personByUserId = new Map(people.docs.map(item => [item.data().linkedUserId, item.id]));
        next(
          await Promise.all(
            snapshot.docs.map(async (item) => {
              const expenses = await getDocs(collection(item.ref, "expenses"));
              const contribution = {
                id: item.id,
                ...item.data(),
                expenses: expenses.docs.map(
                  (expense) =>
                    ({ id: expense.id, ...expense.data() }) as Expense,
                ),
              } as ContributionWithExpenses;
              if (!contribution.settlementAnchorFriendId && contribution.createdByUserId) contribution.settlementAnchorFriendId = personByUserId.get(contribution.createdByUserId);
              return contribution;
            }),
          ),
        );
      } catch (cause) {
        onError(
          cause instanceof Error
            ? cause
            : new Error("Unable to load shared contributions."),
        );
      }
    },
    onError,
  );
}
export function subscribeSharedSettlements(folderId: string, next: (items: Settlement[]) => void, onError: (error: Error) => void) {
  return onSnapshot(collection(requireDb(), "sharedFolders", folderId, "settlements"), snapshot => next(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as Settlement)), onError);
}
export async function recordSharedSettlement(uid: string, folderId: string, input: { contributionId: string; fromFriendId: string; toFriendId: string; amount: number; contributionTitle: string; expectedPreviouslySettled?: number }) {
  const db = requireDb(), id = `${input.contributionId}_${input.fromFriendId}_${input.toFriendId}`, ref = doc(db, "sharedFolders", folderId, "settlements", id);
  await runTransaction(db, async transaction => {
    const current = await transaction.get(ref), prior = current.exists() ? Number(current.data().amount || 0) : 0;
    if (Math.round(prior * 100) !== Math.round(Number(input.expectedPreviouslySettled || 0) * 100)) throw new Error("This balance changed. Recalculate before settling.");
    const now = serverTimestamp();
    transaction.set(ref, { folderId, contributionId: input.contributionId, fromFriendId: input.fromFriendId, toFriendId: input.toFriendId, amount: prior + input.amount, source: "individual", executedByUserId: uid, date: now, createdAt: current.exists() ? current.data().createdAt : now, updatedAt: now }, { merge: true });
  });
  await logActivity(uid, { action: "Shared payment settled", description: `Settled ${input.contributionTitle}`, entityType: "settlement", entityId: id, folderId });
}
export function subscribeSharedPeople(
  folderId: string,
  next: (items: SharedPerson[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    collection(requireDb(), "sharedFolders", folderId, "people"),
    (snapshot) =>
      next(
        snapshot.docs.map(
          (item) => ({ id: item.id, ...item.data() }) as SharedPerson,
        ),
      ),
    onError,
  );
}
export function subscribeFolderPersonRequests(folderId: string, next: (items: FolderPersonRequest[]) => void, onError: (error: Error) => void) {
  return onSnapshot(collection(requireDb(), "sharedFolders", folderId, "personRequests"), snapshot => next(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as FolderPersonRequest)), onError);
}
export async function requestFolderPeople(uid: string, userName: string, folderId: string, selectedFriends: Friend[]) {
  const people = selectedFriends.filter(friend => !friend.archived).map(friend => ({ sourceFriendId: friend.id, linkedUserId: friend.id === "me" ? uid : friend.linkedUserId || null, displayNameSnapshot: friend.id === "me" ? userName : friend.name, photoURLSnapshot: friend.photoURL || null }));
  if (!people.length) throw new Error("Select at least one person to propose.");
  const db = requireDb(), ref = doc(collection(db, "sharedFolders", folderId, "personRequests")), batch = writeBatch(db);
  batch.set(ref, { folderId, proposerUid: uid, proposerNameSnapshot: userName, people, status: "pending", createdAt: serverTimestamp(), respondedAt: null, respondedBy: null });
  await batch.commit();
  await logActivity(uid, { action: "Folder people proposed", description: `${people.map(person => person.displayNameSnapshot).join(", ")} proposed`, entityType: "folder", entityId: folderId });
}
export async function respondFolderPersonRequest(uid: string, folder: SharedFolder, request: FolderPersonRequest, approve: boolean) {
  if (folder.ownerId !== uid) throw new Error("Only the folder owner can respond.");
  const db = requireDb(), requestRef = doc(db, "sharedFolders", folder.id, "personRequests", request.id), currentPeople = await getDocs(collection(db, "sharedFolders", folder.id, "people")), linkedIds = new Set(currentPeople.docs.map(item => item.data().linkedUserId).filter(Boolean)), batch = writeBatch(db);
  if (approve) request.people.forEach(person => {
    if (person.linkedUserId && linkedIds.has(person.linkedUserId)) return;
    batch.set(doc(db, "sharedFolders", folder.id, "people", `${request.proposerUid}_${person.sourceFriendId}`), { friendId: person.sourceFriendId, linkedUserId: person.linkedUserId || null, displayNameSnapshot: person.displayNameSnapshot, photoURLSnapshot: person.photoURLSnapshot || null, addedByRequestId: request.id });
  });
  batch.update(requestRef, { status: approve ? "approved" : "rejected", respondedAt: serverTimestamp(), respondedBy: uid });
  await batch.commit();
  await logActivity(uid, { action: approve ? "Folder people approved" : "Folder people rejected", description: request.people.map(person => person.displayNameSnapshot).join(", "), entityType: "folder", entityId: folder.id });
}
export async function saveSharedContribution(
  uid: string,
  userName: string,
  folderId: string,
  input: {
    title: string;
    date: Date;
    payerFriendId: string;
    participantIds: string[];
    expenses: Array<{
      title: string;
      amount: number;
      payerFriendId: string;
      participantIds: string[];
    }>;
  },
  contributionId?: string,
) {
  if (!input.title.trim() || !input.expenses.length)
    throw new Error(
      "Complete the contribution and add at least one expense item.",
    );
  const db = requireDb(),
    people = await getDocs(collection(db, "sharedFolders", folderId, "people")),
    settlementAnchorFriendId = people.docs.find(item => item.data().linkedUserId === uid)?.id || input.payerFriendId,
    ref = contributionId
      ? doc(db, "sharedFolders", folderId, "contributions", contributionId)
      : doc(collection(db, "sharedFolders", folderId, "contributions")),
    existing = contributionId
      ? await getDocs(collection(ref, "expenses"))
      : null,
    batch = writeBatch(db),
    now = serverTimestamp();
  batch.set(
    ref,
    {
      title: input.title.trim(),
      date: input.date,
      payerFriendId: input.payerFriendId,
      participantIds: input.participantIds,
      ...(contributionId
        ? {}
        : {
            createdAt: now,
            createdByUserId: uid,
            createdByNameSnapshot: userName,
            settlementAnchorFriendId,
          }),
      updatedAt: now,
    },
    { merge: true },
  );
  existing?.forEach((item) => batch.delete(item.ref));
  input.expenses.forEach((expense) =>
    batch.set(doc(collection(ref, "expenses")), {
      ...expense,
      createdAt: now,
      updatedAt: now,
    }),
  );
  await batch.commit();
  await logActivity(uid, {
    action: contributionId
      ? "Shared Contribution edited"
      : "Shared Contribution created",
    description: `${input.title.trim()} · Created by ${userName}`,
    entityType: "contribution",
    entityId: ref.id,
    folderId,
  });
}
export async function deleteSharedContribution(
  uid: string,
  folderId: string,
  contributionId: string,
) {
  const db = requireDb(),
    ref = doc(db, "sharedFolders", folderId, "contributions", contributionId),
    snapshot = await getDoc(ref),
    expenses = await getDocs(collection(ref, "expenses")),
    batch = writeBatch(db);
  expenses.forEach((item) => batch.delete(item.ref));
  batch.delete(ref);
  await batch.commit();
  await logActivity(uid, {
    action: "Shared Contribution deleted",
    description: snapshot.data()?.title || "Contribution",
    entityType: "contribution",
    entityId: contributionId,
    folderId,
  });
}
export function subscribeSharedFolders(
  uid: string,
  next: (
    items: Array<{ folder: SharedFolder; membership: FolderMembership }>,
  ) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    collection(requireDb(), "users", uid, "sharedFolderMemberships"),
    async (snapshot) => {
      try {
        const values = await Promise.all(
          snapshot.docs.map(async (access) => {
            const folderId = access.data().folderId || access.id;
            const member = await getDoc(doc(requireDb(), "sharedFolders", folderId, "members", uid));
            if (!member.exists()) { await deleteDoc(access.ref); return null; }
            const folder = await getSharedFolder(folderId);
            return folder
              ? {
                  folder,
                  membership: {
                    id: member.id,
                    ...member.data(),
                  } as FolderMembership,
                }
              : null;
          }),
        );
        next(
          values.filter(Boolean) as Array<{
            folder: SharedFolder;
            membership: FolderMembership;
          }>,
        );
      } catch (cause) {
        onError(
          cause instanceof Error
            ? cause
            : new Error("Unable to load shared folders."),
        );
      }
    },
    onError,
  );
}
export async function backfillSharedFolderMemberships(uid: string) {
  const db = requireDb();
  const [owned, invitations] = await Promise.all([getDocs(query(collection(db, "sharedFolders"), where("ownerId", "==", uid))), getDocs(query(collection(db, "folderInvitations"), where("recipientUid", "==", uid)))]);
  const candidates = new Map<string, "owner" | "editor" | "viewer">();
  owned.forEach(item => candidates.set(item.id, "owner"));
  invitations.docs.filter(item => item.data().status === "accepted").forEach(item => candidates.set(item.data().folderId, item.data().role));
  if (!candidates.size) return;
  const batch = writeBatch(db);
  for (const [folderId, role] of candidates) {
    const member = await getDoc(doc(db, "sharedFolders", folderId, "members", uid));
    if (member.exists()) batch.set(doc(db, "users", uid, "sharedFolderMemberships", folderId), { userId: uid, folderId, role, updatedAt: serverTimestamp() }, { merge: true });
  }
  await batch.commit();
}
export async function cancelInvitation(
  uid: string,
  invitation: FolderInvitation,
) {
  const db=requireDb(),batch=writeBatch(db);
  batch.update(doc(db, "folderInvitations", invitation.id), {
    status: "cancelled",
    respondedAt: serverTimestamp(),
  });
  batch.set(doc(collection(db,"users",invitation.recipientUid,"notifications")),{type:"folder-invitation-cancelled",title:"Folder Invitation Cancelled",message:`${invitation.ownerNameSnapshot} cancelled the invitation to ${invitation.folderNameSnapshot}.`,actorUid:uid,recipientUid:invitation.recipientUid,folderInvitationId:invitation.id,read:false,createdAt:serverTimestamp()});
  await batch.commit();
  await logActivity(uid, {
    action: "Invitation cancelled",
    description: `${invitation.recipientNameSnapshot} · ${invitation.folderNameSnapshot}`,
    entityType: "folder",
    entityId: invitation.folderId,
  });
}
export function subscribeFolderMembers(
  folderId: string,
  next: (items: FolderMembership[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    collection(requireDb(), "sharedFolders", folderId, "members"),
    (snapshot) =>
      next(
        snapshot.docs.map(
          (item) => ({ id: item.id, ...item.data() }) as FolderMembership,
        ),
      ),
    onError,
  );
}
export function subscribeFolderInvitations(
  uid: string,
  folderId: string,
  next: (items: FolderInvitation[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(requireDb(), "folderInvitations"),
      where("ownerId", "==", uid),
    ),
    (snapshot) =>
      next(
        snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }) as FolderInvitation)
          .filter((item) => item.folderId===folderId && item.status === "pending"),
      ),
    onError,
  );
}
export async function changeMemberRole(
  uid: string,
  folder: SharedFolder,
  member: FolderMembership,
  role: "editor" | "viewer",
  displayName = member.displayNameSnapshot,
) {
  if (member.role === "owner")
    throw new Error("The Owner role cannot be changed.");
  await updateDoc(
    doc(requireDb(), "sharedFolders", folder.id, "members", member.userId),
    { role },
  );
  await logActivity(uid, {
    action: "Member role changed",
    description: `${displayName} · ${member.role} → ${role} · ${folder.name}`,
    entityType: "folder",
    entityId: folder.id,
  });
}
export async function removeMember(
  uid: string,
  folder: SharedFolder,
  member: FolderMembership,
  displayName = member.displayNameSnapshot,
) {
  if (member.role === "owner") throw new Error("The Owner cannot be removed.");
  const db = requireDb(), batch = writeBatch(db);
  batch.delete(doc(db, "sharedFolders", folder.id, "members", member.userId));
  batch.delete(doc(db, "users", member.userId, "sharedFolderMemberships", folder.id));
  await batch.commit();
  await logActivity(uid, {
    action: "Member removed",
    description: `${displayName} removed from ${folder.name}`,
    entityType: "folder",
    entityId: folder.id,
  });
}
export async function getSharedMemberBalance(folderId:string,userId:string){
  const db=requireDb(),people=await getDocs(collection(db,"sharedFolders",folderId,"people")),person=people.docs.find(item=>item.data().linkedUserId===userId),owner=people.docs.find(item=>item.id==="me");
  if(!person||!owner)return 0;
  const contributions=await new Promise<ContributionWithExpenses[]>((resolve,reject)=>{let unsubscribe=()=>{};unsubscribe=subscribeSharedContributions(folderId,items=>{unsubscribe();resolve(items)},reject)}),settlementDocs=await getDocs(collection(db,"sharedFolders",folderId,"settlements")),settlements=settlementDocs.docs.map(item=>({id:item.id,...item.data()})) as import("@/types").Settlement[];
  return getPairNetBalance(contributions,settlements,owner.id,person.id).netCentavos/100;
}
export async function isSharedFriendInvolved(folder:SharedFolder,friend:Friend){
  if((folder.participantFriendIds||[]).includes(friend.id))return true;
  const db=requireDb(),people=await getDocs(collection(db,"sharedFolders",folder.id,"people")),person=people.docs.find(item=>item.data().linkedUserId===friend.linkedUserId||item.data().friendId===friend.id);if(!person)return false;
  const contributions=await new Promise<ContributionWithExpenses[]>((resolve,reject)=>{let unsubscribe=()=>{};unsubscribe=subscribeSharedContributions(folder.id,items=>{unsubscribe();resolve(items)},reject)}),settlements=await getDocs(collection(db,"sharedFolders",folder.id,"settlements"));
  return contributions.some(c=>c.participantIds.includes(person.id)||c.payerFriendId===person.id||c.expenses.some(e=>e.participantIds.includes(person.id)||e.payerFriendId===person.id))||settlements.docs.some(item=>item.data().fromFriendId===person.id||item.data().toFriendId===person.id);
}
export async function deleteSharedFolder(folder: SharedFolder) {
  const db = requireDb(),
    ref = doc(db, "sharedFolders", folder.id),
    contributions = await getDocs(collection(ref, "contributions")),
    batch = writeBatch(db);
  for (const contribution of contributions.docs) {
    const expenses = await getDocs(collection(contribution.ref, "expenses"));
    expenses.forEach((item) => batch.delete(item.ref));
    batch.delete(contribution.ref);
  }
  for (const child of ["members", "people", "personRequests", "settlements"]) {
    const docs = await getDocs(collection(ref, child));
    docs.forEach((item) => batch.delete(item.ref));
  }
  batch.delete(ref);
  await batch.commit();
}
