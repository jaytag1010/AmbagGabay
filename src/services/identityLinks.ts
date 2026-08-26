import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { requireDb } from "@/lib/firebase";
import type { DirectoryEntry, Friend, PublicProfile } from "@/types";
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
  const entry = snapshot.data() as DirectoryEntry;
  const publicProfile = await getDoc(
    doc(requireDb(), "publicProfiles", entry.uid),
  );
  return {
    email,
    profile: (publicProfile.exists()
      ? publicProfile.data()
      : entry) as PublicProfile,
  };
}
export async function linkFriend(
  uid: string,
  friend: Friend,
  email: string,
  profile: PublicProfile,
) {
  if (profile.uid === uid)
    throw new Error("You cannot link your own account to another Friend.");
  const db = requireDb(),
    lock = doc(db, "users", uid, "friendLinks", profile.uid),
    friendRef = doc(db, "users", uid, "friends", friend.id);
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(lock);
    if (existing.exists())
      throw new Error(
        `This AmbagGabay account is already linked to ${existing.data().friendName}.`,
      );
    tx.set(lock, {
      friendId: friend.id,
      friendName: friend.name,
      createdAt: serverTimestamp(),
    });
    tx.update(friendRef, {
      linkedUserId: profile.uid,
      linkedEmail: email,
      updatedAt: serverTimestamp(),
    });
  });
  await logActivity(uid, {
    action: "Friend linked to AmbagGabay account",
    description: `${friend.name} linked to ${profile.displayName}`,
    entityType: "friend",
    entityId: friend.id,
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
