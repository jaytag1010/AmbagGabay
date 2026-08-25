import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { requireStorage } from "@/lib/firebase";
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]); const limit = 5 * 1024 * 1024;
export function validateImage(file: File) { if (!allowed.has(file.type)) throw new Error("Choose a JPG, PNG, or WebP image."); if (file.size > limit) throw new Error("Images must be 5 MB or smaller."); }
export async function uploadProfilePicture(uid: string, target: "user" | `friends/${string}`, file: File) { validateImage(file); const extension = file.name.split(".").pop()?.toLowerCase() || "jpg"; const path = `profilePictures/${uid}/${target}/${crypto.randomUUID()}.${extension}`; const object = ref(requireStorage(), path); await uploadBytes(object, file, { contentType: file.type }); return { photoURL: await getDownloadURL(object), photoStoragePath: path }; }
export async function removeProfilePicture(path?: string | null) { if (!path) return; try { await deleteObject(ref(requireStorage(), path)); } catch (error) { if (!(error instanceof Error) || !error.message.includes("object-not-found")) throw error; } }
