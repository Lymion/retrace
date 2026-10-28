import type { Layer } from "@/shared/enums";

// A first guess at which layer a file belongs to, from its path alone. The
// roadmap task lets Claude correct it with the file contents in view.

const CONFIG_NAMES =
  /^(package\.json|tsconfig.*\.json|jsconfig\.json|requirements.*\.txt|pyproject\.toml|setup\.(py|cfg)|Pipfile|Gemfile|go\.mod|Cargo\.toml|composer\.json|Dockerfile.*|docker-compose.*\.ya?ml|Makefile|Procfile|\.gitignore|\.dockerignore|\.editorconfig|\.npmrc|\.nvmrc|\.env(\..*)?|.*\.config\.(js|cjs|mjs|ts)|\.eslintrc.*|\.prettierrc.*|babel\.config.*|vercel\.json|netlify\.toml|config\.py|settings\.py)$/i;

export function guessLayer(filePath: string): Layer {
  const lower = filePath.toLowerCase();
  const name = lower.split("/").pop() ?? lower;

  if (
    /(^|\/)(tests?|__tests__|specs?|e2e)\//.test(lower) ||
    /\.(test|spec)\.[a-z]+$/.test(name) ||
    /^test_.*\.py$/.test(name) ||
    /_test\.(py|go)$/.test(name)
  ) {
    return "test";
  }

  if (CONFIG_NAMES.test(name) || lower.startsWith(".github/") || lower.startsWith(".circleci/")) {
    return "config";
  }

  if (
    name.endsWith(".sql") ||
    name.endsWith(".prisma") ||
    /(^|\/)(migrations?|models?|schemas?|prisma|drizzle|db|database)\//.test(lower) ||
    /^(db|database|schema|models?)\.(js|ts|py|rb|go)$/.test(name)
  ) {
    return "database";
  }

  if (
    /(^|\/)(auth|security|permissions?)\//.test(lower) ||
    /(^|[/_.-])(auth|jwt|session|password|crypto|csrf|permissions?)[/_.-]/.test(`/${name}`)
  ) {
    return "security";
  }

  if (
    /\.(html?|css|scss|sass|less|jsx|tsx|vue|svelte)$/.test(name) ||
    /(^|\/)(client|frontend|web|ui|components|pages|views|templates|static|public|styles|hooks)\//.test(
      lower,
    )
  ) {
    return "frontend";
  }

  if (/\.(js|ts|mjs|cjs|py|rb|go|rs|java|kt|cs|php|c|cpp|ino)$/.test(name)) {
    return "backend";
  }

  return "other";
}
