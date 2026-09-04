import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { requireDb } from "@/lib/firebase";
import type { ContributionWithExpenses, Expense, Folder, FolderFinancials, Friend, Settlement, SharedFolder, SharedPerson } from "@/types";
export async function getFinancialOverview(uid:string):Promise<FolderFinancials[]>{const db=requireDb();const [folders, settlementDocs]=await Promise.all([getDocs(query(collection(db,"users",uid,"folders"),orderBy("createdAt","desc"))),getDocs(collection(db,"users",uid,"settlements"))]);const settlements=settlementDocs.docs.map(item=>({id:item.id,...item.data()} as Settlement));return Promise.all(folders.docs.map(async folderDoc=>{const contributionDocs=await getDocs(query(collection(folderDoc.ref,"contributions"),orderBy("date","desc")));const contributions=await Promise.all(contributionDocs.docs.map(async contributionDoc=>{const expenses=await getDocs(collection(contributionDoc.ref,"expenses"));return {id:contributionDoc.id,...contributionDoc.data(),expenses:expenses.docs.map(item=>({id:item.id,...item.data()} as Expense))} as ContributionWithExpenses}));return {folder:{id:folderDoc.id,...folderDoc.data()} as Folder,contributions,settlements:settlements.filter(item=>item.folderId===folderDoc.id)}}));}

export async function getAccessibleFinancialOverview(uid:string):Promise<FolderFinancials[]> {
  const db=requireDb(), [privateFolders,memberships,friendDocs]=await Promise.all([getFinancialOverview(uid),getDocs(collection(db,"users",uid,"sharedFolderMemberships")),getDocs(collection(db,"users",uid,"friends"))]), friends=friendDocs.docs.map(item=>({id:item.id,...item.data()} as Friend)), sharedResults:FolderFinancials[]=[];
  for(const membership of memberships.docs){
    if(membership.data().role==="viewer")continue;
    const folderSnap=await getDoc(doc(db,"sharedFolders",membership.id));
    if(!folderSnap.exists())continue;
    const folder={id:folderSnap.id,...folderSnap.data()} as SharedFolder;
    const [peopleDocs,contributionDocs,settlementDocs]=await Promise.all([getDocs(collection(db,"sharedFolders",folder.id,"people")),getDocs(collection(db,"sharedFolders",folder.id,"contributions")),getDocs(collection(db,"sharedFolders",folder.id,"settlements"))]);
    const people=peopleDocs.docs.map(item=>({id:item.id,...item.data()} as SharedPerson)), actualToLocal=new Map<string,string>(), localToActual:Record<string,string>={};
    for(const person of people){const local=person.linkedUserId===uid?"me":folder.ownerId===uid?person.friendId:friends.find(friend=>friend.linkedUserId&&friend.linkedUserId===person.linkedUserId)?.id; if(local){actualToLocal.set(person.id,local);localToActual[local]=person.id;}}
    const normalize=(id:string)=>actualToLocal.get(id)||`shared:${folder.id}:${id}`;
    const contributions=await Promise.all(contributionDocs.docs.map(async item=>{const expenses=await getDocs(collection(item.ref,"expenses")),data=item.data();return {id:item.id,...data,payerFriendId:normalize(data.payerFriendId),participantIds:(data.participantIds||[]).map(normalize),settlementAnchorFriendId:normalize(data.settlementAnchorFriendId||data.payerFriendId),expenses:expenses.docs.map(expense=>{const value=expense.data();return{id:expense.id,...value,payerFriendId:normalize(value.payerFriendId||data.payerFriendId),participantIds:(value.participantIds||[]).map(normalize)} as Expense})} as ContributionWithExpenses}));
    const settlements=settlementDocs.docs.map(item=>{const value=item.data();return{id:item.id,...value,fromFriendId:normalize(value.fromFriendId),toFriendId:normalize(value.toFriendId)} as Settlement});
    sharedResults.push({folder,contributions,settlements,settlementContext:{kind:"shared",personIds:localToActual}});
  }
  const sharedSourceIds=new Set(sharedResults.map(item=>(item.folder as SharedFolder).sourceFolderId).filter(Boolean));
  return [...privateFolders.filter(item=>!sharedSourceIds.has(item.folder.id)).map(item=>({...item,settlementContext:{kind:"private" as const}})),...sharedResults];
}
