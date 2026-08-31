import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { requireAuth, requireDb } from "@/lib/firebase";
import { logActivity } from "@/services/activities";
import type { PaymentMethod, PaymentProvider } from "@/types";

async function uploadPaymentQR(file: File) {
  const token = await requireAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again before uploading an image.");
  const form = new FormData();
  form.set("image", file);
  const response = await fetch("/api/upload/qr", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const payload = (await response.json().catch(() => null)) as {
    url?: string;
    imageId?: string;
    error?: string;
  } | null;
  if (!response.ok || !payload?.url)
    throw new Error(payload?.error || "Unable to upload QR image.");
  return payload;
}

const methodsRef = (ownerUid: string, localFriendId?: string | null) =>
  localFriendId
    ? collection(
        requireDb(),
        "users",
        ownerUid,
        "friends",
        localFriendId,
        "paymentMethods",
      )
    : collection(requireDb(), "users", ownerUid, "paymentMethods");
export function subscribePaymentMethods(
  ownerUid: string,
  localFriendId: string | null | undefined,
  next: (items: PaymentMethod[]) => void,
  fail: (error: Error) => void,
) {
  return onSnapshot(
    query(methodsRef(ownerUid, localFriendId), orderBy("createdAt", "asc")),
    (snapshot) =>
      next(
        snapshot.docs.map(
          (item) => ({ id: item.id, ...item.data() }) as PaymentMethod,
        ),
      ),
    fail,
  );
}
export async function savePaymentMethod(
  ownerUid: string,
  input: {
    id?: string;
    localFriendId?: string | null;
    provider: PaymentProvider;
    customProviderName?: string;
    accountName: string;
    accountNumber?: string;
    qrFile?: File | null;
    existingQrUrl?: string | null;
    existingQrPath?: string | null;
    existingQrImageId?: string | null;
    removeQr?: boolean;
  },
) {
  const accountName = input.accountName.trim(),
    accountNumber = input.accountNumber?.trim() || null,
    custom = input.customProviderName?.trim() || null;
  if (!accountName) throw new Error("Account Name is required.");
  if (input.provider === "other" && !custom)
    throw new Error("Bank / Wallet Name is required for Others.");
  const keepsQr = !!input.existingQrUrl && !input.removeQr;
  if (!accountNumber && !input.qrFile && !keepsQr)
    throw new Error("Enter an account number or upload a QR code.");
  const base = {
      provider: input.provider,
      customProviderName: input.provider === "other" ? custom : null,
      accountName,
      accountNumber,
      updatedAt: serverTimestamp(),
    },
    ref = input.id
      ? doc(methodsRef(ownerUid, input.localFriendId), input.id)
      : null;
  let qrCodeUrl = keepsQr ? input.existingQrUrl : null,
    qrCodeStoragePath = keepsQr ? input.existingQrPath : null,
    qrImageId = keepsQr ? input.existingQrImageId : null;
  if (input.qrFile) {
    const uploaded = await uploadPaymentQR(input.qrFile);
    qrCodeUrl = uploaded.url;
    qrImageId = uploaded.imageId || null;
    qrCodeStoragePath = null;
  }
  if (ref)
    await updateDoc(ref, {
      ...base,
      qrCodeUrl,
      qrImageId,
      qrCodeStoragePath,
    });
  else
    await addDoc(methodsRef(ownerUid, input.localFriendId), {
      ...base,
      qrCodeUrl,
      qrImageId,
      qrCodeStoragePath,
      isPreferred: false,
      createdAt: serverTimestamp(),
    });
  await logActivity(ownerUid, {
    action: input.id ? "Payment method edited" : "Payment method added",
    description: `${input.provider === "other" ? custom : providerLabel(input.provider)} payment method`,
    entityType: "paymentMethod",
  });
}
export async function deletePaymentMethod(
  ownerUid: string,
  method: PaymentMethod,
  localFriendId?: string | null,
) {
  await deleteDoc(doc(methodsRef(ownerUid, localFriendId), method.id));
}
export const providerLabel = (
  provider: PaymentProvider,
  custom?: string | null,
) =>
  provider === "gcash"
    ? "GCash"
    : provider === "maya"
      ? "Maya"
      : provider === "maribank"
        ? "MariBank"
        : provider === "landbank"
          ? "Landbank"
          : custom || "Other";
