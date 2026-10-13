// Helpers for calendar dates. Every Date here is midnight UTC, matching Postgres `date` columns.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Parses a strict YYYY-MM-DD string. Returns null for other formats and for
// dates that do not exist, such as 2025-02-30.
export function parseDate(value: string): Date | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));

  // Date.UTC rolls invalid dates over (Feb 30 becomes Mar 2), so check it round-trips.
  const isReal =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isReal ? date : null;
}

export function isFirstOfMonth(date: Date): boolean {
  return date.getUTCDate() === 1;
}

// Formats as YYYY-MM-DD
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Whole calendar months from `from` to `to`: Jan to Jan is 0, Jan to Feb is 1.
export function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  );
}
