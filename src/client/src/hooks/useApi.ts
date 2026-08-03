import { useEffect, useCallback, useRef, useState } from 'react';

interface UseApiOptions {
  immediate?: boolean;
}

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApi<T>(url: string, options: UseApiOptions = {}) {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: options.immediate !== false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (mountedRef.current) {
        setState({ data, loading: false, error: null });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (mountedRef.current) {
        setState({ data: null, loading: false, error: err.message });
      }
    }
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    if (options.immediate !== false) {
      fetchData();
    }
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchData, options.immediate]);

  return { ...state, refetch: fetchData };
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
