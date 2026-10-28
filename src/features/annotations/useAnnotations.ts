"use client";

import { useEffect, useState } from "react";
import type { ViewerNote } from "@/components/CodeViewer";
import { apiFetch, errorMessage, postJson } from "@/lib/api-client";

// Notes for the open file at the chosen depth: cached ones if they exist,
// otherwise the tutor writes them once and they are cached from then on.

type Depth = "beginner" | "intermediate" | "advanced";
type Result = { key: string; notes: ViewerNote[]; error: Error | null };

export function useAnnotations(
  projectId: number,
  file: { id: number; lineCount: number } | null,
  depth: Depth,
) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const key = file ? `${file.id}:${depth}:${attempt}` : null;
  const fileId = file?.id ?? null;
  const lineCount = file?.lineCount ?? 0;

  useEffect(() => {
    if (fileId === null || key === null) return;
    let cancelled = false;
    const base = `/api/projects/${projectId}/files/${fileId}/annotations`;
    (async () => {
      const cached = await apiFetch<{ annotations: ViewerNote[] }>(`${base}?depth=${depth}`);
      if (cached.annotations.length > 0 || lineCount < 2) return cached.annotations;
      return (await postJson<{ annotations: ViewerNote[] }>(base, { depth })).annotations;
    })().then(
      (notes) => !cancelled && setResult({ key, notes, error: null }),
      (error: unknown) =>
        !cancelled &&
        setResult({
          key,
          notes: [],
          error: error instanceof Error ? error : new Error(errorMessage(error)),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, fileId, lineCount, depth, key]);

  async function regenerate() {
    if (fileId === null || key === null) return;
    setRegenerating(true);
    try {
      const fresh = await postJson<{ annotations: ViewerNote[] }>(
        `/api/projects/${projectId}/files/${fileId}/annotations`,
        { depth, regenerate: true },
      );
      setResult({ key, notes: fresh.annotations, error: null });
    } catch (error) {
      setResult({
        key,
        notes: result?.notes ?? [],
        error: error instanceof Error ? error : new Error(errorMessage(error)),
      });
    } finally {
      setRegenerating(false);
    }
  }

  const current = result && result.key === key ? result : null;
  return {
    notes: current?.notes ?? [],
    error: current?.error ?? null,
    loading: key !== null && current === null,
    regenerating,
    retry: () => setAttempt((n) => n + 1),
    regenerate,
  };
}
