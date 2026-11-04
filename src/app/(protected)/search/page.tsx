"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronRight, Search, X } from "lucide-react";
import { HighlightedText } from "@/components/search/HighlightedText";
import { EmptyState, LoadingState, Notice } from "@/components/ui/Feedback";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import { getAccessibleFinancialOverview } from "@/services/financials";
import { subscribeFriends } from "@/services/friends";
import type { ContributionWithExpenses, FolderFinancials, Friend } from "@/types";
import { formatDate } from "@/utils/format";
import { contributionTotal, formatMoney, fromCentavos, overallContributionSettlementProgress } from "@/utils/money";
import { matchRank, normalizeSearchText, textMatch } from "@/utils/search";

type TypeFilter = "all" | "contributions" | "items" | "folders" | "friends";
type StatusFilter = "all" | "active" | "partial" | "settled";
type SearchStatus = Exclude<StatusFilter, "all">;
type Ranked = { rank:number; sortTime:number; stable:string };
type ContributionResult = Ranked & { kind:"contributions"; financial:FolderFinancials; contribution:ContributionWithExpenses; reason:string; reasonName?:string; status:SearchStatus; amount:number; href:string };
type ItemResult = Ranked & { kind:"items"; financial:FolderFinancials; contribution:ContributionWithExpenses; item:ContributionWithExpenses["expenses"][number]; status:SearchStatus; href:string };
type FolderResult = Ranked & { kind:"folders"; financial:FolderFinancials; href:string; matches:number };
type FriendResult = Ranked & { kind:"friends"; friend:Friend; href:string };
type Result = ContributionResult | ItemResult | FolderResult | FriendResult;
const typeFilters:TypeFilter[]=["all","contributions","items","folders","friends"];
const statusFilters:StatusFilter[]=["all","active","partial","settled"];
const titleCase=(value:string)=>value==="all"?"All":value[0].toUpperCase()+value.slice(1);
const millis=(value:ContributionWithExpenses["date"])=>value?.toMillis?.()||0;

export default function SearchPage(){
  const {currentUser}=useAuth(),uid=currentUser!.uid,params=useSearchParams(),router=useRouter();
  const friendSub=useCallback((next:(items:Friend[])=>void,fail:(error:Error)=>void)=>subscribeFriends(uid,next,fail),[uid]);
  const friends=useCollectionData(friendSub),[financials,setFinancials]=useState<FolderFinancials[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[recent,setRecent]=useState<string[]>([]),[expanded,setExpanded]=useState<Record<string,boolean>>({});
  const query=params.get("q")||"",type=(params.get("type") as TypeFilter)||"all",status=(params.get("status") as StatusFilter)||"all",folderId=params.get("folderId"),returnTo=params.get("returnTo")||"/";
  const recentKey=`ambag-search-recent:${uid}`,stateKey=`ambag-search-state:${uid}:${folderId||"home"}`;
  useEffect(()=>{let active=true;getAccessibleFinancialOverview(uid,{includeViewers:true}).then(values=>{if(active)setFinancials(values)}).catch(()=>{if(active)setError("Unable to load searchable records.")}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[uid]);
  useEffect(()=>{try{setRecent(JSON.parse(localStorage.getItem(recentKey)||"[]"));setExpanded(JSON.parse(sessionStorage.getItem(stateKey)||"{}"));const scroll=Number(sessionStorage.getItem(`${stateKey}:scroll`)||0);requestAnimationFrame(()=>window.scrollTo({top:scroll}))}catch{}},[recentKey,stateKey]);
  useEffect(()=>{const save=()=>sessionStorage.setItem(`${stateKey}:scroll`,String(window.scrollY));window.addEventListener("scroll",save,{passive:true});return()=>window.removeEventListener("scroll",save)},[stateKey]);
  const update=(changes:Record<string,string|null>)=>{const next=new URLSearchParams(params.toString());Object.entries(changes).forEach(([key,value])=>value&&value!=="all"?next.set(key,value):next.delete(key));router.replace(`/search?${next.toString()}`,{scroll:false})};
  const remember=(value:string)=>{const clean=value.trim();if(!clean)return;const values=[clean,...recent.filter(item=>normalizeSearchText(item)!==normalizeSearchText(clean))].slice(0,5);setRecent(values);localStorage.setItem(recentKey,JSON.stringify(values))};
  const removeRecent=(value:string)=>{const values=recent.filter(item=>item!==value);setRecent(values);localStorage.setItem(recentKey,JSON.stringify(values))};
  const scoped=useMemo(()=>folderId?financials.filter(value=>value.folder.id===folderId):financials,[financials,folderId]);
  const results=useMemo(()=>{
    const normalized=normalizeSearchText(query);if(!normalized)return[] as Result[];
    const friendNames=new Map(friends.items.map(friend=>[friend.id,friend.name]));friendNames.set("me",currentUser?.displayName||"Me");
    const values:Result[]=[],involvedFriendIds=new Set<string>();
    const route=(financial:FolderFinancials)=>financial.settlementContext?.kind==="shared"?`/shared/${financial.folder.id}`:`/folders/${financial.folder.id}`;
    const contributionStatus=(financial:FolderFinancials,contribution:ContributionWithExpenses)=>{const progress=overallContributionSettlementProgress(contribution,financial.settlements),searchStatus:SearchStatus=progress.partial?"partial":progress.active?"active":"settled",amountCentavos=progress.active?progress.remainingCentavos:progress.totalCentavos;return{searchStatus,amount:amountCentavos?fromCentavos(amountCentavos):contributionTotal(contribution)}};
    for(const financial of scoped){
      const base=route(financial),folderRank=matchRank(financial.folder.name,normalized,[7,8,8]);
      let folderMatches=0;
      for(const contribution of financial.contributions){
        const titleRank=matchRank(contribution.title,normalized,[1,2,3]);
        const personName=(id:string)=>financial.settlementContext?.personNames?.[id]||friendNames.get(id)||"";
        const payerIds=new Set([contribution.payerFriendId,...contribution.expenses.map(item=>item.payerFriendId||contribution.payerFriendId)]),participantIds=new Set([...contribution.participantIds,...contribution.expenses.flatMap(item=>item.participantIds)]);
        payerIds.forEach(id=>involvedFriendIds.add(id));participantIds.forEach(id=>involvedFriendIds.add(id));
        const payer=[...payerIds].map(personName).find(name=>textMatch(name,normalized)),participant=[...participantIds].map(personName).find(name=>textMatch(name,normalized));
        const metadataRank=payer||participant?11:null,{searchStatus,amount}=contributionStatus(financial,contribution);
        if(titleRank!==null||metadataRank!==null){const reason=titleRank!==null?"Matched title":payer?"Matched payer":"Matched participant",reasonName=titleRank!==null?undefined:payer||participant;values.push({kind:"contributions",financial,contribution,reason,reasonName,status:searchStatus,amount,rank:titleRank??metadataRank!,sortTime:millis(contribution.date),stable:`${financial.folder.name}-${contribution.title}-${contribution.id}`,href:`${base}?contribution=${encodeURIComponent(contribution.id)}`});folderMatches++}
        for(const item of contribution.expenses){const rank=matchRank(item.title,normalized,[4,5,6]);if(rank!==null){values.push({kind:"items",financial,contribution,item,status:searchStatus,rank,sortTime:millis(contribution.date),stable:`${financial.folder.name}-${contribution.title}-${item.title}-${item.id}`,href:`${base}?contribution=${encodeURIComponent(contribution.id)}&item=${encodeURIComponent(item.id)}`});folderMatches++}}
      }
      if(folderRank!==null||folderMatches>0)values.push({kind:"folders",financial,rank:folderRank??12,sortTime:0,stable:`${financial.folder.name}-${financial.folder.id}`,href:base,matches:folderMatches});
    }
    for(const friend of friends.items.filter(item=>!item.archived&&!item.isMe&&(!folderId||involvedFriendIds.has(item.id)))){const rank=matchRank(friend.name,normalized,[9,10,10]);if(rank!==null)values.push({kind:"friends",friend,rank,sortTime:0,stable:`${friend.name}-${friend.id}`,href:`/friends/${friend.id}`})}
    return values.filter(value=>(type==="all"||value.kind===type)&&(status==="all"||((value.kind==="contributions"||value.kind==="items")&&value.status===status))).sort((a,b)=>a.rank-b.rank||b.sortTime-a.sortTime||a.stable.localeCompare(b.stable));
  },[query,scoped,friends.items,currentUser?.displayName,folderId,type,status]);
  const groups=typeFilters.slice(1).map(kind=>({kind,items:results.filter(item=>item.kind===kind)})).filter(group=>group.items.length);
  const submit=(event:FormEvent)=>{event.preventDefault();remember(query)};
  const activateRecent=(value:string)=>{remember(value);update({q:value})};
  const persistExpansion=(kind:string)=>{const next={...expanded,[kind]:!expanded[kind]};setExpanded(next);sessionStorage.setItem(stateKey,JSON.stringify(next))};
  const statusLabel=(value:SearchStatus)=>value==="partial"?"Partial Payment Received":value==="settled"?"✓ Settled":"Active";
  return <div className="search-page">
    <header className="search-page-header"><div><small>{folderId?"Folder Search":"AmbagGabay Search"}</small><h1>Search</h1></div><Link href={returnTo.startsWith("/")?returnTo:"/"} className="icon-button" aria-label="Close search"><X/></Link></header>
    <form className="search-box" onSubmit={submit}><Search size={20}/><input autoFocus value={query} onChange={event=>update({q:event.target.value})} placeholder="Search contributions, items, friends…" aria-label="Search"/><button type="button" className="icon-button" aria-label="Clear search" onClick={()=>update({q:null})}><X size={18}/></button></form>
    <div className="search-filters" role="group" aria-label="Search result type">{typeFilters.map(value=><button key={value} aria-pressed={type===value} className={type===value?"active":""} onClick={()=>update({type:value})}>{titleCase(value)}</button>)}</div>
    <div className="search-filters status-filters" role="group" aria-label="Contribution status">{statusFilters.map(value=><button key={value} aria-pressed={status===value} className={status===value?"active":""} onClick={()=>update({status:value})}>{value==="all"?"All Status":titleCase(value)}</button>)}</div>
    <Notice message={error||friends.error}/>
    {loading||friends.loading?<LoadingState label="Preparing authorized search…"/>:!normalizeSearchText(query)?recent.length>0&&<section className="recent-searches"><header><h2>Recent Searches</h2><button onClick={()=>{setRecent([]);localStorage.removeItem(recentKey)}}>Clear Recent</button></header>{recent.map(value=><div key={value}><button onClick={()=>activateRecent(value)}><Search size={16}/>{value}</button><button aria-label={`Remove ${value} from recent searches`} onClick={()=>removeRecent(value)}><X size={16}/></button></div>)}</section>:!results.length?<EmptyState title={`No results found for “${query.trim()}”.`} description="Try searching a contribution, item, folder, or friend."/>:<div className="search-results">{groups.map(group=>{const shown=expanded[group.kind]?group.items:group.items.slice(0,8);return <section key={group.kind}><h2>{titleCase(group.kind)}</h2><div className="search-result-list">{shown.map(result=><Link className="search-result-row" href={result.href} key={`${result.kind}-${result.stable}`} onClick={()=>{remember(query);sessionStorage.setItem(`${stateKey}:scroll`,String(window.scrollY))}} aria-label={result.kind==="friends"?`Open ${result.friend.name}`:result.kind==="folders"?`Open ${result.financial.folder.name}`:result.kind==="items"?`Open ${result.item.title} in ${result.contribution.title}`:`Open ${result.contribution.title} in ${result.financial.folder.name}`}>
      <div className="search-result-content">{result.kind==="friends"?<><strong><HighlightedText text={result.friend.name} query={query}/></strong><small>Open Friend Details</small></>:result.kind==="folders"?<><strong><HighlightedText text={result.financial.folder.name} query={query}/></strong><small>{result.financial.settlementContext?.kind==="shared"?"Shared Folder":"Folder"}{result.matches?` · ${result.matches} matching result${result.matches===1?"":"s"}`:""}</small><em>{textMatch(result.financial.folder.name,query)?"Matched folder name":"Matching records in folder"}</em></>:result.kind==="items"?<><strong><HighlightedText text={result.item.title} query={query}/></strong><small>{result.contribution.title} · {result.financial.folder.name}</small><em>Matched item</em></>:<><strong><HighlightedText text={result.contribution.title} query={query}/></strong><small>{result.financial.folder.name} · {formatDate(result.contribution.date)}</small><em>{result.reason}{result.reasonName&&<>: <HighlightedText text={result.reasonName} query={query}/></>}</em><span className={`search-status ${result.status}`}>{statusLabel(result.status)}</span></>}</div>
      {(result.kind==="contributions"||result.kind==="items")&&<strong className="search-result-amount">{formatMoney(result.kind==="items"?result.item.amount:result.amount)}</strong>}<ChevronRight size={18}/>
    </Link>)}</div>{group.items.length>8&&<button className="view-more-search" onClick={()=>persistExpansion(group.kind)}>{expanded[group.kind]?"Show less":`View ${group.items.length-8} more`}</button>}</section>})}</div>}
    <Link href={returnTo.startsWith("/")?returnTo:"/"} className="back-link search-back"><ArrowLeft size={18}/> Back</Link>
  </div>;
}
