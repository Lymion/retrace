import type { RebuildReview, RebuildSpec } from "@/shared/contracts";

export interface RebuildFile {
  path: string;
  content: string;
}

export interface Attempt {
  id: number;
  levelId: number;
  status: "spec" | "submitted" | "reviewed";
  spec: RebuildSpec;
  files: RebuildFile[];
  review: RebuildReview | null;
}

/** A tab in the rebuild editor: the learner's own file, or a read-only original. */
export type Tab =
  { kind: "mine"; path: string } | { kind: "original"; path: string; fileId: number };
