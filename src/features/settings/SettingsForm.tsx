"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorState } from "@/components/states";
import { apiFetch, errorMessage } from "@/lib/api-client";

export interface SettingsValues {
  learnerName: string;
  depth: "beginner" | "intermediate" | "advanced";
  replyLanguage: "auto" | "en" | "ms";
  tutorModel: string;
  fastModel: string;
  maxUploadMb: number;
  maxFiles: number;
}

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<
    { kind: "idle" | "saved" } | { kind: "error"; message: string }
  >({
    kind: "idle",
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setStatus({ kind: "idle" });
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setStatus({ kind: "saved" });
      router.refresh();
    } catch (error) {
      setStatus({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="card space-y-5 p-5" aria-labelledby="learner-heading">
      <h2 id="learner-heading" className="text-lg font-semibold">
        Learner and tutor
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="learnerName">
          <input
            id="learnerName"
            className="input"
            value={values.learnerName}
            maxLength={60}
            required
            onChange={(e) => set("learnerName", e.target.value)}
          />
        </Field>
        <Field
          label="Explanation depth"
          htmlFor="depth"
          hint="Used for annotations, lessons and quizzes."
        >
          <select
            id="depth"
            className="input"
            value={values.depth}
            onChange={(e) => set("depth", e.target.value as SettingsValues["depth"])}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </Field>
        <Field label="Tutor reply language" htmlFor="replyLanguage">
          <select
            id="replyLanguage"
            className="input"
            value={values.replyLanguage}
            onChange={(e) =>
              set("replyLanguage", e.target.value as SettingsValues["replyLanguage"])
            }
          >
            <option value="auto">Same as I write (English, Malay or a mix)</option>
            <option value="en">Always English</option>
            <option value="ms">Always Bahasa Melayu</option>
          </select>
        </Field>
      </div>

      <h3 className="pt-2 font-semibold">Models</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tutor model" htmlFor="tutorModel" hint="Roadmap, lessons, reviews, audits.">
          <input
            id="tutorModel"
            className="input font-mono"
            value={values.tutorModel}
            onChange={(e) => set("tutorModel", e.target.value)}
          />
        </Field>
        <Field label="Fast model" htmlFor="fastModel" hint="Annotations, tagging, quiz grading.">
          <input
            id="fastModel"
            className="input font-mono"
            value={values.fastModel}
            onChange={(e) => set("fastModel", e.target.value)}
          />
        </Field>
      </div>

      <h3 className="pt-2 font-semibold">Upload limits</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Largest upload (MB)" htmlFor="maxUploadMb">
          <input
            id="maxUploadMb"
            type="number"
            min={1}
            max={500}
            className="input"
            value={values.maxUploadMb}
            onChange={(e) => set("maxUploadMb", Number(e.target.value))}
          />
        </Field>
        <Field label="Most files per project" htmlFor="maxFiles">
          <input
            id="maxFiles"
            type="number"
            min={1}
            max={50000}
            className="input"
            value={values.maxFiles}
            onChange={(e) => set("maxFiles", Number(e.target.value))}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3" aria-live="polite">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {status.kind === "saved" && <span className="text-sm text-ok">Saved.</span>}
      </div>
      {status.kind === "error" && <ErrorState message={status.message} />}
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
