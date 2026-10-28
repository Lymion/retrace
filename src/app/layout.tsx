import type { Metadata } from "next";
import { headers } from "next/headers";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Retrace",
  description: "Learn app development by rebuilding your own projects, level by level.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers makes every page render per request, which
  // is what lets Next.js stamp the CSP nonce from src/proxy.ts on its scripts.
  await headers();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-bg text-text">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <TopBar />
        <main id="main" className="flex min-h-0 flex-1 flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}
