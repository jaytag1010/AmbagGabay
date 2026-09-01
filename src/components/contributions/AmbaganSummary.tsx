import { Users } from "lucide-react";
import type { ContributionWithExpenses } from "@/types";
import { contributionRoundedShares, contributionTotal, formatMoney, fromCentavos, toCentavos } from "@/utils/money";

export interface AmbaganGroup {
  cents: number;
  participantIds: string[];
}

export function calculateAmbagan(contribution: ContributionWithExpenses) {
  const shares = contributionRoundedShares(contribution);
  const nonZeroShares = [...shares].filter(([, cents]) => cents > 0);
  const grouped = new Map<number, string[]>();
  for (const [participantId, cents] of nonZeroShares) {
    grouped.set(cents, [...(grouped.get(cents) || []), participantId]);
  }
  return {
    participantCount: nonZeroShares.length,
    totalCentavos: nonZeroShares.reduce((total, [, cents]) => total + cents, 0),
    allEqual: grouped.size === 1 && nonZeroShares.length > 0,
    groups: [...grouped].map(([cents, participantIds]) => ({ cents, participantIds }))
      .sort((a, b) => b.cents - a.cents),
  };
}

function joinedNames(ids: string[], labelFor: (id: string) => string) {
  const names = ids.map(labelFor);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} & ${names[2]}`;
  return `${names[0]}, ${names[1]} + ${names.length - 2} others`;
}

export function AmbaganSummary({ contribution, labelFor }: { contribution: ContributionWithExpenses; labelFor: (id: string) => string }) {
  const summary = calculateAmbagan(contribution);
  if (!summary.participantCount) return null;
  const rows: AmbaganGroup[] = summary.allEqual
    ? [{ cents: summary.groups[0].cents, participantIds: summary.groups[0].participantIds }]
    : summary.groups;
  return <section className="ambagan-panel" aria-labelledby={`ambagan-${contribution.id}`}>
    <h3 id={`ambagan-${contribution.id}`}><Users size={18} aria-hidden="true" /> Ambagan</h3>
    <div className="ambagan-list">
      {rows.map(group => <div key={`${group.cents}-${group.participantIds.join("-")}`}>
        <span>{summary.allEqual ? `All (${summary.participantCount} people)` : joinedNames(group.participantIds, labelFor)}</span>
        <strong>{formatMoney(fromCentavos(group.cents))}{group.participantIds.length > 1 ? " each" : ""}</strong>
      </div>)}
      <div className="ambagan-total"><span>Total shares</span><strong>{formatMoney(fromCentavos(summary.totalCentavos))}</strong></div>
      {summary.totalCentavos > toCentavos(contributionTotal(contribution)) && <div className="ambagan-benefit"><span>Rounding benefit to payer{new Set(contribution.expenses.map(item => item.payerFriendId || contribution.payerFriendId)).size > 1 ? "s" : ""}</span><strong>{formatMoney(fromCentavos(summary.totalCentavos - toCentavos(contributionTotal(contribution))))}</strong></div>}
    </div>
  </section>;
}
