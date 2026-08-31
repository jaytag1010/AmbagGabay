import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { APP_VERSION } from "@/lib/version";
const sections:Array<[string,string,string[]?]> = [
 ["Getting Started","Add Friends, optionally create Groups, create a Folder, add Contributions, review balances, then settle payments."],
 ["Friends","Add and edit Friends, archive or restore them without losing history, and open Friend Details to see payment methods, balances, and only Folders where they participated."],
 ["Groups","Groups are reusable participant templates. A Folder can use a Group, individual Friends, or both, and its people can still be changed independently."],
 ["Folder Sharing","Open Share, select an accepted linked Friend, choose Editor or Viewer, and send an invitation. They review it in Notifications; after acceptance the Folder appears under Shared With Me.",["A warning appears before sharing with someone who is not financially involved; the Owner may still proceed.","Owner: full control. Editor: read and Contribution editing. Viewer: read-only Folder content.","Removing access preserves Contributions, Expenses, settlements, balances, history, and the Friend link."]],
 ["Account Linking","Find an account and send a request. The target must review and accept or decline it; linking is not immediate.",["Linking connects identity, may enable payment approval and authorized payment methods, and never grants Folder access.","Historical settlements are not reopened.","After acceptance, the target may optionally add the requester as a reciprocal Friend without granting Folder access."]],
 ["Contributions & Expenses","A Contribution groups expense items. Each item has its own amount, payer, and participants; its amount is divided equally among selected participants."],
 ["People & Balances","Balances use pair-net logic. If Aiza owes Jayson ₱156.14 and Jayson owes Aiza ₱84.74, the net is Aiza owes Jayson ₱71.40."],
 ["Settle Payments","Select People, select Contributions, calculate, then review. Multiple people may be selected, but each is settled independently.",["Paid: a linked receiver approves the claim.","Received: finalizes immediately.","Owner or Editor actions for non-linked Friends are executory; Viewers cannot execute them."]],
 ["Payment Methods","Save a Bank/Wallet, account name, optional account number, and optional QR. An account number or QR is required. Providers include GCash, Maya, MariBank, Landbank, and Others. Showing a method does not mark anything Paid."],
 ["Active & Settled Shared Expenses","Active Shared Expenses are outstanding, partial, or pending. Settled Shared Expenses are fully resolved."],
 ["Notifications & Activity","Notifications contains settlement, payment, account-link, and Folder-invitation items. Use All, Unread, or Mark All as Read. Activity is the historical audit trail."],
 ["Friend Folder Involvement","A Friend's Folder list uses default Group membership, individual selection, Contribution or Expense participation, payer role, or settlement/history. Shared access alone is not financial involvement."],
 ["Appearance","Choose System, Light, or Dark mode and any available accent theme."],
 ["App Version",`AmbagGabay ${APP_VERSION}`],
];
export default function GuidePage(){return <><Link href="/settings" className="back-link"><ArrowLeft size={18}/> Settings</Link><PageHeader title="How to Use AmbagGabay" description="A practical guide to sharing expenses, access, and settlements."/><div className="guide">{sections.map(([title,copy,bullets],index)=><details className="panel" key={title} open={index===0}><summary>{title}</summary><p>{copy}</p>{bullets&&<ul>{bullets.map(item=><li key={item}>{item}</li>)}</ul>}</details>)}</div></>}
