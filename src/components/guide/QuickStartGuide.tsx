import { Activity, Bell, Calculator, FolderPlus, ReceiptText, UserPlus, WalletCards } from "lucide-react";

const steps = [
  { title: "Add Friends", copy: "Add people you regularly split expenses with.", icon: UserPlus },
  { title: "Create a Folder", copy: "Organize expenses for a trip, meal, event, or shared activity.", icon: FolderPlus },
  { title: "Add Contributions", copy: "Record expense items, payers, and participants.", icon: ReceiptText },
  { title: "Review Ambagan & Balances", copy: "See each person's share and who owes whom.", icon: Calculator },
  { title: "Settle Payments", copy: "Calculate what to pay or receive, then record the settlement.", icon: WalletCards },
  { title: "Track Notifications & Activity", copy: "Review invitations, approvals, updates, and history.", icon: Bell },
];

export function QuickStartGuide() {
  return <section className="quick-start panel" aria-labelledby="quick-start-title">
    <header><Activity aria-hidden="true" /><div><h2 id="quick-start-title">How AmbagGabay Works</h2><p>From adding Friends to settling shared expenses.</p></div></header>
    <ol>{steps.map(({ title, copy, icon: Icon }, index) => <li key={title}>
      <div className="quick-step-number">{index + 1}</div>
      <Icon className="quick-step-icon" aria-hidden="true" />
      <div><h3>{title}</h3><p>{copy}</p></div>
    </li>)}</ol>
  </section>;
}
