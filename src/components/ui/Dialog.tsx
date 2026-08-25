"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function Dialog({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) { const ref = useRef<HTMLDialogElement>(null); useEffect(() => { const node = ref.current; if (!node) return; if (open && !node.open) node.showModal(); if (!open && node.open) node.close(); }, [open]); return <dialog ref={ref} className="dialog" onCancel={onClose} onClick={event => { if (event.target === ref.current) onClose(); }}><div className="dialog-panel"><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></header>{children}</div></dialog>; }
