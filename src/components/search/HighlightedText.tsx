import { normalizeSearchText } from "@/utils/search";

export function HighlightedText({ text, query }: { text: string; query: string }) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return <>{text}</>;
  const index = text.toLocaleLowerCase().indexOf(normalized);
  if (index < 0) return <>{text}</>;
  return <>{text.slice(0,index)}<mark className="search-match">{text.slice(index,index+normalized.length)}</mark>{text.slice(index+normalized.length)}</>;
}
