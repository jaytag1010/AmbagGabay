"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import {
  Activity,
  Bell,
  Home,
  Settings,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { LoadingState, Notice } from "@/components/ui/Feedback";
import { useAuth } from "@/hooks/useAuth";
import { useCollectionData } from "@/hooks/useCollectionData";
import { subscribeUserProfile } from "@/services/users";
import { subscribeNotifications } from "@/services/notifications";
import type { AppNotification, UserProfile } from "@/types";
import { UserProfileProvider } from "@/components/providers/UserProfileProvider";
const links = [
  { href: "/", label: "Home", icon: Home },
  { href: "/friends", label: "Friends", icon: UserRound },
  { href: "/groups", label: "Groups", icon: UsersRound },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const { currentUser, loading, error } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const profileSub = useCallback(
    (next: (items: UserProfile[]) => void, fail: (error: Error) => void) =>
      subscribeUserProfile(
        currentUser!.uid,
        (value) => next(value ? [value] : []),
        fail,
      ),
    [currentUser],
  );
  const profile = useCollectionData(currentUser ? profileSub : null).items[0];
  const notificationSub = useCallback(
    (next: (items: AppNotification[]) => void, fail: (error: Error) => void) =>
      subscribeNotifications(currentUser!.uid, next, fail),
    [currentUser],
  );
  const notifications = useCollectionData(currentUser ? notificationSub : null);
  const unreadCount = notifications.items.filter((item) => !item.read).length;
  useEffect(() => {
    if (!loading && !currentUser)
      router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [loading, currentUser, router, path]);
  if (loading)
    return (
      <main className="center-page">
        <LoadingState label="Opening AmbagGabay…" />
      </main>
    );
  if (!currentUser)
    return (
      <main className="center-page">
        <Notice message={error || "Redirecting to sign in…"} />
      </main>
    );
  const name = currentUser.displayName || "Account";
  return (
    <UserProfileProvider profile={profile}>
      <div className="app-shell">
        <aside className="sidebar">
          <Link href="/" className="brand">
            <Image
              src="/branding/ambaggabay-icon.png"
              width={42}
              height={42}
              alt=""
            />
            <span>AmbagGabay</span>
          </Link>
          <nav>
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={path === href ? "active" : ""}
              >
                <Icon size={20} />
                <span>{label}</span>
                {label === "Notifications" && unreadCount > 0 && (
                  <b
                    className="notification-badge"
                    aria-label={`${unreadCount} unread notifications`}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </b>
                )}
              </Link>
            ))}
          </nav>
          <Link className="sidebar-user" href="/profile">
            <Avatar
              name={name}
              photoURL={profile?.photoURL || currentUser.photoURL}
            />
            <span>
              <strong>{name}</strong>
              <small>View profile</small>
            </span>
          </Link>
        </aside>
        <main className="content">{children}</main>
        <nav className="bottom-nav">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={path === href ? "active" : ""}
            >
              <Icon size={21} />
              <span>{label}</span>
              {label === "Notifications" && unreadCount > 0 && (
                <b
                  className="notification-badge"
                  aria-label={`${unreadCount} unread notifications`}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </b>
              )}
            </Link>
          ))}
        </nav>
      </div>
    </UserProfileProvider>
  );
}
