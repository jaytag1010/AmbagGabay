import { Inbox, LoaderCircle } from "lucide-react";
export function LoadingState({ label = "Loading…" }: { label?: string }) { return <div className="state"><LoaderCircle className="spin" aria-hidden /><p>{label}</p></div>; }
export function EmptyState({ title, description, action, icon }: { title: string; description: string; action?: React.ReactNode; icon?: React.ReactNode }) { return <div className="state empty">{icon || <Inbox aria-hidden />}<h2>{title}</h2><p>{description}</p>{action}</div>; }
export function Notice({ message, tone = "error" }: { message?: string | null; tone?: "error" | "success" }) { return message ? <p className={`notice ${tone}`} role="status">{message}</p> : null; }
