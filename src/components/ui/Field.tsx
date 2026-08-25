import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="field"><span>{label}</span><input {...props} /></label>; }
export function SelectField({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) { return <label className="field"><span>{label}</span><select {...props}>{children}</select></label>; }
