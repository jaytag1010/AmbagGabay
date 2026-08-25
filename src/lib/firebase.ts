import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const required = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
export const firebaseConfigured = required.length === 0;
export const firebaseConfigError = firebaseConfigured ? null : `Firebase is not configured. Add ${required.join(", ")} to .env.local and restart the development server.`;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
if (firebaseConfigured) {
  app = getApps().length ? getApp() : initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}
export { app, auth, db, storage };
export function requireAuth(): Auth { if (!auth) throw new Error(firebaseConfigError ?? "Firebase Auth is unavailable."); return auth; }
export function requireDb(): Firestore { if (!db) throw new Error(firebaseConfigError ?? "Firestore is unavailable."); return db; }
export function requireStorage(): FirebaseStorage { if (!storage) throw new Error(firebaseConfigError ?? "Firebase Storage is unavailable."); return storage; }
