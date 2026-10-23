import { Clock3 } from "lucide-react";
import { formatMoney, fromCentavos } from "@/utils/money";

export function PartialPaymentStatus({
  paidAmountCentavos,
  totalAmountCentavos,
}: {
  paidAmountCentavos: number;
  totalAmountCentavos: number;
}) {
  const paid = Math.max(0, Math.min(paidAmountCentavos, totalAmountCentavos));
  const progress = totalAmountCentavos > 0 ? Math.min(100, (paid / totalAmountCentavos) * 100) : 0;

  return (
    <div className="partial-payment-status">
      <span className="partial-payment-badge">
        <Clock3 size={15} aria-hidden="true" /> Partial Payment Received
      </span>
      <div
        className="partial-payment-progress"
        role="progressbar"
        aria-label="Payment received"
        aria-valuemin={0}
        aria-valuemax={totalAmountCentavos}
        aria-valuenow={paid}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="partial-payment-totals">
        <strong>{formatMoney(fromCentavos(paid))} paid</strong>
        <span>{formatMoney(fromCentavos(totalAmountCentavos))} total</span>
      </div>
    </div>
  );
}
