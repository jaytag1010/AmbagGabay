import Image from "next/image";
export default function AuthLayout({ children }: { children: React.ReactNode }) { return <main className="auth-shell"><section className="auth-brand"><Image className="auth-logo" src="/branding/ambaggabay-logo.png" width={768} height={512} priority alt="AmbagGabay — Track, Share, Settle" /></section>{children}</main>; }
