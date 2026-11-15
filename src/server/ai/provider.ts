import type { ProviderId } from "@/shared/enums";

// One interface, two interchangeable providers. Everything above this line
// (tasks, routes, UI) only ever talks to an AIProvider, so switching between
// the API key and the Claude login changes nothing but who answers.

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIRequest {
  /** Task name, for logs only. */
  task: string;
  model: string;
  /** The tutor system prompt (prompts/system.md). */
  system: string;
  /** The project fact sheet. Same for every request about a project, so providers may cache it. */
  cachedContext?: string;
  /**
   * The current level and the code being discussed. Stays the same from one
   * chat turn to the next, so it sits before `context` and can be cached too.
   */
  stableContext?: string;
  /** Task instructions and the learner profile. Changes per request. */
  context?: string;
  /**
   * True for tasks that are likely to be followed by another request with the
   * same start (chat turns, a lesson then questions). Providers that support
   * caching then mark `stableContext` and the earlier messages for reuse.
   */
  cache?: boolean;
  messages: AIMessage[];
  maxTokens: number;
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  ready: boolean;
  /** What we found, e.g. "Key found in .env" or "Signed in (pro plan)". */
  detail: string;
  /** One-line fix when not ready. */
  fix?: string;
}

export interface AIProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** `fresh` skips any cached result (the "Check again" button). */
  status(fresh?: boolean): Promise<ProviderStatus>;
  complete(request: AIRequest, signal?: AbortSignal): Promise<string>;
  stream(request: AIRequest, signal?: AbortSignal): AsyncIterable<string>;
}

export type AIErrorCode = "not_ready" | "provider_failed" | "invalid_output" | "rate_limited";

/** Errors safe to show the learner. The message never contains code or keys. */
export class AIError extends Error {
  constructor(
    readonly code: AIErrorCode,
    message: string,
    readonly provider?: ProviderId,
  ) {
    super(message);
    this.name = "AIError";
  }
}

/** The fixed parts of the system prompt, in the brief's context order. */
export function systemParts(request: AIRequest): string[] {
  return [request.system, request.cachedContext, request.stableContext, request.context].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
}
