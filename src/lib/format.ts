// Fixed-locale formatting. The server and the browser must print the same
// text or React reports a hydration mismatch, so we never use the
// browser's default locale here.

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(value: string | Date): string {
  return dateFormat.format(typeof value === "string" ? new Date(value) : value);
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
