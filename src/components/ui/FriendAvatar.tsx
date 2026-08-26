"use client";
import { Avatar } from "@/components/ui/Avatar";
import { useUserProfile } from "@/components/providers/UserProfileProvider";
import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { publicProfileRef } from "@/services/identityLinks";
import type { Friend, PublicProfile } from "@/types";

export function FriendAvatar({
  friend,
  size = "normal",
}: {
  friend?: Friend;
  size?: "normal" | "large";
}) {
  const profile = useUserProfile();
  const [linked, setLinked] = useState<PublicProfile | null>(null);
  useEffect(() => {
    if (!friend?.linkedUserId) {
      setLinked(null);
      return;
    }
    return onSnapshot(publicProfileRef(friend.linkedUserId), (snapshot) =>
      setLinked(snapshot.exists() ? (snapshot.data() as PublicProfile) : null),
    );
  }, [friend?.linkedUserId]);
  const isMe = friend?.isMe || friend?.id === "me";
  const name = isMe
    ? profile?.displayName || friend?.name || "Me"
    : friend?.name || "Unknown";
  return (
    <Avatar
      name={name}
      photoURL={
        isMe ? profile?.photoURL || null : linked?.photoURL || friend?.photoURL
      }
      size={size}
    />
  );
}
