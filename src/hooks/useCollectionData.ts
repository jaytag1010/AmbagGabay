"use client";
import { useEffect, useState } from "react";
export function useCollectionData<T>(subscribe: ((next: (items: T[]) => void, fail: (error: Error) => void) => () => void) | null) {
  const [items, setItems] = useState<T[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!subscribe) return; setLoading(true); return subscribe(value => { setItems(value); setLoading(false); }, cause => { setError(cause.message); setLoading(false); }); }, [subscribe]);
  return { items, loading, error };
}
