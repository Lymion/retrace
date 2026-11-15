"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ErrorState, Spinner } from "@/components/states";
import { apiFetch, errorMessage, postJson } from "@/lib/api-client";

type Status =
  { kind: "idle" } | { kind: "busy"; label: string } | { kind: "error"; message: string };

/** Adding a project: a zip (click or drop anywhere on the pane) or a GitHub link. */
export function UploadPanel({ focal = false }: { focal?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const busy = status.kind === "busy";

  async function run(label: string, task: () => Promise<{ projectId: number }>) {
    setStatus({ kind: "busy", label });
    try {
      const { projectId } = await task();
      router.push(`/projects/${projectId}`);
      router.refresh();
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    }
  }

  function uploadZip(file: File) {
    if (!/\.zip$/i.test(file.name)) {
      setStatus({ kind: "error", message: "Only .zip files can be uploaded." });
      return;
    }
    void run(`Reading ${file.name}…`, () =>
      apiFetch("/api/projects/upload", {
        method: "POST",
        headers: { "Content-Type": "application/zip", "X-Filename": encodeURIComponent(file.name) },
        body: file,
      }),
    );
  }

  function importGithub(event: React.FormEvent) {
    event.preventDefault();
    if (!githubUrl.trim()) return;
    void run("Downloading from GitHub…", () =>
      postJson("/api/projects/github", { url: githubUrl.trim() }),
    );
  }

  return (
    <section
      aria-labelledby="add-project"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file && !busy) uploadZip(file);
      }}
      className={`pane c-cyan ${focal || dragging ? "pane-on" : ""}`}
    >
      <h2 id="add-project" className="pane-title">
        add a project
      </h2>
      {focal && (
        <p className="mb-3 text-[17px] font-semibold text-bright">
          Start with a project you already finished.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          className={`btn ${focal ? "btn-primary" : ""}`}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-describedby="dropzone-help"
        >
          {dragging ? "drop the zip" : "choose a zip"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadZip(file);
            event.target.value = "";
          }}
        />
        <span className="text-comment">or</span>
        <form onSubmit={importGithub} className="flex min-w-0 flex-[1_1_260px] items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 border-b border-rule px-0.5 py-1 focus-within:border-cyan">
            <span aria-hidden className="shrink-0 text-keyword">
              url ❯
            </span>
            <span className="sr-only">GitHub repository link</span>
            <input
              id="github-url"
              className="min-w-0 flex-1 bg-transparent text-text placeholder:text-comment focus:outline-none"
              style={{ caretColor: "var(--cyan)" }}
              placeholder="https://github.com/owner/repo"
              value={githubUrl}
              onChange={(event) => setGithubUrl(event.target.value)}
              disabled={busy}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button type="submit" className="btn shrink-0" disabled={busy || !githubUrl.trim()}>
            fetch
          </button>
        </form>
      </div>

      <div className="mt-2 min-h-6" aria-live="polite">
        {status.kind === "busy" && <Spinner label={status.label} />}
        {status.kind === "error" && <ErrorState message={status.message} />}
      </div>

      <p id="dropzone-help" className="text-xs text-comment">
        <span aria-hidden>{"// "}</span>
        You can also drop a .zip on this box. node_modules, build folders, binaries and media are
        skipped.
      </p>
      <p className="mt-1 text-xs text-comment">
        <span aria-hidden>{"// "}</span>
        Your files stay on this computer. Secrets such as API keys, tokens and .env values are
        removed before anything is stored or sent. When the tutor works, excerpts of your code go to
        the Anthropic API (through your API key or your Claude login).
      </p>
    </section>
  );
}
