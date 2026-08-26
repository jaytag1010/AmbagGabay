import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { requireDb } from "@/lib/firebase";
import type {
  ContributionInput,
  ContributionWithExpenses,
  Expense,
} from "@/types";
import { cleanName } from "@/utils/format";
import { logActivity } from "@/services/activities";
import { formatMoney } from "@/utils/money";
const contributionsRef = (uid: string, folderId: string) =>
  collection(requireDb(), "users", uid, "folders", folderId, "contributions");
function validate(input: ContributionInput) {
  const title = cleanName(input.title);
  const participants = [...new Set(input.participantIds)];
  if (!title) throw new Error("Contribution title is required.");
  if (!(input.date instanceof Date) || Number.isNaN(input.date.getTime()))
    throw new Error("Choose a valid date.");
  if (!participants.length) throw new Error("Select at least one person.");
  if (!participants.includes(input.payerFriendId))
    throw new Error("The default payer must be one of the selected people.");
  if (!input.expenses.length) throw new Error("Add at least one expense item.");
  const expenses = input.expenses.map((item) => ({
    title: cleanName(item.title),
    amount: Number(item.amount),
    payerFriendId: item.payerFriendId,
    participantIds: [...new Set(item.participantIds)].filter((id) =>
      participants.includes(id),
    ),
  }));
  if (
    expenses.some(
      (item) =>
        !item.title ||
        item.amount <= 0 ||
        !participants.includes(item.payerFriendId) ||
        !item.participantIds.length,
    )
  )
    throw new Error(
      "Every expense needs a title, positive amount, valid payer, and at least one person.",
    );
  return {
    title,
    date: input.date,
    payerFriendId: input.payerFriendId,
    participantIds: participants,
    expenses,
  };
}
export async function saveContribution(
  uid: string,
  folderId: string,
  input: ContributionInput,
  contributionId?: string,
  creatorName?: string,
) {
  const data = validate(input);
  const db = requireDb();
  const contributionRef = contributionId
    ? doc(contributionsRef(uid, folderId), contributionId)
    : doc(contributionsRef(uid, folderId));
  const existingExpenses = contributionId
    ? await getDocs(collection(contributionRef, "expenses"))
    : null;
  const batch = writeBatch(db);
  const now = serverTimestamp();
  batch.set(
    contributionRef,
    {
      title: data.title,
      date: Timestamp.fromDate(data.date),
      payerFriendId: data.payerFriendId,
      participantIds: data.participantIds,
      ...(contributionId ? {} : { createdAt: now, createdByUserId: uid, createdByNameSnapshot: creatorName || "User" }),
      updatedAt: now,
    },
    { merge: true },
  );
  existingExpenses?.docs.forEach((item) => batch.delete(item.ref));
  data.expenses.forEach((item) =>
    batch.set(doc(collection(contributionRef, "expenses")), {
      ...item,
      createdAt: now,
      updatedAt: now,
    }),
  );
  await batch.commit();
  await logActivity(uid, {
    action: contributionId ? "Contribution edited" : "Contribution added",
    description: `${data.title} · ${formatMoney(data.expenses.reduce((sum, item) => sum + item.amount, 0))}`,
    entityType: "contribution",
    entityId: contributionRef.id,
    folderId,
  });
  return contributionRef.id;
}
export function subscribeContributions(
  uid: string,
  folderId: string,
  callback: (items: ContributionWithExpenses[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(contributionsRef(uid, folderId), orderBy("date", "desc")),
    async (snapshot) => {
      try {
        callback(
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
            : new Error("Unable to load expenses."),
        );
      }
    },
    onError,
  );
}
export async function deleteContribution(
  uid: string,
  folderId: string,
  contributionId: string,
) {
  const db = requireDb();
  const ref = doc(contributionsRef(uid, folderId), contributionId);
  const snapshot = await getDoc(ref);
  const title = snapshot.data()?.title || "Contribution";
  const expenses = await getDocs(collection(ref, "expenses"));
  const batch = writeBatch(db);
  expenses.docs.forEach((item) => batch.delete(item.ref));
  batch.delete(ref);
  await batch.commit();
  await logActivity(uid, {
    action: "Contribution deleted",
    description: title,
    entityType: "contribution",
    entityId: contributionId,
    folderId,
  });
}
