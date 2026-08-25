"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { UserProfile } from "@/types";

const UserProfileContext = createContext<UserProfile | undefined>(undefined);
export function UserProfileProvider({
  profile,
  children,
}: {
  profile?: UserProfile;
  children: ReactNode;
}) {
  return (
    <UserProfileContext.Provider value={profile}>
      {children}
    </UserProfileContext.Provider>
  );
}
export function useUserProfile() {
  return useContext(UserProfileContext);
}
