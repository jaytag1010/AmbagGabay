"use client";
import { Avatar } from "@/components/ui/Avatar";
import { useUserProfile } from "@/components/providers/UserProfileProvider";
import type { Friend } from "@/types";

export function FriendAvatar({
  friend,
  size = "normal",
}: {
  friend?: Friend;
  size?: "normal" | "large";
}) {
  const profile = useUserProfile();
  const isMe = friend?.isMe || friend?.id === "me";
  const name = isMe
    ? profile?.displayName || friend?.name || "Me"
    : friend?.name || "Unknown";
  return (
    <Avatar
      name={name}
      photoURL={isMe ? profile?.photoURL || null : friend?.photoURL}
      size={size}
    />
  );
}
