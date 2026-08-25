import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { requireDb } from "@/lib/firebase";
import type { Friend } from "@/types";
import { cleanName } from "@/utils/format";
import { logActivity } from "@/services/activities";

const friendsRef = (uid: string) => collection(requireDb(), "users", uid, "friends");
export function subscribeFriends(uid: string, callback: (items: Friend[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(friendsRef(uid), orderBy("createdAt")), snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Friend))), onError);
}
export async function createFriend(uid: string, value: string) {
  const name = cleanName(value); if (!name) throw new Error("Friend name is required.");
  const now = serverTimestamp(); const created=await addDoc(friendsRef(uid), { name, isMe: false, archived: false, createdAt: now, updatedAt: now }); await logActivity(uid,{action:"Friend added",description:name,entityType:"friend",entityId:created.id});
}
export async function createFriendRecord(uid: string, value: string) { const name = cleanName(value); if (!name) throw new Error("Friend name is required."); const now = serverTimestamp(); const created = await addDoc(friendsRef(uid), { name, isMe: false, archived: false, photoURL: null, photoStoragePath: null, createdAt: now, updatedAt: now }); await logActivity(uid,{action:"Friend added",description:name,entityType:"friend",entityId:created.id}); return created.id; }
export async function renameFriend(uid: string, id: string, value: string) {
  const name = cleanName(value); if (!name) throw new Error("Friend name is required.");
  await updateDoc(doc(friendsRef(uid), id), { name, updatedAt: serverTimestamp() });
  await logActivity(uid,{action:"Friend edited",description:name,entityType:"friend",entityId:id});
}
export async function setFriendArchived(uid: string, friend: Friend, archived: boolean) {
  if (friend.isMe || friend.id === "me") throw new Error("Your Me record cannot be archived.");
  await updateDoc(doc(friendsRef(uid), friend.id), { archived, archivedAt: archived?serverTimestamp():null, updatedAt: serverTimestamp() });
  await logActivity(uid,{action:archived?"Friend archived":"Friend restored",description:friend.name,entityType:"friend",entityId:friend.id});
}
export async function updateFriendPhoto(uid: string, id: string, photoURL: string | null, photoStoragePath: string | null) { await updateDoc(doc(friendsRef(uid), id), { photoURL, photoStoragePath, updatedAt: serverTimestamp() }); }
