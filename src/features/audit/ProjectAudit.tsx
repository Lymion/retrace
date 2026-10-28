"use client";

import { useRouter } from "next/navigation";
import { AuditPanel } from "./AuditPanel";

/** The whole-project audit on the project page; findings open in the workspace. */
export function ProjectAudit({ projectId }: { projectId: number }) {
  const router = useRouter();
  return (
    <div className="card p-5">
      <AuditPanel
        projectId={projectId}
        levelId={null}
        scopeLabel="whole project"
        onShowInCode={(path, line) =>
          router.push(
            `/projects/${projectId}/workspace?mode=tour&path=${encodeURIComponent(path)}${line ? `&line=${line}` : ""}`,
          )
        }
      />
    </div>
  );
}
