import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeScript } from "@/components/layout/ThemeScript";
import "./globals.css";
export const metadata: Metadata = { title: { default: "AmbagGabay", template: "%s · AmbagGabay" }, description: "Shared expenses, guided together." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" suppressHydrationWarning><body><ThemeScript /><AuthProvider>{children}</AuthProvider></body></html>; }
