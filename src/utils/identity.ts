export function normalizeGmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@gmail\.com$/.test(email))
    throw new Error("Enter a valid Gmail address ending in @gmail.com.");
  return email;
}
export async function emailLookupId(email: string) {
  const bytes = new TextEncoder().encode(email);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
