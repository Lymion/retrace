import { and, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { learningEvents } from "@/db/schema";
import { ConceptMastery } from "@/features/progress/ConceptMastery";
import { listProfile } from "@/server/learner/profile";

export const metadata = { title: "Progress · Retrace" };

export default function ProgressPage() {
  const db = getDb();
  const concepts = listProfile(db);
  const pending =
    db
      .select({ n: count() })
      .from(learningEvents)
      .where(and(eq(learningEvents.kind, "chat"), isNull(learningEvents.processedAt)))
      .get()?.n ?? 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Progress</h1>
        <p className="mt-1 text-sm text-muted">What you have mastered and what to practise next.</p>
      </header>
      <ConceptMastery concepts={concepts} pendingQuestions={pending} />
    </div>
  );
}
