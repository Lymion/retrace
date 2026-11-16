import type { Metadata } from "next";
import { headers } from "next/headers";
import { CommandPalette } from "@/components/CommandPalette";
import { StatusBar } from "@/components/StatusBar";
import { TopBar } from "@/components/TopBar";
import { UpdateBanner } from "@/components/UpdateBanner";
import { getSettings } from "@/server/settings";
import "./globals.css";

export const metadata: Metadata = {
  title: "Retrace",
  description: "Learn app development by rebuilding your own projects, level by level.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers makes every page render per request, which
  // is what lets Next.js stamp the CSP nonce from src/proxy.ts on its scripts.
  await headers();
  let prose: "mono" | "sans" = "mono";
  try {
    prose = getSettings().lessonFont;
  } catch {
    prose = "mono";
  }

  return (
    <html lang="en" className="h-full antialiased" data-prose={prose}>
      <body className="flex min-h-full flex-col bg-bg text-text">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <TopBar />
        <UpdateBanner />
        <main id="main" className="flex min-h-0 flex-1 flex-col">
          {children}
        </main>
        <StatusBar />
        <CommandPalette />
      </body>
    </html>
  );
}
