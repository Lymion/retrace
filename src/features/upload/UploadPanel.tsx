"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ErrorState, Spinner } from "@/components/states";
import { apiFetch, errorMessage, postJson } from "@/lib/api-client";

type Status =
  { kind: "idle" } | { kind: "busy"; label: string } | { kind: "error"; message: string };

export function UploadPanel() {
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
    <section aria-labelledby="add-project" className="card p-5">
      <h2 id="add-project" className="text-lg font-semibold">
        Add a project
      </h2>

      <div
        role="button"
        tabIndex={0}
        aria-disabled={busy}
        aria-describedby="dropzone-help"
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !busy) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
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
        className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-accent bg-accent/10" : "border-border hover:border-accent/60"
        }`}
      >
        <p className="font-medium">Drop a project .zip here, or click to choose one</p>
        <p id="dropzone-help" className="mt-1 text-sm text-muted">
          node_modules, build folders, binaries and media are skipped automatically.
        </p>
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
      </div>

      <form onSubmit={importGithub} className="mt-4 flex gap-2">
        <label htmlFor="github-url" className="sr-only">
          GitHub repository link
        </label>
        <input
          id="github-url"
          className="input"
          placeholder="https://github.com/owner/repo"
          value={githubUrl}
          onChange={(event) => setGithubUrl(event.target.value)}
          disabled={busy}
          inputMode="url"
          autoComplete="off"
        />
        <button
          type="submit"
          className="btn btn-primary shrink-0"
          disabled={busy || !githubUrl.trim()}
        >
          Import
        </button>
      </form>

      <div className="mt-3 min-h-6" aria-live="polite">
        {status.kind === "busy" && <Spinner label={status.label} />}
        {status.kind === "error" && <ErrorState message={status.message} />}
      </div>

      <p className="mt-2 text-xs text-muted">
        Your files stay on this computer. When the tutor works, excerpts of your code are sent to
        the Anthropic API (through your API key or your Claude login). Secrets such as API keys,
        tokens and .env values are removed before anything is stored or sent.
      </p>
    </section>
  );
}
