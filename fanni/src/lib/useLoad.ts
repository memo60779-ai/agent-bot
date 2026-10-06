import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './utils';

/**
 * Minimal data loader: runs `fn` on mount and whenever `deps` change.
 * `autoRefreshMs`: also refresh quietly (no spinner, so lists and half-typed
 * inputs stay put) every N ms while the page is visible, and right away when
 * the user comes back to the app/tab.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = [], opts: { autoRefreshMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refresh = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError(null);
    } catch { /* keep showing the last good data */ }
  }, []);

  const every = opts.autoRefreshMs;
  useEffect(() => {
    if (!every) return;
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 2000) return;
      last = Date.now();
      void refresh();
    };
    const timer = window.setInterval(tick, every);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [every, refresh]);

  return { data, error, loading, reload, refresh, setData };
}

/** Throw Supabase errors so useLoad / try-catch can handle them uniformly. */
export function must<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
