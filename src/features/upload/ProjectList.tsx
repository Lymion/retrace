"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorState } from "@/components/states";
import { PromptLine } from "@/components/terminal";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { HomeProject } from "@/server/repo/home";

// The projects as an `ls -l` listing. The hovered or focused row inverts, as
// in a terminal menu. Each language takes a syntax colour, by position.

const LANGUAGE_TONES = ["text-ok", "text-number", "text-cyan"];

export function ProjectList({ projects }: { projects: HomeProject[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  async function remove(project: HomeProject) {
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
      <PromptLine command="ls" flags="-l projects/" />
      <h2 id="projects-heading" className="sr-only">
        Your projects
      </h2>
      {error && (
        <div className="mt-2">
          <ErrorState message={error} />
        </div>
      )}
      <p aria-hidden className="mt-1 px-1.5 text-xs text-comment">
        total {projects.length}
      </p>
      <ul className="flex flex-col">
        {projects.map((project) => {
          const counted = project.levels.filter((l) => !l.skipped);
          const done = counted.filter((l) => l.status === "done").length;
          const share = counted.length ? Math.round((done / counted.length) * 100) : 0;
          return (
            <li key={project.id} className="group flex items-center">
              <Link
                href={`/projects/${project.id}`}
                className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_5ch] items-center gap-3.5 px-1.5 py-1 whitespace-nowrap hover:bg-accent hover:text-bg focus-visible:bg-accent focus-visible:text-bg sm:grid-cols-[5ch_minmax(0,1fr)_minmax(0,1.25fr)_96px_5ch] [&:hover_*]:text-bg [&:focus-visible_*]:text-bg"
              >
                <span aria-hidden className="hidden text-comment sm:block">
                  drwx
                </span>
                <span className="truncate font-semibold text-accent">
                  {project.name}
                  <span aria-hidden>/</span>
                </span>
                <span className="hidden truncate text-muted sm:block">
                  {project.status !== "ready" ? (
                    <span className={project.status === "failed" ? "text-danger" : "text-warn"}>
                      {project.status}
                    </span>
                  ) : (
                    <>
                      {project.languages.map((language, i) => (
                        <span key={language} className={LANGUAGE_TONES[i]}>
                          {language}{" "}
                        </span>
                      ))}
                      · {project.fileCount} files
                    </>
                  )}
                </span>
                <span aria-hidden className="term-bar hidden sm:block group-hover:bg-bg">
                  <span className="bar-fill block" style={{ width: `${share}%` }} />
                </span>
                <span className="text-right text-muted">
                  <span className="sr-only">levels done: </span>
                  {counted.length ? `${done}/${counted.length}` : "–"}
                </span>
              </Link>
              <button
                type="button"
                className="btn btn-ghost ml-1 text-comment hover:text-danger"
                onClick={() => remove(project)}
                disabled={deleting === project.id}
                aria-label={`Delete ${project.name}`}
                title="Delete this project"
              >
                rm
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
