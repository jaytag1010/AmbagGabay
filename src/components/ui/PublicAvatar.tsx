"use client";
import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { Avatar } from "@/components/ui/Avatar";
import { publicProfileRef } from "@/services/identityLinks";
import type { PublicProfile } from "@/types";
export function PublicAvatar({ uid, name }: { uid: string; name: string }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  useEffect(
    () =>
      onSnapshot(publicProfileRef(uid), (snapshot) =>
        setProfile(
          snapshot.exists() ? (snapshot.data() as PublicProfile) : null,
        ),
      ),
    [uid],
  );
  return (
    <Avatar name={profile?.displayName || name} photoURL={profile?.photoURL} />
  );
}
