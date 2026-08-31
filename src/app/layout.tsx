import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeScript } from "@/components/layout/ThemeScript";
import "./globals.css";
import "./v130.css";
import "./v151.css";
import "./v170.css";
import "./v200.css";
import "./v210.css";
import "./v213.css";
export const metadata: Metadata = { title: { default: "AmbagGabay", template: "%s · AmbagGabay" }, description: "Track shared expenses, split costs with friends, and settle balances easily.", icons: { icon: [{ url: "/branding/ambaggabay-icon-32.png", sizes: "32x32", type: "image/png" }, { url: "/branding/ambaggabay-icon-48.png", sizes: "48x48", type: "image/png" }], apple: "/branding/ambaggabay-icon-192.png" }, manifest: "/manifest.webmanifest" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" suppressHydrationWarning><body><ThemeScript /><AuthProvider>{children}</AuthProvider></body></html>; }
