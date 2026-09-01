"use client";
import { useCallback, useEffect, useState } from "react";
import { resolveSharedFolderAccess, type SharedFolderAccess, type SharedFolderAccessFailure } from "@/services/sharing";

export function useSharedFolderAccess(folderId: string, uid: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ loading: boolean; access: SharedFolderAccess | null; failure: SharedFolderAccessFailure | "timeout" | null }>({ loading: true, access: null, failure: null });
  useEffect(() => {
    let current = true;
    setState({ loading: true, access: null, failure: null });
    const timeout = window.setTimeout(() => current && setState({ loading: false, access: null, failure: "timeout" }), 12000);
    resolveSharedFolderAccess(folderId, uid).then(result => {
      if (!current) return;
      setState({ loading: false, access: result.access, failure: result.failure });
    }).catch(cause => {
      if (process.env.NODE_ENV === "development") console.error("[Folder Open] unexpected resolver failure", cause);
      if (current) setState({ loading: false, access: null, failure: "error" });
    }).finally(() => window.clearTimeout(timeout));
    return () => { current = false; window.clearTimeout(timeout); };
  }, [folderId, uid, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { ...state, retry };
}
