// In the desktop app, the local server only answers requests that carry a
// secret made fresh at each launch. The app's own window gets it as a
// cookie; other programs on the same PC do not know it, so they cannot use
// the server. In a browser (npm run dev) no secret is set and this is off.

export const DESKTOP_COOKIE = "retrace_desktop";

/** Pure check, so it works in the proxy and in route handlers alike. */
export function desktopRequestAllowed(
  cookieHeader: string | null,
  secret: string | undefined = process.env.RETRACE_DESKTOP_SECRET,
): boolean {
  if (!secret) return true;
  const sent = (cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DESKTOP_COOKIE}=`))
    ?.slice(DESKTOP_COOKIE.length + 1);
  if (!sent || sent.length !== secret.length) return false;
  // Compare every character, so the time taken does not hint at the secret.
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= sent.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}
