import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { requireDb } from "@/lib/firebase";
import type { ActivityEntry } from "@/types";

export type ActivityInput = Omit<ActivityEntry, "id" | "createdAt">;

export async function logActivity(uid: string, activity: ActivityInput) {
  try {
    await addDoc(collection(requireDb(), "users", uid, "activities"), { ...activity, createdAt: serverTimestamp() });
  } catch (error) {
    console.warn("Activity logging failed", error);
  }
}

export function subscribeActivities(uid: string, callback: (activities: ActivityEntry[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(query(collection(requireDb(), "users", uid, "activities"), orderBy("createdAt", "desc"), limit(200)), snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as ActivityEntry))), onError);
}
