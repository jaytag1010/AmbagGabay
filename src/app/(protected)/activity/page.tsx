"use client";
import { useCallback } from "react";
import { Activity as ActivityIcon } from "lucide-react";
import { EmptyState, LoadingState, Notice } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import { subscribeActivities } from "@/services/activities";

export default function ActivityPage() { const uid=useAuth().currentUser!.uid;const subscription=useCallback((next:Parameters<typeof subscribeActivities>[1],fail:NonNullable<Parameters<typeof subscribeActivities>[2]>)=>subscribeActivities(uid,next,fail),[uid]);const activities=useCollectionData(subscription);if(activities.loading)return <LoadingState label="Loading activity…"/>;return <><PageHeader title="Activity" description="Your latest AmbagGabay actions, newest first."/><Notice message={activities.error}/>{!activities.items.length?<EmptyState title="No activity yet." description="Actions such as creating folders, adding friends, and recording contributions will appear here."/>:<div className="activity-list">{activities.items.map(item=>{const date=item.createdAt?.toDate?.();return <article className="activity-card panel" key={item.id}><ActivityIcon size={19}/><div><time>{date?date.toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"}):"Just now"}</time><h2>{item.action}</h2><p>{item.description}</p></div></article>})}</div>}</>; }
