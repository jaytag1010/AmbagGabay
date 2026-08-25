import Link from "next/link"; import { ArrowLeft } from "lucide-react"; import { PageHeader } from "@/components/ui/PageHeader";
const sections = [
 ["Getting Started","Create an account, then open Profile to update your name or photo. Add the friends you share costs with, make reusable friend groups, and create folders for each occasion."],
 ["Adding Friends","Open Friends and choose Add friend. Save closes the form; Save & Add Another keeps it open for quick entry. You can add a photo, rename friends, replace or remove photos, and archive people without losing old references."],
 ["Friend Groups","Groups make repeated participant selection faster. Create a group, select any active friends—including Me—and optionally assign it as a folder's default group."],
 ["Folders","Folders organize trips, meals, events, household expenses, and vacations. Create a folder, optionally assign a default group, and use its menu to edit or delete it."],
 ["Creating a Contribution","Choose Add Contribution, select a folder when starting from Home, enter a title and date, choose who paid, review the people involved, add expense items, choose who shares each item, then save."],
 ["Understanding Expense Sharing","Suppose five people join Dinner at McDo. A ₱300 chicken expense shared by only three selected people is divided automatically: ₱300 ÷ 3 = ₱100 each. You only select participants; AmbagGabay calculates their shares."],
 ["Viewing Expenses","A folder's Contributions tab shows complete entries. Expenses shows every item, its amount, participant count, and automatically calculated individual shares."],
 ["People and Balances","People compares each person's amount paid with their personal expense share. “To receive” means the group owes them; “Owes” means they need to pay others."],
 ["Payments and Settlements","Payment recording is not available yet. Current balances represent shared expenses before settlements."],
 ["Profile and Settings","Profile lets you change your picture and display name or sign out. Settings controls your theme and contains this guide."],
];
export default function GuidePage() { return <><Link href="/settings" className="back-link"><ArrowLeft size={18} /> Settings</Link><PageHeader title="How to Use AmbagGabay" description="A simple guide to organizing and sharing expenses." /><div className="guide">{sections.map(([title, copy], index) => <section className="panel" key={title}><span>{index + 1}</span><div><h2>{title}</h2><p>{copy}</p></div></section>)}</div></>; }
