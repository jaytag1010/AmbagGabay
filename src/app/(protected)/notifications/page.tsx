"use client";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState, LoadingState, Notice } from "@/components/ui/Feedback";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import { cancelPaymentRequest, markNotificationRead, respondPaymentRequest, subscribeNotifications, subscribeSettlementRequest } from "@/services/notifications";
import type { AppNotification, SettlementRequest } from "@/types";

function RequestActions({notification,uid}:{notification:AppNotification;uid:string}){
 const [request,setRequest]=useState<SettlementRequest|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>notification.settlementRequestId?subscribeSettlementRequest(notification.settlementRequestId,setRequest,e=>setError(e.message)):undefined,[notification.settlementRequestId]);
 async function respond(approve:boolean){if(!request)return;setBusy(true);setError(null);try{const reason=approve?"":window.prompt("Optional reason for disapproval")||"";await respondPaymentRequest(uid,request,approve,reason)}catch(e){setError(e instanceof Error?e.message:"Unable to respond.")}finally{setBusy(false)}}
 if(error)return <Notice message={error}/>;
 if(!request)return null;
 if(request.status!=="pending")return <span className={`request-status ${request.status}`}>{request.status}</span>;
 if(request.approverUid===uid)return <div className="row-actions"><Button disabled={busy} variant="secondary" onClick={()=>respond(false)}>Disapprove</Button><Button disabled={busy} onClick={()=>respond(true)}>Approve</Button></div>;
 if(request.requesterUid===uid)return <Button disabled={busy} variant="secondary" onClick={async()=>{setBusy(true);try{await cancelPaymentRequest(uid,request)}catch(e){setError(e instanceof Error?e.message:"Unable to cancel.")}finally{setBusy(false)}}}>Cancel request</Button>;
 return null;
}

export default function NotificationsPage(){
 const {currentUser}=useAuth(),uid=currentUser?.uid||"",[tab,setTab]=useState<"all"|"unread">("all");
 const subscription=useCallback((next:(items:AppNotification[])=>void,fail:(error:Error)=>void)=>subscribeNotifications(uid,next,fail),[uid]);
 const data=useCollectionData(uid?subscription:null),items=tab==="unread"?data.items.filter(item=>!item.read):data.items;
 return <><PageHeader title="Notifications" subtitle="Payment confirmations and settlement updates."/><div className="tabs notification-tabs"><button className={tab==="all"?"active":""} onClick={()=>setTab("all")}>All</button><button className={tab==="unread"?"active":""} onClick={()=>setTab("unread")}>Unread ({data.items.filter(i=>!i.read).length})</button></div>{data.loading?<LoadingState/>:<Notice message={data.error}/>} {!data.loading&&!items.length&&<EmptyState icon={<Bell/>} title="No notifications" description="Settlement requests and confirmations will appear here."/>}<div className="notification-list">{items.map(item=><article key={item.id} className={`panel notification-card ${item.read?"":"unread"}`} onClick={()=>!item.read&&markNotificationRead(uid,item.id)}><div><h2>{item.title}</h2><p>{item.message}</p><small>{item.createdAt?.toDate?.().toLocaleString()||"Just now"}</small></div><RequestActions notification={item} uid={uid}/></article>)}</div></>;
}
