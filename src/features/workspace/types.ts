import type { LevelView } from "@/features/roadmap/LevelMap";

export const MODES = ["tour", "rebuild", "quiz", "audit"] as const;
export type Mode = (typeof MODES)[number];

export interface WorkspaceFile {
  id: number;
  path: string;
  language: string;
  levelId: number | null;
  lineCount: number;
}

export interface WorkspaceProps {
  project: { id: number; name: string };
  levels: LevelView[];
  files: WorkspaceFile[];
  depth: "beginner" | "intermediate" | "advanced";
  initial: { levelId: number | null; fileId: number | null; mode: Mode };
}
