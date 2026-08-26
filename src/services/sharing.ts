import {
  collection,
  collectionGroup,
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
} from "@/types";
import { findAccount } from "@/services/identityLinks";
import { logActivity } from "@/services/activities";
const sharedId = (uid: string, folderId: string) => `${uid}_${folderId}`;
export async function promotePrivateFolder(
  uid: string,
  folder: Folder,
  ownerName: string,
) {
  const db = requireDb(),
    id = sharedId(uid, folder.id),
    target = doc(db, "sharedFolders", id);
  if ((await getDoc(target)).exists()) return id;
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
  const batch = writeBatch(db),
    now = serverTimestamp();
  batch.set(target, {
    ...folder,
    ownerId: uid,
    ownerNameSnapshot: ownerName,
    sourceFolderId: folder.id,
    createdAt: folder.createdAt || now,
    updatedAt: now,
  });
  batch.set(doc(target, "members", uid), {
    userId: uid,
    role: "owner",
    displayNameSnapshot: ownerName,
    joinedAt: now,
  });
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
  await batch.commit();
  return id;
}
export async function inviteToFolder(
  uid: string,
  folder: Folder,
  ownerName: string,
  gmail: string,
  role: "editor" | "viewer",
) {
  const { email, profile } = await findAccount(gmail);
  if (profile.uid === uid) throw new Error("You already own this folder.");
  const folderId = await promotePrivateFolder(uid, folder, ownerName),
    db = requireDb(),
    member = await getDoc(
      doc(db, "sharedFolders", folderId, "members", profile.uid),
    );
  if (member.exists())
    throw new Error("This user already has access to this folder.");
  const invitationRef = doc(
    db,
    "folderInvitations",
    `${folderId}_${profile.uid}`,
  );
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(invitationRef);
    if (existing.exists() && existing.data().status === "pending")
      throw new Error("An invitation for this user is already pending.");
    tx.set(invitationRef, {
      folderId,
      folderNameSnapshot: folder.name,
      ownerId: uid,
      ownerNameSnapshot: ownerName,
      recipientUid: profile.uid,
      recipientEmail: email,
      recipientNameSnapshot: profile.displayName,
      role,
      status: "pending",
      createdAt: serverTimestamp(),
      respondedAt: null,
    });
  });
  await logActivity(uid, {
    action: "Folder invitation sent",
    description: `${profile.displayName} invited to ${folder.name} as ${role}`,
    entityType: "folder",
    entityId: folderId,
  });
  return { folderId, profile };
}
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
        joinedAt: serverTimestamp(),
      });
    }
    tx.update(ref, {
      status: accept ? "accepted" : "declined",
      respondedAt: serverTimestamp(),
    });
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
    ? ({ id: snapshot.id, ...snapshot.data() } as SharedFolder)
    : null;
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
        next(
          await Promise.all(
            snapshot.docs.map(async (item) => {
              const expenses = await getDocs(collection(item.ref, "expenses"));
              return {
                id: item.id,
                ...item.data(),
                expenses: expenses.docs.map(
                  (expense) =>
                    ({ id: expense.id, ...expense.data() }) as Expense,
                ),
              } as ContributionWithExpenses;
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
    query(collectionGroup(requireDb(), "members"), where("userId", "==", uid)),
    async (snapshot) => {
      try {
        const values = await Promise.all(
          snapshot.docs.map(async (access) => {
            const folder = await getSharedFolder(access.ref.parent.parent!.id);
            return folder
              ? {
                  folder,
                  membership: {
                    id: access.id,
                    ...access.data(),
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
export async function cancelInvitation(
  uid: string,
  invitation: FolderInvitation,
) {
  await updateDoc(doc(requireDb(), "folderInvitations", invitation.id), {
    status: "cancelled",
    respondedAt: serverTimestamp(),
  });
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
  folderId: string,
  next: (items: FolderInvitation[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(requireDb(), "folderInvitations"),
      where("folderId", "==", folderId),
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
export async function changeMemberRole(
  uid: string,
  folder: SharedFolder,
  member: FolderMembership,
  role: "editor" | "viewer",
) {
  if (member.role === "owner")
    throw new Error("The Owner role cannot be changed.");
  await updateDoc(
    doc(requireDb(), "sharedFolders", folder.id, "members", member.userId),
    { role },
  );
  await logActivity(uid, {
    action: "Member role changed",
    description: `${member.displayNameSnapshot} · ${member.role} → ${role} · ${folder.name}`,
    entityType: "folder",
    entityId: folder.id,
  });
}
export async function removeMember(
  uid: string,
  folder: SharedFolder,
  member: FolderMembership,
) {
  if (member.role === "owner") throw new Error("The Owner cannot be removed.");
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(
    doc(requireDb(), "sharedFolders", folder.id, "members", member.userId),
  );
  await logActivity(uid, {
    action: "Member removed",
    description: `${member.displayNameSnapshot} removed from ${folder.name}`,
    entityType: "folder",
    entityId: folder.id,
  });
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
