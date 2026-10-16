import type { Expense } from "@/types";

const timestampMillis = (value: unknown) => {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  return 0;
};

/** Explicit position first; deterministic legacy evidence thereafter. */
export function sortExpenses<T extends Pick<Expense, "id" | "orderIndex" | "createdAt">>(expenses: T[]): T[] {
  return [...expenses].sort((a, b) => {
    const aOrder = Number.isFinite(a.orderIndex) ? Number(a.orderIndex) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(b.orderIndex) ? Number(b.orderIndex) : Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder || timestampMillis(a.createdAt) - timestampMillis(b.createdAt) || a.id.localeCompare(b.id);
  });
}
