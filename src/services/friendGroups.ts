import { addDoc, collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { requireDb } from "@/lib/firebase";
import type { FriendGroup, FriendGroupInput } from "@/types";
import { cleanName } from "@/utils/format";

const groupsRef = (uid: string) => collection(requireDb(), "users", uid, "friendGroups");
async function validate(uid: string, input: FriendGroupInput) {
  const name = cleanName(input.name); if (!name) throw new Error("Group name is required.");
  const friendIds = [...new Set(input.friendIds)];
  const friends = await getDocs(collection(requireDb(), "users", uid, "friends"));
  const valid = new Set(friends.docs.map(item => item.id));
  if (friendIds.some(id => !valid.has(id))) throw new Error("The group includes a friend that no longer exists.");
  return { name, friendIds };
}
export function subscribeFriendGroups(uid: string, callback: (items: FriendGroup[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(groupsRef(uid), orderBy("createdAt")), snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as FriendGroup))), onError);
}
export async function createFriendGroup(uid: string, input: FriendGroupInput) { const data = await validate(uid, input); const now = serverTimestamp(); await addDoc(groupsRef(uid), { ...data, createdAt: now, updatedAt: now }); }
export async function updateFriendGroup(uid: string, id: string, input: FriendGroupInput) { const data = await validate(uid, input); await updateDoc(doc(groupsRef(uid), id), { ...data, updatedAt: serverTimestamp() }); }
export async function deleteFriendGroup(uid: string, id: string) {
  const db = requireDb(); const folders = await getDocs(collection(db, "users", uid, "folders")); const batch = writeBatch(db);
  folders.docs.filter(item => item.data().defaultFriendGroupId === id).forEach(item => batch.update(item.ref, { defaultFriendGroupId: null, updatedAt: serverTimestamp() }));
  batch.delete(doc(groupsRef(uid), id)); await batch.commit();
}
