const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatFull(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** "Today", "Yesterday", or e.g. "Monday, 28 September". */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** "just now", "5m", "3h", "2d": compact, like Slack's activity list. */
export function relativeTime(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}
