// Extension point: outside context for the tutor (for example, notes from a
// separate screen-annotation tool). A provider returns a short piece of text
// that is added to every tutor prompt, after the learner profile.
// See docs/extending.md.

export interface ContextRequest {
  projectId: number;
  /** The file open in the workspace, if any. */
  fileId: number | null;
}

export interface ContextProvider {
  /** Short, unique, lower-case id, e.g. "screen-notes". */
  readonly id: string;
  /** Shown in logs and docs. */
  readonly label: string;
  /** Returns text to add, or null when it has nothing for this request. Must be fast. */
  provide(request: ContextRequest): string | null;
}
