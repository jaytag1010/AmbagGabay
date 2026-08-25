"use client";
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile, type User } from "firebase/auth";
import { firebaseConfigError, firebaseConfigured, requireAuth } from "@/lib/firebase";
import { ensureUserProfile } from "@/services/users";
import { cleanName } from "@/utils/format";

interface AuthValue { currentUser: User | null; loading: boolean; error: string | null; login: (email: string, password: string) => Promise<void>; register: (name: string, email: string, password: string) => Promise<void>; loginWithGoogle: () => Promise<void>; logout: () => Promise<void>; refreshUser: () => Promise<void> }
export const AuthContext = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(firebaseConfigError);
  useEffect(() => { if (!firebaseConfigured) { setLoading(false); return; } return onAuthStateChanged(requireAuth(), async user => { try { if (user) await ensureUserProfile(user); setCurrentUser(user); setError(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to initialize your account."); } finally { setLoading(false); } }); }, []);
  const login = useCallback(async (email: string, password: string) => { const result = await signInWithEmailAndPassword(requireAuth(), email.trim(), password); await ensureUserProfile(result.user); }, []);
  const register = useCallback(async (nameValue: string, email: string, password: string) => { const name = cleanName(nameValue); if (!name) throw new Error("Display name is required."); const result = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password); await updateProfile(result.user, { displayName: name }); await ensureUserProfile(result.user); }, []);
  const loginWithGoogle = useCallback(async () => { const result = await signInWithPopup(requireAuth(), new GoogleAuthProvider()); await ensureUserProfile(result.user); }, []);
  const logout = useCallback(() => signOut(requireAuth()), []);
  const refreshUser = useCallback(async () => { await requireAuth().currentUser?.reload(); setCurrentUser(requireAuth().currentUser); }, []);
  const value = useMemo(() => ({ currentUser, loading, error, login, register, loginWithGoogle, logout, refreshUser }), [currentUser, loading, error, login, register, loginWithGoogle, logout, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
