import { collection, doc, onSnapshot, orderBy, query, runTransaction, serverTimestamp } from "firebase/firestore";
import { requireDb } from "@/lib/firebase";
import type { Settlement } from "@/types";
import { toCentavos } from "@/utils/money";

export interface RecordSettlementInput { folderId: string; fromFriendId: string; toFriendId: string; amount: number; expectedPreviouslySettled: number; source: "individual" | "all"; description: string }
const settlementId = (value: Pick<RecordSettlementInput, "folderId" | "fromFriendId" | "toFriendId">) => `${value.folderId}_${value.fromFriendId}_${value.toFriendId}`;

export async function recordSettlement(uid: string, input: RecordSettlementInput) {
  if (input.fromFriendId === input.toFriendId || toCentavos(input.amount) <= 0) throw new Error("Invalid settlement amount.");
  const db = requireDb();
  const ref = doc(db, "users", uid, "settlements", settlementId(input));
  await runTransaction(db, async transaction => {
    const current = await transaction.get(ref);
    const previous = current.exists() ? Number(current.data().amount || 0) : 0;
    if (toCentavos(previous) !== toCentavos(input.expectedPreviouslySettled)) throw new Error("This balance changed. Refresh and try again.");
    const now = serverTimestamp();
    transaction.set(ref, { folderId: input.folderId, fromFriendId: input.fromFriendId, toFriendId: input.toFriendId, amount: (toCentavos(previous) + toCentavos(input.amount)) / 100, source: input.source, date: now, createdAt: current.exists() ? current.data().createdAt : now, updatedAt: now }, { merge: true });
    transaction.set(doc(collection(db, "users", uid, "activities")), { action: "settled", description: input.description, entityType: "settlement", entityId: ref.id, folderId: input.folderId, createdAt: now });
  });
}

export function subscribeSettlements(uid: string, callback: (settlements: Settlement[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(query(collection(requireDb(), "users", uid, "settlements"), orderBy("updatedAt", "desc")), snapshot => callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as Settlement))), onError);
}
