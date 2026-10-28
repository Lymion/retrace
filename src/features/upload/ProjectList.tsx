"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorState } from "@/components/states";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";

export interface ProjectSummaryItem {
  id: number;
  name: string;
  source: "zip" | "github";
  sourceRef: string;
  status: "ingesting" | "ready" | "failed";
  fileCount: number | null;
  createdAt: string;
}

export function ProjectList({ projects }: { projects: ProjectSummaryItem[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  async function remove(project: ProjectSummaryItem) {
    if (!window.confirm(`Delete "${project.name}" and everything learned from it?`)) return;
    setDeleting(project.id);
    setError(null);
    try {
      await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section aria-labelledby="projects-heading">
      <h2 id="projects-heading" className="text-lg font-semibold">
        Your projects
      </h2>
      {error && (
        <div className="mt-3">
          <ErrorState message={error} />
        </div>
      )}
      {projects.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No projects yet">
            Upload a zip or paste a GitHub link to start. Try one of the samples in the{" "}
            <code>samples/</code> folder first.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-sm border border-border bg-surface">
          {projects.map((project) => (
            <li
              key={project.id}
              className="group flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2"
            >
              <span aria-hidden className="w-[4ch] shrink-0 text-right text-xs text-comment">
                {project.id}
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/projects/${project.id}`}
                  className="font-semibold text-accent group-hover:glow hover:underline"
                >
                  {project.name}
                  <span aria-hidden className="text-comment">
                    /
                  </span>
                </Link>
                <p className="truncate text-xs text-muted">
                  {project.source === "github" ? "GitHub" : "Zip"} · {project.sourceRef} ·{" "}
                  {project.fileCount ?? 0} files · {formatDate(project.createdAt)}
                </p>
              </div>
              {project.status !== "ready" && (
                <span className={`chip ${project.status === "failed" ? "text-danger" : ""}`}>
                  {project.status}
                </span>
              )}
              <button
                type="button"
                className="btn btn-ghost text-muted hover:text-danger"
                onClick={() => remove(project)}
                disabled={deleting === project.id}
                aria-label={`Delete ${project.name}`}
                title="Delete this project"
              >
                rm
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
