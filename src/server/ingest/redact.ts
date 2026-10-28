// Removes secrets from file text before it is stored or sent anywhere.
// Each secret is replaced by a visible marker so the learner can see what
// was removed and why, while the value itself is gone for good.

export interface Redaction {
  line: number;
  kind: string;
}

export interface RedactResult {
  content: string;
  redactions: Redaction[];
}

export const MARKER_PREFIX = "«REDACTED:";
const marker = (kind: string) => `${MARKER_PREFIX}${kind}»`;

interface Detector {
  kind: string;
  pattern: RegExp;
  /** Which capture group holds the secret; 0 means the whole match. */
  group?: number;
}

// Order matters: specific formats run before the generic assignment check,
// so a key gets its precise name ("Anthropic API key", not "secret").
const DETECTORS: Detector[] = [
  {
    kind: "private key",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  },
  { kind: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: "OpenAI API key", pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g },
  { kind: "AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    kind: "AWS secret key",
    pattern: /(aws_?secret_?access_?key["']?\s*[:=]\s*["']?)([A-Za-z0-9/+=]{40})/gi,
    group: 2,
  },
  { kind: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g },
  { kind: "GitHub token", pattern: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g },
  { kind: "Slack token", pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { kind: "Stripe key", pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { kind: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  {
    kind: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    // postgres://user:password@host -> only the password goes.
    kind: "connection string password",
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^:/\s@"'`]+:)([^@\s/"'`]+)(@)/gi,
    group: 2,
  },
];

// Names that usually hold a secret: JWT_SECRET, apiKey, db_password, authToken...
const SECRET_NAME =
  /[A-Za-z0-9_$.-]*(?:secret|token|passwd|password|pwd|api[_-]?key|apikey|private[_-]?key|access[_-]?key|auth[_-]?key|credentials?)[A-Za-z0-9_$.-]*/i;
const ASSIGNMENT = new RegExp(`(${SECRET_NAME.source}["']?\\s*(?:=|:|:=|=>)\\s*)(.*)$`, "gim");
const QUOTED_LITERAL = /(["'`])([^"'`\s]{8,})\1/g;
const PLACEHOLDER =
  /^(x+|\*+|\.+|your[_-].*|.*[_-]here|change[_-]?me|example.*|placeholder|todo|none|null|undefined|test|password|secret|<.*>|\$\{.*\}|process\.env.*|os\.environ.*)$/i;

/** Shannon entropy in bits per character: random keys score high, words score low. */
export function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

// "SECRET_KEY" in os.environ.get("SECRET_KEY") names a variable; it is not the secret.
const ENV_VAR_NAME = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;

function looksLikeSecret(value: string): boolean {
  if (value.includes(MARKER_PREFIX)) return false;
  if (PLACEHOLDER.test(value) || ENV_VAR_NAME.test(value)) return false;
  // Low enough to catch human passwords like "hunter2hunter2", high enough to skip "aaaaaaaa".
  return entropy(value) >= 2.5;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Real .env files have every value removed. Example files are scanned like code. */
export function isEnvFile(filePath: string): boolean {
  const name = filePath.split("/").pop() ?? "";
  if (!/^\.env(\..+)?$/.test(name)) return false;
  return !/\.(example|sample|template|dist|defaults)$/i.test(name);
}

function redactEnvFile(content: string, redactions: Redaction[]): string {
  return content
    .split("\n")
    .map((line, index) => {
      const match = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.]*\s*=\s*)(.*?)\s*$/.exec(line);
      if (!match || match[2] === undefined) return line;
      const value = match[2].replace(/^["']|["']$/g, "");
      if (value === "" || value.startsWith("#")) return line;
      redactions.push({ line: index + 1, kind: "env value" });
      return `${match[1]}${marker("env value")}`;
    })
    .join("\n");
}

/** .env.example and friends keep placeholders, but a real-looking secret value still goes. */
function isEnvTemplate(filePath: string): boolean {
  const name = filePath.split("/").pop() ?? "";
  return /^\.env\..+$/.test(name) && !isEnvFile(filePath);
}

function redactEnvTemplate(content: string, redactions: Redaction[]): string {
  return content
    .split("\n")
    .map((line, index) => {
      const match =
        /^(\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*)["']?([^"'\s#]+)["']?\s*$/.exec(line);
      if (!match?.[2] || !match[3]) return line;
      if (!SECRET_NAME.test(match[2]) || !looksLikeSecret(match[3])) return line;
      redactions.push({ line: index + 1, kind: "env value" });
      return `${match[1]}${marker("env value")}`;
    })
    .join("\n");
}

export function redactSecrets(filePath: string, original: string): RedactResult {
  const redactions: Redaction[] = [];
  let content = original;
  if (isEnvFile(filePath)) content = redactEnvFile(content, redactions);
  else if (isEnvTemplate(filePath)) content = redactEnvTemplate(content, redactions);

  for (const { kind, pattern, group = 0 } of DETECTORS) {
    content = content.replace(pattern, (...args: unknown[]) => {
      const match = args[0] as string;
      const offset = args[args.length - 2] as number;
      const whole = args[args.length - 1] as string;
      redactions.push({ line: lineAt(whole, offset), kind });
      if (group === 0) return marker(kind);
      // Keep the surrounding text (e.g. "user:" and "@host"), swap only the secret.
      const groups = args.slice(1, -2) as (string | undefined)[];
      return (
        groups.map((part, i) => (i + 1 === group ? marker(kind) : (part ?? ""))).join("") || match
      );
    });
  }

  content = content.replace(
    ASSIGNMENT,
    (whole: string, left: string, right: string, offset: number, text: string) => {
      let changed = false;
      const newRight = right.replace(
        QUOTED_LITERAL,
        (literal: string, quote: string, value: string) => {
          if (!looksLikeSecret(value)) return literal;
          changed = true;
          return `${quote}${marker("hard-coded secret")}${quote}`;
        },
      );
      if (!changed) return whole;
      redactions.push({ line: lineAt(text, offset), kind: "hard-coded secret" });
      return left + newRight;
    },
  );

  redactions.sort((a, b) => a.line - b.line);
  return { content, redactions };
}
