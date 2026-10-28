import { describe, expect, it } from "vitest";
import { entropy, isEnvFile, redactSecrets } from "./redact";

// Fake keys are assembled from pieces so this test file itself never
// contains a string that secret scanners would flag.
const fake = (...parts: string[]) => parts.join("");
const KEYS = {
  anthropic: fake("sk-ant-", "api03-", "A".repeat(10), "b1c2d3e4f5g6h7i8j9"),
  openai: fake("sk-", "proj-", "Z9y8X7w6V5u4T3s2R1q0", "abcdEFGH"),
  aws: fake("AKIA", "IOSFODNN7EXAMPLE"),
  github: fake("ghp_", "1234567890abcdefghijABCDEFGHIJ123456"),
  stripe: fake("sk_", "live_", "4eC39HqLyjWDarjtT1zdp7dc"),
  google: fake("AIza", "SyA-1234567890abcdefghijklmnopqrstu"),
  slack: fake("xoxb-", "123456789012-abcdefghijkl"),
  jwt: fake("eyJhbGciOiJIUzI1NiJ9", ".", "eyJ1c2VySWQiOjEyMzQ1Nn0", ".", "abcdefghijklmnopqrstuv"),
};

describe("redactSecrets", () => {
  it.each([
    ["Anthropic API key", `const key = "${KEYS.anthropic}";`],
    ["OpenAI API key", `OPENAI = '${KEYS.openai}'`],
    ["AWS access key", `aws_access_key_id = ${KEYS.aws}`],
    ["GitHub token", `token: ${KEYS.github}`],
    ["Stripe key", `stripe(${JSON.stringify(KEYS.stripe)})`],
    ["Google API key", `apiKey: "${KEYS.google}"`],
    ["Slack token", `const slack = "${KEYS.slack}"`],
    ["JWT", `const sample = "${KEYS.jwt}";`],
  ])("removes a %s", (kind, line) => {
    const result = redactSecrets("src/config.js", line);
    expect(result.redactions[0]?.kind).toBe(kind);
    for (const value of Object.values(KEYS)) expect(result.content).not.toContain(value);
    expect(result.content).toContain(`«REDACTED:${kind}»`);
  });

  it("removes a private key block and reports its first line", () => {
    const pem = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const result = redactSecrets("keys.txt", `first line\n${pem}\nlast`);
    expect(result.content).not.toContain("MIIBOg");
    expect(result.redactions).toEqual([{ line: 2, kind: "private key" }]);
  });

  it("removes only the password from a connection string", () => {
    const result = redactSecrets(
      "db.js",
      'const url = "postgres://app:hunter2hunter2@localhost:5432/todo";',
    );
    expect(result.content).toContain(
      "postgres://app:«REDACTED:connection string password»@localhost",
    );
    expect(result.content).not.toContain("hunter2hunter2");
  });

  it("removes a hard-coded fallback secret", () => {
    const line = 'const JWT_SECRET = process.env.JWT_SECRET || "super-secret-dev-key-123";';
    const result = redactSecrets("server/middleware/auth.js", line);
    expect(result.content).not.toContain("super-secret-dev-key-123");
    expect(result.content).toContain("process.env.JWT_SECRET");
    expect(result.redactions).toEqual([{ line: 1, kind: "hard-coded secret" }]);
  });

  it("removes every value in a .env file but keeps the names", () => {
    const result = redactSecrets(".env", "# comment\nPORT=4000\nJWT_SECRET=abc123def456\nEMPTY=\n");
    expect(result.content).toBe(
      "# comment\nPORT=«REDACTED:env value»\nJWT_SECRET=«REDACTED:env value»\nEMPTY=\n",
    );
    expect(result.redactions.map((r) => r.line)).toEqual([2, 3]);
  });

  it("keeps placeholders in .env.example but removes a real-looking secret there", () => {
    const result = redactSecrets(
      ".env.example",
      "JWT_SECRET=change-me\nAPI_TOKEN=q8Zr2Lm9Xc4Vb7Np\nPORT=4000\n",
    );
    expect(result.content).toContain("JWT_SECRET=change-me");
    expect(result.content).toContain("API_TOKEN=«REDACTED:env value»");
    expect(result.content).toContain("PORT=4000");
  });

  it("leaves ordinary code alone", () => {
    const code = [
      'const token = header.split(" ")[1];',
      "const payload = jwt.verify(token, JWT_SECRET);",
      'const token2 = localStorage.getItem("token");',
      '<input type="password" placeholder="Password" />',
      'SECRET_KEY = os.environ.get("SECRET_KEY", "dev")',
      'db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")',
      "const passwordLength = 12;",
    ].join("\n");
    const result = redactSecrets("app.js", code);
    expect(result.redactions).toEqual([]);
    expect(result.content).toBe(code);
  });

  it("never redacts the same value twice", () => {
    const result = redactSecrets("a.js", `const apiKey = "${KEYS.anthropic}";`);
    expect(result.redactions).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("scores random strings higher than words", () => {
    expect(entropy("q8Zr2Lm9Xc4Vb7Np")).toBeGreaterThan(entropy("aaaaaaaaaaaa"));
  });

  it("knows which files are real .env files", () => {
    expect(isEnvFile(".env")).toBe(true);
    expect(isEnvFile("server/.env.local")).toBe(true);
    expect(isEnvFile(".env.example")).toBe(false);
    expect(isEnvFile("env.js")).toBe(false);
  });
});
