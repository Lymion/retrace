import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AccountInfo, Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { log } from "../../logger";
import {
  AIError,
  type AIProvider,
  type AIRequest,
  type ProviderStatus,
  systemParts,
} from "../provider";

// The "claude-login" provider: the official Claude Agent SDK, which runs
// Claude Code signed in with the learner's own Claude login. Claude Code is
// an agent with file and shell tools, and the text we send contains
// untrusted uploaded code, so every call is locked down:
//   - no tools of any kind, one turn, permission requests always denied
//   - an empty temp folder as the working directory
//   - no settings, CLAUDE.md, skills, plugins or MCP servers loaded
//   - an environment built from an allowlist, so no API key (and no other
//     credential) can reach the child process and be billed instead of the plan
// We never read, copy or store the login token; Claude Code handles it.

/** The parts of the SDK's query() result we use. */
export interface QueryHandle extends AsyncIterable<SDKMessage> {
  accountInfo?(): Promise<AccountInfo>;
  close?(): void;
}
export type QueryFn = (params: {
  prompt: string | AsyncIterable<never>;
  options: Options;
}) => QueryHandle;

/** Every built-in Claude Code tool name, denied by name as a second lock behind `tools: []`. */
export const BLOCKED_TOOLS = [
  "Agent",
  "Task",
  "Bash",
  "BashOutput",
  "KillShell",
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Glob",
  "Grep",
  "LS",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
  "Skill",
  "SlashCommand",
  "ExitPlanMode",
];

/** Only what a Node process needs to start and find the login on disk. */
const ENV_ALLOWLIST = new Set(
  [
    "PATH",
    "Path",
    "PATHEXT",
    "HOME",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "USERNAME",
    "USER",
    "LOGNAME",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMDATA",
    "ProgramData",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "SystemRoot",
    "SYSTEMROOT",
    "SystemDrive",
    "SYSTEMDRIVE",
    "windir",
    "WINDIR",
    "ComSpec",
    "COMSPEC",
    "OS",
    "PROCESSOR_ARCHITECTURE",
    "NUMBER_OF_PROCESSORS",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "TERM",
    "SHELL",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    // Where Claude Code keeps the login, if the learner moved it.
    "CLAUDE_CONFIG_DIR",
    // Corporate proxies and custom certificates, so the login works on any network.
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
    "https_proxy",
    "http_proxy",
    "no_proxy",
    "NODE_EXTRA_CA_CERTS",
  ].map((name) => name),
);

export function childEnv(
  source: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && ENV_ALLOWLIST.has(key)) env[key] = value;
  }
  env.CLAUDE_AGENT_SDK_CLIENT_APP = "retrace/0.1";
  return env;
}

export function lockedOptions(
  model: string,
  systemPrompt: string,
  cwd: string,
  stream: boolean,
): Options {
  return {
    model,
    systemPrompt,
    tools: [],
    allowedTools: [],
    disallowedTools: BLOCKED_TOOLS,
    mcpServers: {},
    strictMcpConfig: true,
    settingSources: [],
    skills: [],
    plugins: [],
    maxTurns: 1,
    cwd,
    permissionMode: "dontAsk",
    canUseTool: async () => ({ behavior: "deny", message: "Tools are disabled in Retrace." }),
    persistSession: false,
    includePartialMessages: stream,
    thinking: { type: "disabled" },
    env: childEnv(),
  };
}

/** A conversation as one prompt, since each call is a fresh single-turn session. */
export function toPrompt(request: AIRequest): string {
  const messages = request.messages;
  const last = messages[messages.length - 1];
  if (!last) return "";
  if (messages.length === 1) return last.content;
  const earlier = messages
    .slice(0, -1)
    .map(
      (m) =>
        `<${m.role === "user" ? "learner" : "tutor"}>\n${m.content}\n</${m.role === "user" ? "learner" : "tutor"}>`,
    )
    .join("\n\n");
  return `Conversation so far, oldest first:\n\n${earlier}\n\nThe learner's new message (reply to this):\n${last.content}`;
}

/** How to sign in again. Claude Code keeps the login; Retrace never touches it. */
export const LOGIN_FIX =
  "Open a terminal, run `npx @anthropic-ai/claude-code`, type /login and sign in, then press Check again in Settings.";

const AUTH_PROBLEM = /log ?in|logged|authenticat|oauth|credential|401|unauthori[sz]ed|expired/i;

function errorFromText(text: string): AIError {
  const short = text
    .replace(/^Error: /, "")
    .replace(/^Claude Code returned an error result: /, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  if (AUTH_PROBLEM.test(text)) {
    return new AIError(
      "not_ready",
      `Your Claude login could not be used (${short}). ${LOGIN_FIX} Or switch to the API key provider.`,
      "claude-login",
    );
  }
  if (/usage limit|rate.?limit|429|quota/i.test(text)) {
    return new AIError(
      "rate_limited",
      "Your Claude plan's usage limit was reached. Wait for it to reset, or switch to the API key provider.",
      "claude-login",
    );
  }
  return new AIError(
    "provider_failed",
    `Claude Code reported an error: ${short || "unknown error"}`,
    "claude-login",
  );
}

/**
 * Deletes a temp folder once the child process has let go of it. On Windows
 * the folder stays locked for a moment after close(), so retry in the background.
 */
function removeLater(dir: string): void {
  void rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(() => {
    // An empty folder in the OS temp directory is harmless; the OS cleans it up.
  });
}

export interface ClaudeLoginDeps {
  query?: QueryFn;
  /** How long a status check stays fresh, so Settings does not start a process on every render. */
  statusTtlMs?: number;
  /** Model for the one-word check behind "Check again". */
  pingModel?: () => string;
}

async function loadQuery(): Promise<QueryFn> {
  const sdk = await import("@anthropic-ai/claude-agent-sdk");
  return sdk.query as unknown as QueryFn;
}

export function createClaudeLoginProvider(deps: ClaudeLoginDeps = {}): AIProvider {
  const getQuery = async () => deps.query ?? (await loadQuery());
  let cachedStatus: { at: number; value: ProviderStatus } | undefined;
  const ttl = deps.statusTtlMs ?? 60_000;
  // Claude Code reports a saved account even when its session has expired,
  // so a failed call is the real signal. Remembered until a fresh check passes.
  let authProblem: string | null = null;

  async function* run(
    request: AIRequest,
    stream: boolean,
    signal?: AbortSignal,
  ): AsyncGenerator<string, string> {
    // A fresh empty folder per call: the agent has nothing to look at, even by accident.
    const cwd = mkdtempSync(path.join(os.tmpdir(), "retrace-claude-"));
    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    signal?.addEventListener("abort", onAbort);
    let handle: QueryHandle | undefined;
    try {
      const query = await getQuery();
      handle = query({
        prompt: toPrompt(request),
        options: {
          ...lockedOptions(request.model, systemParts(request).join("\n\n"), cwd, stream),
          abortController,
        },
      });
      let streamed = "";
      for await (const message of handle) {
        if (message.type === "stream_event") {
          const event = message.event;
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            streamed += event.delta.text;
            yield event.delta.text;
          }
        } else if (message.type === "assistant" && message.error) {
          throw errorFromText(String(message.error));
        } else if (message.type === "result") {
          if (message.subtype !== "success")
            throw errorFromText(`Claude Code stopped early (${message.subtype}).`);
          if (message.is_error) throw errorFromText(message.result);
          // Non-streaming calls get the whole answer here.
          return stream ? streamed : message.result;
        }
      }
      throw new AIError("provider_failed", "Claude Code ended without an answer.", "claude-login");
    } catch (error) {
      if (error instanceof AIError) {
        if (error.code === "not_ready") authProblem = error.message;
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      log.warn("claude_login.failed", { task: request.task, message: message.slice(0, 200) });
      if (/ENOENT|spawn|not found|executable/i.test(message)) {
        throw new AIError(
          "not_ready",
          "Claude Code could not start. Reinstall dependencies (npm install) or switch to the API key provider.",
          "claude-login",
        );
      }
      const mapped = errorFromText(message);
      if (mapped.code === "not_ready") authProblem = mapped.message;
      throw mapped;
    } finally {
      signal?.removeEventListener("abort", onAbort);
      handle?.close?.();
      removeLater(cwd);
    }
  }

  async function completeOnce(request: AIRequest, signal?: AbortSignal): Promise<string> {
    const generator = run(request, false, signal);
    let next = await generator.next();
    while (!next.done) next = await generator.next();
    return next.value;
  }

  return {
    id: "claude-login",
    label: "Claude login",

    async status(fresh = false): Promise<ProviderStatus> {
      const base = { id: "claude-login" as const, label: "Claude login" };
      if (!fresh && authProblem) {
        return {
          ...base,
          ready: false,
          detail: "The last request could not sign in with your Claude login.",
          fix: LOGIN_FIX,
        };
      }
      if (!fresh && cachedStatus && Date.now() - cachedStatus.at < ttl) return cachedStatus.value;
      let value: ProviderStatus;
      const cwd = mkdtempSync(path.join(os.tmpdir(), "retrace-claude-"));
      let handle: QueryHandle | undefined;
      try {
        const query = await getQuery();
        // A prompt stream that never sends anything: Claude Code starts and
        // reports its account, and no model request is made.
        const silent: AsyncIterable<never> = {
          [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
        };
        handle = query({ prompt: silent, options: lockedOptions("default", "", cwd, false) });
        if (!handle.accountInfo) throw new Error("accountInfo unavailable");
        const info = await Promise.race([
          handle.accountInfo(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timed out")), 20_000),
          ),
        ]);
        const signedIn =
          Boolean(info.tokenSource && info.tokenSource !== "none") || Boolean(info.email);
        const plan = info.subscriptionType ? ` (${info.subscriptionType} plan)` : "";
        value = signedIn
          ? {
              ...base,
              ready: true,
              detail: `Claude Code found and signed in${plan}. Uses your plan's usage limits.`,
            }
          : {
              ...base,
              ready: false,
              detail: "Claude Code is installed but not signed in.",
              fix: LOGIN_FIX,
            };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        value = {
          ...base,
          ready: false,
          detail: /ENOENT|spawn|executable/i.test(message)
            ? "Claude Code could not start on this computer."
            : "Could not confirm the Claude login.",
          fix: LOGIN_FIX,
        };
      } finally {
        handle?.close?.();
        removeLater(cwd);
      }

      // "Check again": prove the session works with a one-word reply on the fast model.
      if (fresh && value.ready && deps.pingModel) {
        try {
          await completeOnce({
            task: "status_check",
            model: deps.pingModel(),
            system: "Reply with the single word ok.",
            messages: [{ role: "user", content: "ok?" }],
            maxTokens: 5,
          });
          authProblem = null;
          value = { ...value, detail: `${value.detail} Verified just now.` };
        } catch (error) {
          value = {
            ...base,
            ready: false,
            detail: error instanceof AIError ? error.message : "The Claude login did not work.",
            fix: LOGIN_FIX,
          };
        }
      } else if (fresh && value.ready) {
        authProblem = null;
      }

      cachedStatus = { at: Date.now(), value };
      return value;
    },

    complete: completeOnce,

    async *stream(request, signal) {
      yield* run(request, true, signal);
    },
  };
}
