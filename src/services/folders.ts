import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { requireDb } from "@/lib/firebase";
import type { Folder, FolderInput } from "@/types";
import { cleanName } from "@/utils/format";
import { logActivity } from "@/services/activities";

const foldersRef = (uid: string) => collection(requireDb(), "users", uid, "folders");
async function validate(uid: string, input: FolderInput) {
  const name = cleanName(input.name); if (!name) throw new Error("Folder name is required.");
  if (input.defaultFriendGroupId) { const group = await getDoc(doc(requireDb(), "users", uid, "friendGroups", input.defaultFriendGroupId)); if (!group.exists()) throw new Error("The selected default group no longer exists."); }
  return { name, icon: input.icon || "📁", defaultFriendGroupId: input.defaultFriendGroupId || null, participantFriendIds:[...new Set((input.participantFriendIds||[]).filter(id=>id&&id!=="me"))] };
}
export function subscribeFolders(uid: string, callback: (items: Folder[]) => void, onError: (error: Error) => void) { return onSnapshot(query(foldersRef(uid), orderBy("createdAt", "desc")), snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Folder))), onError); }
export async function getFolder(uid: string, id: string) { const result = await getDoc(doc(foldersRef(uid), id)); return result.exists() ? ({ id: result.id, ...result.data() } as Folder) : null; }
export async function createFolder(uid: string, input: FolderInput) { const data = await validate(uid, input); const now = serverTimestamp(); const created=await addDoc(foldersRef(uid), { ...data, createdAt: now, updatedAt: now }); await logActivity(uid,{action:"Folder created",description:data.name,entityType:"folder",entityId:created.id}); }
export async function updateFolder(uid: string, id: string, input: FolderInput) { const data = await validate(uid, input); await updateDoc(doc(foldersRef(uid), id), { ...data, updatedAt: serverTimestamp() }); await logActivity(uid,{action:"Folder edited",description:data.name,entityType:"folder",entityId:id}); }
export async function deleteFolder(uid: string, id: string) { const db = requireDb(); const folder = doc(foldersRef(uid), id); const snapshot=await getDoc(folder);const name=snapshot.data()?.name||"Folder";const contributions = await getDocs(collection(folder, "contributions")); const batch = writeBatch(db); for (const contribution of contributions.docs) { const expenses = await getDocs(collection(contribution.ref, "expenses")); expenses.docs.forEach(expense => batch.delete(expense.ref)); batch.delete(contribution.ref); } batch.delete(folder); await batch.commit();await logActivity(uid,{action:"Folder deleted",description:name,entityType:"folder",entityId:id}); }
