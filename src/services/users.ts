import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { updateProfile, type User } from "firebase/auth";
import { requireDb } from "@/lib/firebase";
import { cleanName } from "@/utils/format";
import { emailLookupId } from "@/utils/identity";
import type { AccentTheme, AppearanceMode, UserProfile } from "@/types";

const fallbackName = (user: User) =>
  cleanName(user.displayName || user.email?.split("@")[0] || "User");
export async function ensureUserProfile(user: User) {
  const db = requireDb();
  const userRef = doc(db, "users", user.uid);
  const meRef = doc(db, "users", user.uid, "friends", "me");
  const [profile, me] = await Promise.all([getDoc(userRef), getDoc(meRef)]);
  const name = fallbackName(user);
  const now = serverTimestamp();
  const writes: Promise<void>[] = [];
  if (!profile.exists())
    writes.push(
      setDoc(userRef, {
        uid: user.uid,
        displayName: name,
        email: user.email,
        photoURL: user.photoURL,
        createdAt: now,
        updatedAt: now,
      }),
    );
  else
    writes.push(
      setDoc(
        userRef,
        {
          displayName: name,
          email: user.email,
          photoURL: user.photoURL,
          updatedAt: now,
        },
        { merge: true },
      ),
    );
  if (!me.exists())
    writes.push(
      setDoc(meRef, {
        name,
        isMe: true,
        archived: false,
        createdAt: now,
        updatedAt: now,
      }),
    );
  else if (me.data().name !== name || me.data().archived)
    writes.push(
      setDoc(
        meRef,
        { name, isMe: true, archived: false, updatedAt: now },
        { merge: true },
      ),
    );
  writes.push(
    setDoc(
      doc(db, "publicProfiles", user.uid),
      {
        uid: user.uid,
        displayName: name,
        photoURL: user.photoURL || null,
        updatedAt: now,
      },
      { merge: true },
    ),
  );
  if (user.email) {
    const normalizedEmail = user.email.trim().toLowerCase();
    writes.push(
      setDoc(
        doc(db, "userDirectory", await emailLookupId(normalizedEmail)),
        {
          uid: user.uid,
          normalizedEmail,
          displayName: name,
          photoURL: user.photoURL || null,
          updatedAt: now,
        },
        { merge: true },
      ),
    );
  }
  await Promise.all(writes);
}
export async function updateDisplayName(user: User, value: string) {
  const name = cleanName(value);
  if (!name) throw new Error("Display name is required.");
  await updateProfile(user, { displayName: name });
  const db = requireDb();
  const now = serverTimestamp();
  await Promise.all([
    updateDoc(doc(db, "users", user.uid), {
      displayName: name,
      updatedAt: now,
    }),
    setDoc(
      doc(db, "users", user.uid, "friends", "me"),
      { name, isMe: true, archived: false, updatedAt: now },
      { merge: true },
    ),
    setDoc(
      doc(db, "publicProfiles", user.uid),
      {
        uid: user.uid,
        displayName: name,
        photoURL: user.photoURL || null,
        updatedAt: now,
      },
      { merge: true },
    ),
  ]);
}
export function subscribeUserProfile(
  uid: string,
  callback: (profile: UserProfile | null) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    doc(requireDb(), "users", uid),
    (snapshot) =>
      callback(snapshot.exists() ? (snapshot.data() as UserProfile) : null),
    onError,
  );
}
export async function updateUserPhoto(
  user: User,
  photoURL: string | null,
  photoStoragePath: string | null,
) {
  await updateProfile(user, { photoURL });
  const now = serverTimestamp();
  const db = requireDb();
  await Promise.all([
    updateDoc(doc(db, "users", user.uid), {
      photoURL,
      photoStoragePath,
      updatedAt: now,
    }),
    setDoc(
      doc(db, "publicProfiles", user.uid),
      {
        uid: user.uid,
        displayName: user.displayName || "User",
        photoURL,
        updatedAt: now,
      },
      { merge: true },
    ),
  ]);
}
export async function updateAppearance(
  uid: string,
  mode: AppearanceMode,
  theme: AccentTheme,
) {
  await updateDoc(doc(requireDb(), "users", uid), {
    appearance: { mode, theme },
    updatedAt: serverTimestamp(),
  });
}
