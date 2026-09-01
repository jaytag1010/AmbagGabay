import type { Friend, SharedFolder, SharedPerson } from "@/types";
import { maskEmail } from "@/utils/privacy";

export function resolveOwnerLinkedIdentity(ownerFriends: Friend[], linkedUid: string, fallbackName?: string | null, fallbackEmail?: string | null) {
  const friend = ownerFriends.find(item => item.linkedUserId === linkedUid), email = friend?.linkedEmail || fallbackEmail || "", maskedEmail = maskEmail(email);
  return { friend, name: friend?.name || fallbackName || maskedEmail || "Linked user", email: maskedEmail };
}

export function resolveFolderPersonLabel({ folder, person, currentUserUid }: { folder: SharedFolder; person?: SharedPerson; currentUserUid: string }) {
  const fallback = person?.displayNameSnapshot || "Linked user";
  if (person?.linkedUserId !== currentUserUid) return fallback;
  return `Me (${folder.ownerId === currentUserUid ? folder.ownerNameSnapshot : fallback})`;
}
