import type { NextConfig } from "next";

// Headers that apply to every response, API routes included. The page CSP
// (with a per-request nonce) is set in src/proxy.ts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Native or Node-only packages stay out of the bundle and load with require().
  serverExternalPackages: [
    "better-sqlite3",
    "typescript",
    "isomorphic-git",
    "yauzl",
    "@anthropic-ai/claude-agent-sdk",
  ],
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
