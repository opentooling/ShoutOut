const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Fixed names so output doesn't vary with the runtime's ICU data ("Sep" vs "Sept").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "just now", "5m ago", "3h ago", "2d ago", then "12 Sep" (or "12 Sep 2025" for other years). */
export function formatRelativeTime(date: Date, now = new Date()): string {
  const diff = Math.max(0, now.getTime() - date.getTime());
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return date.getUTCFullYear() === now.getUTCFullYear()
    ? formatDayMonth(date)
    : `${formatDayMonth(date)} ${date.getUTCFullYear()}`;
}

/** "1 Oct" (UTC) */
export function formatDayMonth(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** "Sep 26" (UTC) */
export function formatMonthYear(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(-2)}`;
}

/** "a day", "5 days", "a week", "two weeks", "3 weeks". */
export function formatDayCount(days: number): string {
  if (days % 7 === 0 && days > 0) {
    const weeks = days / 7;
    return weeks === 1 ? "a week" : weeks === 2 ? "two weeks" : `${weeks} weeks`;
  }
  return days === 1 ? "a day" : `${days} days`;
}
