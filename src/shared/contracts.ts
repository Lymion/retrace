import { z } from "zod";
import {
  ANNOTATION_CATEGORIES,
  DEPTHS,
  EVIDENCE,
  LAYERS,
  QUESTION_TYPES,
  SEVERITIES,
} from "./enums";

// What each AI task must return. Both providers' output goes through these
// same schemas, so the rest of the app never sees an unchecked model reply.
// Limits are generous enough for real answers and tight enough to stop a
// runaway reply from filling the database.

const text = (max: number) => z.string().trim().min(1).max(max);
const line = z.number().int().min(1);
const filePath = text(300);

// ---------------------------------------------------------------- roadmap

export const RoadmapLevelSchema = z.object({
  level: z.number().int().min(0).max(30),
  name: text(80),
  goal: text(600),
  files: z.array(filePath).max(2000),
  checkpoint: text(400),
  why_this_order: text(900),
  evidence: z.enum(EVIDENCE),
  skipped: z.boolean(),
});

export const RoadmapSchema = z.object({
  summary: text(1500),
  levels: z.array(RoadmapLevelSchema).min(1).max(20),
  /** Optional corrections to the guessed layer of a file. */
  layers: z.record(z.string(), z.enum(LAYERS)).optional(),
});
export type RoadmapOutput = z.infer<typeof RoadmapSchema>;

// ---------------------------------------------------------------- annotate

export const AnnotationSchema = z.object({
  line,
  end_line: line.optional(),
  note: text(400),
  category: z.enum(ANNOTATION_CATEGORIES),
});

export const AnnotateSchema = z.object({
  annotations: z.array(AnnotationSchema).max(15),
});
export type AnnotateOutput = z.infer<typeof AnnotateSchema>;

// ---------------------------------------------------------------- rebuild

export const AcceptanceCheckSchema = z.object({
  id: text(10),
  description: text(400),
  how_to_verify: text(400),
});

export const RebuildSpecSchema = z.object({
  title: text(120),
  summary: text(1200),
  files_to_write: z
    .array(z.object({ path: filePath, purpose: text(400) }))
    .min(1)
    .max(30),
  inputs: z.array(text(300)).max(12),
  outputs: z.array(text(300)).max(12),
  acceptance_checks: z.array(AcceptanceCheckSchema).length(3),
  concepts: z.array(text(60)).max(10),
});
export type RebuildSpec = z.infer<typeof RebuildSpecSchema>;

const Citation = z.object({ file: filePath, line: line.nullable().optional() });

export const RebuildReviewSchema = z.object({
  summary: text(1500),
  verdicts: z
    .array(
      z.object({
        check_id: text(10),
        passed: z.boolean(),
        explanation: text(800),
        original: Citation.nullable().optional(),
      }),
    )
    .length(3),
  bugs: z
    .array(
      z.object({
        file: filePath,
        line: line.nullable().optional(),
        description: text(600),
        fix: text(800),
        original: Citation.nullable().optional(),
      }),
    )
    .max(20),
  security_gaps: z
    .array(
      z.object({
        file: filePath,
        line: line.nullable().optional(),
        attacker_view: text(600),
        fix: text(800),
      }),
    )
    .max(20),
  approach_differences: z
    .array(
      z.object({
        learner: text(500),
        original: text(500),
        note: text(600),
        original_ref: Citation.nullable().optional(),
      }),
    )
    .max(20),
  concepts: z
    .array(
      z.object({
        name: text(60),
        layer: z.enum(LAYERS),
        result: z.enum(["solid", "shaky", "missed"]),
        note: text(300),
      }),
    )
    .max(15),
});
export type RebuildReview = z.infer<typeof RebuildReviewSchema>;

// ---------------------------------------------------------------- tier 2

export const SecurityAuditSchema = z.object({
  findings: z
    .array(
      z.object({
        file: filePath,
        line: line.nullable().optional(),
        severity: z.enum(SEVERITIES),
        title: text(160),
        attacker_view: text(800),
        fix: text(1200),
      }),
    )
    .max(40),
});
export type SecurityAudit = z.infer<typeof SecurityAuditSchema>;

const OptionSchema = z.object({
  name: text(80),
  pros: z.array(text(200)).min(1).max(6),
  cons: z.array(text(200)).min(1).max(6),
  pick_when: text(400),
});

export const AlternativesSchema = z.object({
  decisions: z
    .array(
      z.object({
        decision: text(80),
        chosen: OptionSchema,
        alternatives: z.array(OptionSchema).length(2),
      }),
    )
    .min(1)
    .max(8),
});
export type AlternativesOutput = z.infer<typeof AlternativesSchema>;

export const GapsSchema = z.object({
  lessons: z.array(z.object({ title: text(160), why_it_matters: text(500) })).max(12),
  missing: z
    .array(z.object({ practice: text(160), why_it_matters: text(500), evidence: text(400) }))
    .max(12),
  checklist: z
    .array(
      z.object({
        title: text(160),
        why_it_matters: text(400),
        source: z.enum(["gap", "lesson"]),
      }),
    )
    .max(20),
});
export type GapsOutput = z.infer<typeof GapsSchema>;

export const QuizQuestionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  prompt: text(800),
  code: z.string().max(4000).nullable().optional(),
  file: filePath.nullable().optional(),
  options: z.array(text(300)).min(2).max(6).nullable().optional(),
  correct_answer: text(1500),
  explanation: text(1500),
  concept: text(60),
});

/** The brief's mix: 2 what-does-this-do, 1 find-the-bug, 1 security, 1 how-would-you-change. */
export const QUIZ_MIX: Record<(typeof QUESTION_TYPES)[number], number> = {
  what_does_this_do: 2,
  find_the_bug: 1,
  security: 1,
  how_would_you_change: 1,
};

export const QuizGenerateSchema = z
  .object({ questions: z.array(QuizQuestionSchema).length(5) })
  .refine(
    (quiz) =>
      Object.entries(QUIZ_MIX).every(
        ([type, count]) => quiz.questions.filter((q) => q.type === type).length === count,
      ),
    {
      message:
        "Need exactly 2 what_does_this_do, 1 find_the_bug, 1 security, 1 how_would_you_change.",
    },
  );
export type QuizGenerateOutput = z.infer<typeof QuizGenerateSchema>;

export const QuizGradeSchema = z.object({
  correct: z.boolean(),
  feedback: text(1200),
  concept: text(60),
});
export type QuizGrade = z.infer<typeof QuizGradeSchema>;

export const RemixSchema = z.object({
  title: text(120),
  domain: text(80),
  spec: z.object({
    summary: text(1200),
    inputs: z.array(text(300)).max(10),
    outputs: z.array(text(300)).max(10),
    acceptance_checks: z.array(AcceptanceCheckSchema).length(3),
  }),
  patterns_reused: z.array(text(200)).min(1).max(8),
  files_needed: z
    .array(z.object({ path: filePath, purpose: text(400) }))
    .min(1)
    .max(20),
  skeleton: z
    .array(z.object({ path: filePath, content: z.string().max(8000) }))
    .min(1)
    .max(20),
  hints: z.array(text(600)).length(3),
});
export type RemixOutput = z.infer<typeof RemixSchema>;

export const RemixReviewSchema = z.object({
  summary: text(1500),
  verdicts: z
    .array(z.object({ check_id: text(10), passed: z.boolean(), explanation: text(800) }))
    .length(3),
  concepts: RebuildReviewSchema.shape.concepts,
});
export type RemixReview = z.infer<typeof RemixReviewSchema>;

export const ProfileUpdateSchema = z.object({
  changes: z
    .array(
      z.object({
        concept: text(60),
        layer: z.enum(LAYERS),
        delta: z.number().min(-0.3).max(0.3),
        note: text(300),
      }),
    )
    .max(20),
});
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;

export const DepthSchema = z.enum(DEPTHS);
