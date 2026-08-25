"use client";
import { useState } from "react";
export function usePersistentSort<T extends string>(key: string, fallback: T) {
  const [value, setValueState] = useState<T>(() => {
    if (typeof localStorage === "undefined") return fallback;
    return (localStorage.getItem(`ambag-sort-${key}`) as T) || fallback;
  });
  const setValue = (next: T) => {
    setValueState(next);
    localStorage.setItem(`ambag-sort-${key}`, next);
  };
  return [value, setValue] as const;
}
