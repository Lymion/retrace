import { describe, expect, it } from "vitest";
import {
  AlternativesSchema,
  AnnotateSchema,
  GapsSchema,
  ProfileUpdateSchema,
  QuizGenerateSchema,
  QuizGradeSchema,
  RebuildReviewSchema,
  RebuildSpecSchema,
  RemixReviewSchema,
  RemixSchema,
  RoadmapSchema,
  SecurityAuditSchema,
} from "./contracts";

const check = (id: string) => ({ id, description: "does a thing", how_to_verify: "try it" });
const option = (name: string) => ({ name, pros: ["fast"], cons: ["new"], pick_when: "small apps" });
const question = (type: string) => ({
  type,
  prompt: "What does line 3 do?",
  correct_answer: "It reads the secret.",
  explanation: "Because...",
  concept: "env vars",
});

// One valid example per schema, plus the ways each must fail.
const VALID = {
  roadmap: {
    summary: "An app.",
    levels: [
      {
        level: 0,
        name: "Idea",
        goal: "g",
        files: ["README.md"],
        checkpoint: "c",
        why_this_order: "w",
        evidence: "git",
        skipped: false,
      },
    ],
  },
  annotate: { annotations: [{ line: 3, note: "Reads the port.", category: "concept" }] },
  rebuildSpec: {
    title: "Backend core",
    summary: "Build the server.",
    files_to_write: [{ path: "server/app.js", purpose: "the app" }],
    inputs: ["HTTP requests"],
    outputs: ["JSON"],
    acceptance_checks: [check("A1"), check("A2"), check("A3")],
    concepts: ["routing"],
  },
  rebuildReview: {
    summary: "Good.",
    verdicts: ["A1", "A2", "A3"].map((id) => ({
      check_id: id,
      passed: true,
      explanation: "ok",
      original: { file: "a.js", line: 2 },
    })),
    bugs: [],
    security_gaps: [],
    approach_differences: [{ learner: "used fetch", original: "used axios", note: "fine" }],
    concepts: [{ name: "routing", layer: "backend", result: "solid", note: "nice" }],
  },
  audit: {
    findings: [
      {
        file: "a.js",
        line: 4,
        severity: "high",
        title: "SQL injection",
        attacker_view: "dump the db",
        fix: "use ?",
      },
    ],
  },
  alternatives: {
    decisions: [
      {
        decision: "Database",
        chosen: option("SQLite"),
        alternatives: [option("Postgres"), option("MongoDB")],
      },
    ],
  },
  gaps: {
    lessons: [{ title: "Hash passwords", why_it_matters: "leaks" }],
    missing: [{ practice: "Tests", why_it_matters: "safety", evidence: "no test files" }],
    checklist: [{ title: "Add tests", why_it_matters: "safety", source: "gap" }],
  },
  quiz: {
    questions: [
      question("what_does_this_do"),
      question("what_does_this_do"),
      question("find_the_bug"),
      question("security"),
      question("how_would_you_change"),
    ],
  },
  grade: { correct: true, feedback: "Yes!", concept: "env vars" },
  remix: {
    title: "Recipe box",
    domain: "cooking",
    spec: {
      summary: "Save recipes.",
      inputs: [],
      outputs: [],
      acceptance_checks: [check("A1"), check("A2"), check("A3")],
    },
    patterns_reused: ["JWT auth"],
    files_needed: [{ path: "server/recipes.js", purpose: "routes" }],
    skeleton: [{ path: "server/recipes.js", content: "// TODO" }],
    hints: ["one", "two", "three"],
  },
  remixReview: {
    summary: "ok",
    verdicts: ["A1", "A2", "A3"].map((id) => ({ check_id: id, passed: false, explanation: "no" })),
    concepts: [],
  },
  profile: {
    changes: [{ concept: "jwt", layer: "security", delta: 0.1, note: "explained it back" }],
  },
};

describe("task output schemas", () => {
  it.each([
    ["roadmap", RoadmapSchema, VALID.roadmap],
    ["annotate", AnnotateSchema, VALID.annotate],
    ["rebuild_spec", RebuildSpecSchema, VALID.rebuildSpec],
    ["rebuild_review", RebuildReviewSchema, VALID.rebuildReview],
    ["security_audit", SecurityAuditSchema, VALID.audit],
    ["alternatives", AlternativesSchema, VALID.alternatives],
    ["gaps", GapsSchema, VALID.gaps],
    ["quiz_generate", QuizGenerateSchema, VALID.quiz],
    ["quiz_grade", QuizGradeSchema, VALID.grade],
    ["remix", RemixSchema, VALID.remix],
    ["remix_review", RemixReviewSchema, VALID.remixReview],
    ["profile_update", ProfileUpdateSchema, VALID.profile],
  ])("%s accepts a valid reply", (_name, schema, value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });

  it("rejects unknown evidence and empty level lists", () => {
    expect(RoadmapSchema.safeParse({ ...VALID.roadmap, levels: [] }).success).toBe(false);
    const bad = structuredClone(VALID.roadmap);
    (bad.levels[0] as { evidence: string }).evidence = "vibes";
    expect(RoadmapSchema.safeParse(bad).success).toBe(false);
  });

  it("caps annotations at 15 and needs real line numbers", () => {
    const many = { annotations: Array.from({ length: 16 }, () => VALID.annotate.annotations[0]) };
    expect(AnnotateSchema.safeParse(many).success).toBe(false);
    expect(
      AnnotateSchema.safeParse({ annotations: [{ ...VALID.annotate.annotations[0], line: 0 }] })
        .success,
    ).toBe(false);
  });

  it("needs exactly 3 acceptance checks in a rebuild spec", () => {
    const two = { ...VALID.rebuildSpec, acceptance_checks: [check("A1"), check("A2")] };
    expect(RebuildSpecSchema.safeParse(two).success).toBe(false);
  });

  it("needs the brief's quiz mix", () => {
    const allSame = { questions: Array.from({ length: 5 }, () => question("security")) };
    const result = QuizGenerateSchema.safeParse(allSame);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/2 what_does_this_do/);
  });

  it("needs two alternatives per decision and three hints per remix", () => {
    const oneAlt = {
      decisions: [{ ...VALID.alternatives.decisions[0], alternatives: [option("x")] }],
    };
    expect(AlternativesSchema.safeParse(oneAlt).success).toBe(false);
    expect(RemixSchema.safeParse({ ...VALID.remix, hints: ["a", "b"] }).success).toBe(false);
  });

  it("limits how far one session can move mastery", () => {
    expect(
      ProfileUpdateSchema.safeParse({ changes: [{ ...VALID.profile.changes[0], delta: 0.9 }] })
        .success,
    ).toBe(false);
  });

  it("rejects unknown severities and question types", () => {
    const audit = { findings: [{ ...VALID.audit.findings[0], severity: "catastrophic" }] };
    expect(SecurityAuditSchema.safeParse(audit).success).toBe(false);
  });
});
