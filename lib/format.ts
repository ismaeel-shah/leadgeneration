/** Small display helpers shared by client components. */

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?";
}

/** "Just now", "3h ago", "2 days ago" — pair with `exactDateTime` in a tooltip. */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export function exactDateTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function shortDate(iso: string | undefined, timezone: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "numeric", month: "short" }).format(new Date(iso));
}

function dayKey(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Whole local calendar days from `iso` until today (positive = in the past). */
export function daysAgo(iso: string, timezone: string, now = new Date()): number {
  const today = dayKey(now.toISOString(), timezone);
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dayKey(iso, timezone)}T00:00:00Z`)) / 86_400_000);
}

/** "2 days overdue", "Due today", "Due 9 Oct". */
export function dueLabel(iso: string | undefined, timezone: string, now = new Date()): { text: string; overdue: boolean } {
  if (!iso) return { text: "", overdue: false };
  const days = daysAgo(iso, timezone, now);
  if (days > 0) return { text: `${days} day${days === 1 ? "" : "s"} overdue`, overdue: true };
  if (days === 0) return { text: "Due today", overdue: false };
  return { text: `Due ${shortDate(iso, timezone)}`, overdue: false };
}
