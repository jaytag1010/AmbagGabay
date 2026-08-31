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
import { requireDb } from "@/lib/firebase";
import { logActivity } from "@/services/activities";
import {
  removeProfilePicture,
  uploadPaymentQR,
} from "@/services/profilePictures";
import type { PaymentMethod, PaymentProvider } from "@/types";

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
    qrCodeStoragePath = keepsQr ? input.existingQrPath : null;
  if (input.qrFile) {
    const uploaded = await uploadPaymentQR(
      ownerUid,
      input.localFriendId ? `friends/${input.localFriendId}` : "user",
      input.qrFile,
    );
    qrCodeUrl = uploaded.qrCodeUrl;
    qrCodeStoragePath = uploaded.qrCodeStoragePath;
  }
  if (ref) await updateDoc(ref, { ...base, qrCodeUrl, qrCodeStoragePath });
  else
    await addDoc(methodsRef(ownerUid, input.localFriendId), {
      ...base,
      qrCodeUrl,
      qrCodeStoragePath,
      isPreferred: false,
      createdAt: serverTimestamp(),
    });
  if (
    (input.removeQr || input.qrFile) &&
    input.existingQrPath &&
    input.existingQrPath !== qrCodeStoragePath
  )
    await removeProfilePicture(input.existingQrPath);
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
  await removeProfilePicture(method.qrCodeStoragePath);
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
