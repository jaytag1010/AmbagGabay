import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { requireDb } from "@/lib/firebase";
import type {
  AccountLinkRequest,
  DirectoryEntry,
  Friend,
  PublicProfile,
} from "@/types";
import { emailLookupId, normalizeGmail } from "@/utils/identity";
import { logActivity } from "@/services/activities";

export async function findAccount(gmail: string) {
  const email = normalizeGmail(gmail),
    snapshot = await getDoc(
      doc(requireDb(), "userDirectory", await emailLookupId(email)),
    );
  if (!snapshot.exists())
    throw new Error(
      "No AmbagGabay account found for this Gmail address. Ask them to create an account first.",
    );
  const entry = snapshot.data() as DirectoryEntry,
    publicProfile = await getDoc(doc(requireDb(), "publicProfiles", entry.uid));
  return {
    email,
    profile: (publicProfile.exists()
      ? publicProfile.data()
      : entry) as PublicProfile,
  };
}

export function subscribePendingAccountLink(
  requesterUid: string,
  friendId: string,
  next: (request: AccountLinkRequest | null) => void,
  fail: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(requireDb(), "accountLinkRequests"),
      where("requesterUid", "==", requesterUid),
    ),
    (snapshot) => {
      const pending = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }) as AccountLinkRequest)
        .filter(
          (item) =>
            item.requesterFriendId === friendId && item.status === "pending",
        )
        .sort(
          (a, b) =>
            (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0),
        )[0];
      next(pending || null);
    },
    fail,
  );
}

export async function sendAccountLinkRequest(input: {
  requesterUid: string;
  requesterName: string;
  friend: Friend;
  targetEmail: string;
  targetProfile: PublicProfile;
}) {
  if (input.targetProfile.uid === input.requesterUid)
    throw new Error("You cannot link your own account to another Friend.");
  const db = requireDb(),
    existingLink = await getDoc(
      doc(
        db,
        "users",
        input.requesterUid,
        "friendLinks",
        input.targetProfile.uid,
      ),
    );
  if (existingLink.exists())
    throw new Error(
      `This AmbagGabay account is already linked to ${existingLink.data().friendName}.`,
    );
  const requesterRequests = await getDocs(
    query(
      collection(db, "accountLinkRequests"),
      where("requesterUid", "==", input.requesterUid),
    ),
  );
  if (
    requesterRequests.docs.some((item) => {
      const value = item.data();
      return (
        value.status === "pending" &&
        (value.requesterFriendId === input.friend.id ||
          value.targetUid === input.targetProfile.uid)
      );
    })
  )
    throw new Error("A link request for this account is already pending.");
  const requestRef = doc(collection(db, "accountLinkRequests")),
    batch = writeBatch(db);
  batch.set(requestRef, {
    requesterUid: input.requesterUid,
    targetUid: input.targetProfile.uid,
    requesterFriendId: input.friend.id,
    requesterFriendNameSnapshot: input.friend.name,
    requesterNameSnapshot: input.requesterName,
    targetNameSnapshot: input.targetProfile.displayName,
    targetEmailSnapshot: input.targetEmail,
    status: "pending",
    createdAt: serverTimestamp(),
    respondedAt: null,
    declineReason: null,
  });
  batch.set(
    doc(collection(db, "users", input.targetProfile.uid, "notifications")),
    {
      type: "account-link-request",
      title: "Account Link Request",
      message: `${input.requesterName} wants to link your AmbagGabay account to a Friend record named “${input.friend.name}.”`,
      actorUid: input.requesterUid,
      recipientUid: input.targetProfile.uid,
      accountLinkRequestId: requestRef.id,
      read: false,
      createdAt: serverTimestamp(),
    },
  );
  await batch.commit();
  await logActivity(input.requesterUid, {
    action: "Account link requested",
    description: input.friend.name,
    entityType: "friend",
    entityId: input.friend.id,
  });
  return requestRef.id;
}

export function subscribeAccountLinkRequest(
  id: string,
  next: (request: AccountLinkRequest | null) => void,
  fail: (error: Error) => void,
) {
  return onSnapshot(
    doc(requireDb(), "accountLinkRequests", id),
    (snapshot) =>
      next(
        snapshot.exists()
          ? ({ id: snapshot.id, ...snapshot.data() } as AccountLinkRequest)
          : null,
      ),
    fail,
  );
}

export async function respondAccountLinkRequest(
  uid: string,
  request: AccountLinkRequest,
  accept: boolean,
  declineReason = "",
) {
  const db = requireDb(),
    requestRef = doc(db, "accountLinkRequests", request.id),
    friendRef = doc(
      db,
      "users",
      request.requesterUid,
      "friends",
      request.requesterFriendId,
    ),
    lockRef = doc(
      db,
      "users",
      request.requesterUid,
      "friendLinks",
      request.targetUid,
    );
  await runTransaction(db, async (tx) => {
    const current = await tx.get(requestRef);
    if (
      !current.exists() ||
      current.data().status !== "pending" ||
      current.data().targetUid !== uid
    )
      throw new Error("This account-link request is no longer available.");
    const now = serverTimestamp();
    tx.update(requestRef, {
      status: accept ? "accepted" : "declined",
      respondedAt: now,
      declineReason: accept ? null : declineReason.trim() || null,
    });
    if (accept) {
      tx.set(lockRef, {
        friendId: request.requesterFriendId,
        friendName: request.requesterFriendNameSnapshot,
        accountLinkRequestId: request.id,
        createdAt: now,
      });
      tx.update(friendRef, {
        linkedUserId: request.targetUid,
        linkedEmail: request.targetEmailSnapshot,
        linkedDisplayName: request.targetNameSnapshot,
        linkedByRequestId: request.id,
        updatedAt: now,
      });
    }
    tx.set(
      doc(collection(db, "users", request.requesterUid, "notifications")),
      {
        type: accept ? "account-link-accepted" : "account-link-declined",
        title: accept ? "Account Link Accepted" : "Account Link Declined",
        message: accept
          ? `${request.targetNameSnapshot} accepted your request to link the Friend record “${request.requesterFriendNameSnapshot}” to their AmbagGabay account.`
          : `${request.targetNameSnapshot} declined your request to link the Friend record “${request.requesterFriendNameSnapshot}.”${declineReason.trim() ? ` ${declineReason.trim()}` : ""}`,
        actorUid: uid,
        recipientUid: request.requesterUid,
        accountLinkRequestId: request.id,
        read: false,
        createdAt: now,
      },
    );
  });
  await logActivity(uid, {
    action: accept ? "Account link accepted" : "Account link declined",
    description: request.requesterFriendNameSnapshot,
    entityType: "accountLinkRequest",
    entityId: request.id,
  });
}

export async function addReciprocalFriend(uid:string,request:AccountLinkRequest){
  if(request.targetUid!==uid||request.status!=="accepted")throw new Error("This accepted account link is not available.");
  const db=requireDb(),lockRef=doc(db,"users",uid,"friendLinks",request.requesterUid),friendRef=doc(collection(db,"users",uid,"friends"));
  await runTransaction(db,async tx=>{const [lock,current]=await Promise.all([tx.get(lockRef),tx.get(doc(db,"accountLinkRequests",request.id))]);if(lock.exists())throw new Error(`${request.requesterNameSnapshot} is already in your Friends.`);if(!current.exists()||current.data().status!=="accepted"||current.data().targetUid!==uid)throw new Error("This accepted account link is no longer available.");const now=serverTimestamp();tx.set(friendRef,{name:request.requesterNameSnapshot,isMe:false,archived:false,photoURL:null,photoStoragePath:null,linkedUserId:request.requesterUid,linkedDisplayName:request.requesterNameSnapshot,linkedEmail:null,linkedByRequestId:request.id,createdAt:now,updatedAt:now});tx.set(lockRef,{friendId:friendRef.id,friendName:request.requesterNameSnapshot,accountLinkRequestId:request.id,createdAt:now});});
  await logActivity(uid,{action:"Friend added",description:`Added ${request.requesterNameSnapshot} after account link acceptance.`,entityType:"friend",entityId:friendRef.id});
  return friendRef.id;
}

export async function cancelAccountLinkRequest(
  uid: string,
  request: AccountLinkRequest,
) {
  if (request.requesterUid !== uid)
    throw new Error("Only the requester can cancel this request.");
  const db = requireDb(),
    requestRef = doc(db, "accountLinkRequests", request.id);
  await runTransaction(db, async (tx) => {
    const current = await tx.get(requestRef);
    if (!current.exists() || current.data().status !== "pending")
      throw new Error("This account-link request is no longer pending.");
    const now = serverTimestamp();
    tx.update(requestRef, { status: "cancelled", respondedAt: now });
    tx.set(doc(collection(db, "users", request.targetUid, "notifications")), {
      type: "account-link-cancelled",
      title: "Account Link Request Cancelled",
      message: `${request.requesterNameSnapshot} cancelled the request involving the Friend record “${request.requesterFriendNameSnapshot}.”`,
      actorUid: uid,
      recipientUid: request.targetUid,
      accountLinkRequestId: request.id,
      read: false,
      createdAt: now,
    });
  });
  await logActivity(uid, {
    action: "Account link cancelled",
    description: request.requesterFriendNameSnapshot,
    entityType: "accountLinkRequest",
    entityId: request.id,
  });
}

export async function unlinkFriend(uid: string, friend: Friend) {
  if (!friend.linkedUserId) return;
  const db = requireDb();
  await runTransaction(db, async (tx) => {
    tx.delete(doc(db, "users", uid, "friendLinks", friend.linkedUserId!));
    tx.update(doc(db, "users", uid, "friends", friend.id), {
      linkedUserId: null,
      linkedEmail: null,
      linkedDisplayName: null,
      linkedByRequestId: deleteField(),
      updatedAt: serverTimestamp(),
    });
  });
  await logActivity(uid, {
    action: "AmbagGabay account unlinked",
    description: friend.name,
    entityType: "friend",
    entityId: friend.id,
  });
}
export const publicProfileRef = (uid: string) =>
  doc(requireDb(), "publicProfiles", uid);
