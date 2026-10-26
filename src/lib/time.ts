/**
 * Learning-day helpers. The learning day boundary is midnight in Asia/Riyadh (UTC+3, no DST),
 * computed with Intl so it stays correct regardless of the server's timezone.
 */
export const LEARNING_TZ = "Asia/Riyadh";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: LEARNING_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 'YYYY-MM-DD' learning day for an instant. */
export function learningDay(at: Date = new Date()): string {
  return dayFormatter.format(at);
}

function toUtcMidnight(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `from` to `to` (both 'YYYY-MM-DD'). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / 86_400_000);
}

export function addDays(day: string, n: number): string {
  return new Date(toUtcMidnight(day) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(day: string): number {
  return new Date(toUtcMidnight(day)).getUTCDay();
}

/** Saudi learning week runs Sunday → Saturday. */
export function weekStartOf(day: string): string {
  return addDays(day, -weekdayOf(day));
}

export function weekRange(day: string): { start: string; end: string } {
  const start = weekStartOf(day);
  return { start, end: addDays(start, 6) };
}

/** The instant at which a learning day starts (00:00 Riyadh). */
export function startOfLearningDay(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
}

export function lastNDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}
