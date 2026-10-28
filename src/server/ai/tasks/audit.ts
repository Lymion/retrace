import { and, asc, eq, isNull } from "drizzle-orm";
import { type Db, getDb } from "@/db/client";
import { files, findings, levels } from "@/db/schema";
import { SecurityAuditSchema } from "@/shared/contracts";
import { SEVERITIES } from "@/shared/enums";
import { notFound } from "../../http";
import { getSettings } from "../../settings";
import { codeBundle } from "../code-bundle";
import { buildTutorRequest } from "../context";
import { runJsonTask } from "../json";
import type { AIProvider } from "../provider";
import { renderPrompt } from "../prompts";
import { getActiveProvider } from "../registry";

// security_audit: per level or for the whole project. Findings replace the
// previous audit of the same scope, and only point at files that exist.

/** SEVERITIES runs low -> critical, so a higher index is worse. */
const severityRank = (s: (typeof SEVERITIES)[number]) => SEVERITIES.indexOf(s);

export function listFindings(db: Db, projectId: number, levelId: number | null) {
  return db
    .select({
      id: findings.id,
      levelId: findings.levelId,
      fileId: findings.fileId,
      path: files.path,
      line: findings.line,
      severity: findings.severity,
      title: findings.title,
      attackerView: findings.attackerView,
      fix: findings.fix,
      createdAt: findings.createdAt,
    })
    .from(findings)
    .leftJoin(files, eq(files.id, findings.fileId))
    .where(
      and(
        eq(findings.projectId, projectId),
        levelId === null ? isNull(findings.levelId) : eq(findings.levelId, levelId),
      ),
    )
    .orderBy(asc(findings.id))
    .all()
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}
export type FindingRow = ReturnType<typeof listFindings>[number];

export async function runAudit(
  projectId: number,
  levelId: number | null,
  db: Db = getDb(),
  provider: AIProvider = getActiveProvider(db),
): Promise<FindingRow[]> {
  const settings = getSettings(db);
  let scope = "the whole project";
  if (levelId !== null) {
    const level = db
      .select()
      .from(levels)
      .where(and(eq(levels.id, levelId), eq(levels.projectId, projectId)))
      .get();
    if (!level) throw notFound("Level");
    scope = `level ${level.number} (${level.name})`;
  }

  const bundle = codeBundle(db, { projectId, levelId, maxLines: levelId ? 1500 : 3000 });
  const request = buildTutorRequest({
    db,
    projectId,
    task: "security_audit",
    model: settings.tutorModel,
    instructions: renderPrompt("security_audit", {
      learner_name: settings.learnerName,
      scope,
      code: bundle.text,
    }),
    levelId,
    messages: [{ role: "user", content: `Audit ${scope} as JSON.` }],
    maxTokens: 4000,
  });
  const output = await runJsonTask({ provider, request, schema: SecurityAuditSchema });

  const idByPath = new Map(
    db
      .select({ id: files.id, path: files.path })
      .from(files)
      .where(eq(files.projectId, projectId))
      .all()
      .map((f) => [f.path, f.id]),
  );

  db.transaction(() => {
    db.delete(findings)
      .where(
        and(
          eq(findings.projectId, projectId),
          levelId === null ? isNull(findings.levelId) : eq(findings.levelId, levelId),
        ),
      )
      .run();
    for (const finding of output.findings) {
      const fileId = idByPath.get(finding.file);
      if (!fileId || !bundle.paths.has(finding.file)) continue; // never invent files
      const lineCount = bundle.lineCounts.get(finding.file) ?? 0;
      db.insert(findings)
        .values({
          projectId,
          levelId,
          fileId,
          line: finding.line && finding.line <= lineCount ? finding.line : null,
          severity: finding.severity,
          title: finding.title,
          attackerView: finding.attacker_view,
          fix: finding.fix,
        })
        .run();
    }
  });
  return listFindings(db, projectId, levelId);
}
