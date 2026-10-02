import type { ContributionWithExpenses } from "@/types";
import { contributionTotal, formatMoney } from "@/utils/money";

type Comparable = Pick<
  ContributionWithExpenses,
  "title" | "date" | "payerFriendId" | "participantIds" | "expenses"
>;
const ids = (values: string[], label: (id: string) => string) => values.map(label).join(", ");
const payerLabel = (id: string | undefined, label: (id: string) => string) =>
  id ? label(id) : "Unassigned";
export function contributionChangeSummary(before:Comparable,after:Comparable,label:(id:string)=>string){
 const changes:string[]=[];
 if(before.title!==after.title)changes.push(`Title: ${before.title} → ${after.title}`);
 const oldDate=before.date?.toDate?.()||new Date(before.date as unknown as string),newDate=after.date?.toDate?.()||new Date(after.date as unknown as string);
 if(oldDate.toDateString()!==newDate.toDateString())changes.push(`Date: ${oldDate.toLocaleDateString("en-PH")} → ${newDate.toLocaleDateString("en-PH")}`);
 if(before.payerFriendId!==after.payerFriendId)changes.push(`Default payer: ${payerLabel(before.payerFriendId,label)} → ${payerLabel(after.payerFriendId,label)}`);
 const added=after.participantIds.filter(id=>!before.participantIds.includes(id)),removed=before.participantIds.filter(id=>!after.participantIds.includes(id));
 if(added.length)changes.push(`Participants added: ${ids(added,label)}`);if(removed.length)changes.push(`Participants removed: ${ids(removed,label)}`);
 const max=Math.max(before.expenses.length,after.expenses.length);
 for(let index=0;index<max;index++){const old=before.expenses[index],next=after.expenses[index];if(!old&&next){changes.push(`Added item: ${next.title} — ${formatMoney(next.amount)}`);continue}if(old&&!next){changes.push(`Removed item: ${old.title} — ${formatMoney(old.amount)}`);continue}if(!old||!next)continue;const prefix=old.title;if(old.title!==next.title)changes.push(`Item renamed: ${old.title} → ${next.title}`);if(Math.round(old.amount*100)!==Math.round(next.amount*100))changes.push(`${prefix} amount: ${formatMoney(old.amount)} → ${formatMoney(next.amount)}`);if(old.payerFriendId!==next.payerFriendId)changes.push(`${next.title} paid by: ${payerLabel(old.payerFriendId,label)} → ${payerLabel(next.payerFriendId,label)}`);const itemAdded=next.participantIds.filter(id=>!old.participantIds.includes(id)),itemRemoved=old.participantIds.filter(id=>!next.participantIds.includes(id));if(itemAdded.length)changes.push(`${next.title} participants added: ${ids(itemAdded,label)}`);if(itemRemoved.length)changes.push(`${next.title} participants removed: ${ids(itemRemoved,label)}`)}
 const oldTotal=contributionTotal(before as ContributionWithExpenses),newTotal=contributionTotal(after as ContributionWithExpenses);if(Math.round(oldTotal*100)!==Math.round(newTotal*100))changes.unshift(`Total: ${formatMoney(oldTotal)} → ${formatMoney(newTotal)}`);
 return changes;
}
