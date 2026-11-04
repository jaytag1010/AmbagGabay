export const normalizeSearchText = (value: string) =>
  value.toLocaleLowerCase().trim().replace(/\s+/g, " ");

export function textMatch(value: string, query: string) {
  const text = normalizeSearchText(value), normalized = normalizeSearchText(query);
  if (!normalized || !text.includes(normalized)) return null;
  return text === normalized ? "exact" : text.startsWith(normalized) ? "starts" : "contains";
}

export function matchRank(value: string, query: string, ranks: [number, number, number]) {
  const match = textMatch(value, query);
  return match === "exact" ? ranks[0] : match === "starts" ? ranks[1] : match === "contains" ? ranks[2] : null;
}
