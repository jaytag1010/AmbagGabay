"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Notice } from "@/components/ui/Feedback";
import { useAuth } from "@/hooks/useAuth";
import { useUserProfile } from "@/components/providers/UserProfileProvider";
import { updateAppearance } from "@/services/users";
import type { AccentTheme, AppearanceMode } from "@/types";
import { APP_VERSION } from "@/lib/version";
const modes: AppearanceMode[] = ["system", "light", "dark"];
const themes: Array<{ id: AccentTheme; name: string; swatch: string }> = [
  { id: "ambag-green", name: "Ambag Green", swatch: "#16775d" },
  { id: "ocean-blue", name: "Ocean Blue", swatch: "#1769aa" },
  { id: "teal", name: "Teal", swatch: "#087f7b" },
  { id: "violet", name: "Violet", swatch: "#7255b5" },
  { id: "rose", name: "Rose", swatch: "#b54368" },
  { id: "amber", name: "Amber", swatch: "#9a6500" },
  { id: "slate", name: "Slate", swatch: "#536477" },
];
function apply(mode: AppearanceMode, theme: AccentTheme) {
  const resolved =
    mode === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.mode = mode;
  document.documentElement.dataset.accent = theme;
  localStorage.setItem("ambag-mode", mode);
  localStorage.setItem("ambag-accent", theme);
}
export default function SettingsPage() {
  const uid = useAuth().currentUser!.uid,
    profile = useUserProfile();
  const [mode, setMode] = useState<AppearanceMode>(
      () =>
        (typeof document !== "undefined"
          ? (document.documentElement.dataset.mode as AppearanceMode)
          : "system") || "system",
    ),
    [theme, setTheme] = useState<AccentTheme>(
      () =>
        (typeof document !== "undefined"
          ? (document.documentElement.dataset.accent as AccentTheme)
          : "ambag-green") || "ambag-green",
    ),
    [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!profile?.appearance) return;
    const nextMode = profile.appearance.mode || "system",
      nextTheme = profile.appearance.theme || "ambag-green";
    setMode(nextMode);
    setTheme(nextTheme);
    apply(nextMode, nextTheme);
  }, [profile?.appearance]);
  useEffect(() => {
    if (mode !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => apply(mode, theme);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [mode, theme]);
  async function choose(
    nextMode: AppearanceMode = mode,
    nextTheme: AccentTheme = theme,
  ) {
    setMode(nextMode);
    setTheme(nextTheme);
    apply(nextMode, nextTheme);
    try {
      await updateAppearance(uid, nextMode, nextTheme);
      setMessage("Appearance saved.");
    } catch {
      setMessage(
        "Appearance applied locally, but could not sync across devices.",
      );
    }
  }
  return (
    <>
      <PageHeader
        title="Settings"
        description="Appearance, help, and information about AmbagGabay."
      />
      <Notice
        message={message}
        tone={message?.includes("saved") ? "success" : "error"}
      />
      <div className="settings-grid">
        <section className="panel">
          <h2>Account</h2>
          <Link href="/profile" className="settings-link">
            <UserRound />
            <span>
              <strong>Profile</strong>
              <small>Photo, display name, account, and sign out</small>
            </span>
          </Link>
          <hr />
          <h2>Appearance</h2>
          <fieldset className="appearance-options">
            <legend>Mode</legend>
            {modes.map((item) => (
              <label key={item}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === item}
                  onChange={() => choose(item, theme)}
                />
                <span>{item[0].toUpperCase() + item.slice(1)}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="theme-options">
            <legend>Accent theme</legend>
            {themes.map((item) => (
              <label
                key={item.id}
                className={theme === item.id ? "selected" : ""}
              >
                <input
                  type="radio"
                  name="accent"
                  checked={theme === item.id}
                  onChange={() => choose(mode, item.id)}
                />
                <i style={{ background: item.swatch }} />
                <span>{item.name}</span>
              </label>
            ))}
          </fieldset>
        </section>
        <section className="panel">
          <h2>Help & Guide</h2>
          <Link href="/settings/guide" className="settings-link">
            <BookOpen />
            <span>
              <strong>How to Use AmbagGabay</strong>
              <small>
                Learn about friends, groups, folders, expenses, and balances.
              </small>
            </span>
          </Link>
          <hr />
          <h2>About</h2>
          <p className="muted-copy">
            AmbagGabay helps friends understand shared costs without the awkward
            guesswork.
          </p>
          <div className="about-version"><span>Version</span><strong>{APP_VERSION}</strong></div>
        </section>
      </div>
    </>
  );
}
