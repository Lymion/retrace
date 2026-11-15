import type { Settings } from "../settings";

// Which model a task runs on, and how long its answer may be. Every task asks
// here instead of reading the settings directly, so economy mode and the
// depth setting apply everywhere at once.

/** "tutor" tasks need the stronger model; "fast" ones are short and simple. */
export type ModelKind = "tutor" | "fast";

export function modelFor(
  settings: Pick<Settings, "economyMode" | "tutorModel" | "fastModel">,
  kind: ModelKind,
): string {
  return kind === "fast" || settings.economyMode ? settings.fastModel : settings.tutorModel;
}

/**
 * Share of the full output cap per depth. Beginners get the most room
 * (analogies and explained jargon take space); advanced learners need less
 * explaining, so their answers can be tighter.
 */
const DEPTH_SHARE: Record<Settings["depth"], number> = {
  beginner: 1,
  intermediate: 0.85,
  advanced: 0.7,
};

/** Today's caps, which stay the maximum. */
export const OUTPUT_CAPS = { lesson: 3500, chat: 1500 } as const;

export function outputCap(
  settings: Pick<Settings, "depth">,
  task: keyof typeof OUTPUT_CAPS,
): number {
  return Math.round((OUTPUT_CAPS[task] * DEPTH_SHARE[settings.depth]) / 50) * 50;
}
