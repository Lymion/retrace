"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, errorMessage } from "./api-client";

// GET a URL and track loading/error state. State is only set from the
// promise callbacks, and a result is matched to the request that made it,
// so a slow old response can never overwrite a newer one.

export interface FetchState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useFetch<T>(url: string | null): FetchState<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data: T | null;
    error: string | null;
  } | null>(null);
  const key = url === null ? null : `${url}#${attempt}`;

  useEffect(() => {
    if (url === null || key === null) return;
    let cancelled = false;
    apiFetch<T>(url).then(
      (data) => !cancelled && setResult({ key, data, error: null }),
      (error: unknown) => !cancelled && setResult({ key, data: null, error: errorMessage(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, [url, key]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const current = result && result.key === key ? result : null;

  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: key !== null && current === null,
    reload,
  };
}
