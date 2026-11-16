import { NextResponse, type NextRequest } from "next/server";
import { desktopRequestAllowed } from "@/lib/desktop-secret";

// Sets a strict Content Security Policy with a fresh nonce on every page
// request. Next.js reads the nonce from the request header and stamps it on
// its own scripts, so any injected <script> without it will not run.
export function proxy(request: NextRequest) {
  // Desktop app: only its own window may use the local server.
  if (!desktopRequestAllowed(request.headers.get("cookie"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  // API routes need only that check; the CSP below is for pages.
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    // React needs eval in dev only, for readable server error stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Monaco injects <style> tags at runtime, so inline styles are allowed.
    // Styles cannot run code, so this is a much smaller risk than inline scripts.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Pages and API routes, prefetches included (the desktop check must not
    // be skippable), except static files and the zip upload. Skipping the
    // upload keeps large zips out of the proxy's request buffer; that route
    // checks the desktop secret itself.
    "/((?!api/projects/upload|_next/static|_next/image|monaco|favicon.ico).*)",
  ],
};
