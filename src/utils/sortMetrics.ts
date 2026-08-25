import type {
  ContributionWithExpenses,
  FolderFinancials,
  Friend,
} from "@/types";
import {
  calculateBalances,
  effectiveExpensePayer,
  folderTotal,
} from "@/utils/money";
export const alpha = (
  a: { name: string; id: string },
  b: { name: string; id: string },
) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
  a.id.localeCompare(b.id);
export const millis = (value: { toMillis?: () => number } | null | undefined) =>
  value?.toMillis?.() || 0;
export const friendContributionCount = (
  id: string,
  folders: FolderFinancials[],
) =>
  folders.reduce(
    (sum, folder) =>
      sum +
      folder.contributions.filter((c) =>
        c.expenses.some(
          (e) =>
            effectiveExpensePayer(c, e) === id || e.participantIds.includes(id),
        ),
      ).length,
    0,
  );
export const friendAmountInvolved = (id: string, folders: FolderFinancials[]) =>
  folders.reduce(
    (sum, folder) =>
      sum +
      folder.contributions.reduce(
        (inner, c) =>
          inner +
          c.expenses
            .filter(
              (e) =>
                effectiveExpensePayer(c, e) === id ||
                e.participantIds.includes(id),
            )
            .reduce((s, e) => s + e.amount, 0),
        0,
      ),
    0,
  );
export const friendOutstanding = (id: string, folders: FolderFinancials[]) =>
  Math.abs(
    calculateBalances(
      folders.flatMap((f) => f.contributions),
      folders.flatMap((f) => f.settlements),
    ).find((v) => v.friendId === id)?.balance || 0,
  );
export const friendLastFinancialActivity = (
  id: string,
  folders: FolderFinancials[],
) =>
  Math.max(
    0,
    ...folders.flatMap((f) => [
      ...f.contributions
        .filter((c) =>
          c.expenses.some(
            (e) =>
              effectiveExpensePayer(c, e) === id ||
              e.participantIds.includes(id),
          ),
        )
        .map((c) => millis(c.updatedAt || c.date)),
      ...f.settlements
        .filter((s) => s.fromFriendId === id || s.toFriendId === id)
        .map((s) => millis(s.updatedAt || s.date)),
    ]),
  );
export const folderMetrics = (id: string, folders: FolderFinancials[]) => {
  const data = folders.find((f) => f.folder.id === id);
  return {
    total: folderTotal(data?.contributions || []),
    count: data?.contributions.length || 0,
    updated: Math.max(
      millis(data?.folder.updatedAt),
      ...(data?.contributions || []).map((c) => millis(c.updatedAt)),
    ),
  };
};
export const contributionInvolves = (
  friend: Friend,
  c: ContributionWithExpenses,
) =>
  c.expenses.some(
    (e) =>
      effectiveExpensePayer(c, e) === friend.id ||
      e.participantIds.includes(friend.id),
  );
