import { useFocusEffect } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/supabase';

type QueryState<T> = {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  /** Re-run the query. `silent` keeps the current data on screen without a spinner. */
  refetch: (silent?: boolean) => Promise<void>;
};

/**
 * Runs `fn` whenever the screen gains focus (and when `key` changes), so lists stay
 * fresh after navigating back from a detail screen.
 */
export function useQuery<T>(fn: () => Promise<T>, key: string): QueryState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });
  const loadedOnce = useRef(false);

  const refetch = useCallback(async (silent = false) => {
    if (!silent && loadedOnce.current) setRefreshing(true);
    try {
      const result = await fnRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      loadedOnce.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refetch(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refetch, key]),
  );

  return { data, error, loading, refreshing, refetch };
}

/** Throw PostgREST errors so `useQuery` can surface them. */
export function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
