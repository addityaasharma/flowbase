import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "flowbase:draft:";

/**
 * useState that survives a page refresh (sessionStorage, so it is per tab and gone when the tab closes).
 * Used for open popups and what is typed in them. `deferred` restores after mount, for state that is rendered on the server too.
 */
export function usePersisted<T>(key: string, initial: T, deferred = false) {
  const read = (): T => { try { const s = sessionStorage.getItem(PREFIX + key); return s === null ? initial : (JSON.parse(s) as T); } catch { return initial; } };
  const [v, setV] = useState<T>(() => (deferred || typeof window === "undefined" ? initial : read()));
  const ready = useRef(!deferred);
  useEffect(() => { if (deferred) { setV(read()); ready.current = true; } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
  useEffect(() => {
    if (!ready.current) return;
    try { if (JSON.stringify(v) === JSON.stringify(initial)) sessionStorage.removeItem(PREFIX + key); else sessionStorage.setItem(PREFIX + key, JSON.stringify(v)); } catch { /* storage blocked: just not remembered */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, key]);
  return [v, useCallback((n: T | ((p: T) => T)) => setV(n), [])] as const;
}

/** Forget every saved draft whose key starts with the prefix (call when a popup is closed or submitted). */
export function clearDrafts(prefix: string) {
  try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIX + prefix)) sessionStorage.removeItem(k); } catch { /* ignore */ }
}
