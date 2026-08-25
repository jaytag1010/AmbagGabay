import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { requireDb } from "@/lib/firebase";
import type { Folder, FolderInput } from "@/types";
import { cleanName } from "@/utils/format";

const foldersRef = (uid: string) => collection(requireDb(), "users", uid, "folders");
async function validate(uid: string, input: FolderInput) {
  const name = cleanName(input.name); if (!name) throw new Error("Folder name is required.");
  if (input.defaultFriendGroupId) { const group = await getDoc(doc(requireDb(), "users", uid, "friendGroups", input.defaultFriendGroupId)); if (!group.exists()) throw new Error("The selected default group no longer exists."); }
  return { name, icon: input.icon || "📁", defaultFriendGroupId: input.defaultFriendGroupId || null };
}
export function subscribeFolders(uid: string, callback: (items: Folder[]) => void, onError: (error: Error) => void) { return onSnapshot(query(foldersRef(uid), orderBy("createdAt", "desc")), snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Folder))), onError); }
export async function getFolder(uid: string, id: string) { const result = await getDoc(doc(foldersRef(uid), id)); return result.exists() ? ({ id: result.id, ...result.data() } as Folder) : null; }
export async function createFolder(uid: string, input: FolderInput) { const data = await validate(uid, input); const now = serverTimestamp(); await addDoc(foldersRef(uid), { ...data, createdAt: now, updatedAt: now }); }
export async function updateFolder(uid: string, id: string, input: FolderInput) { const data = await validate(uid, input); await updateDoc(doc(foldersRef(uid), id), { ...data, updatedAt: serverTimestamp() }); }
export async function deleteFolder(uid: string, id: string) { await deleteDoc(doc(foldersRef(uid), id)); }
