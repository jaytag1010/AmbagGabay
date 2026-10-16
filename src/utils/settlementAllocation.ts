import type { SettlementAllocation } from "@/types";
import { fromCentavos, toCentavos } from "@/utils/money";

const millis = (value: SettlementAllocation["contributionDate"]) => value?.toMillis?.() || 0;

export function oldestFirstAllocations(allocations: SettlementAllocation[], amountCentavos: number) {
  let remaining = amountCentavos;
  return [...allocations]
    .sort((a, b) =>
      millis(a.contributionDate) - millis(b.contributionDate) ||
      millis(a.contributionCreatedAt) - millis(b.contributionCreatedAt) ||
      a.contributionId.localeCompare(b.contributionId),
    )
    .flatMap(allocation => {
      const applied = Math.min(toCentavos(allocation.amount), remaining);
      remaining -= applied;
      return applied > 0 ? [{ ...allocation, amount: fromCentavos(applied) }] : [];
    });
}
