export function maskEmail(email?: string | null) {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return "";
  const local = email.slice(0, at), domain = email.slice(at);
  if (local.length === 1) return `*${domain}`;
  if (local.length === 2) return `${local[0]}*${local[1]}${domain}`;
  if (local.length === 3) return `${local[0]}*${local[2]}${domain}`;
  if (local.length === 4) return `${local[0]}***${local.slice(-3)}${domain}`;
  return `${local[0]}${"*".repeat(local.length - 4)}${local.slice(-3)}${domain}`;
}
