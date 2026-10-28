import type { Db } from "@/db/client";
import { learningEvents } from "@/db/schema";
import type { LearningEventKind } from "@/shared/enums";

// Raw signals about what the learner did: rebuild reviews, quiz answers,
// chat questions. The profile_update task later turns a batch of these into
// mastery changes per concept. Events hold summaries, never code.

export interface LearningEventInput {
  projectId: number | null;
  kind: LearningEventKind;
  detail: Record<string, unknown>;
}

export function recordLearningEvent(db: Db, event: LearningEventInput): void {
  db.insert(learningEvents)
    .values({ projectId: event.projectId, kind: event.kind, detail: event.detail })
    .run();
}
