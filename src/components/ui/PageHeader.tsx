import type { ReactNode } from "react";
export function PageHeader({ title, description, subtitle, action }: { title: string; description?: string; subtitle?: string; action?: ReactNode }) { const copy=description||subtitle; return <header className="page-header"><div><h1>{title}</h1>{copy && <p>{copy}</p>}</div>{action}</header>; }
