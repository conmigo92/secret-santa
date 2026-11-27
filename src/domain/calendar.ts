const DAY_MS = 86_400_000;

/** Days from the local calendar date of `today` to the next December 25, including today. */
export function christmasCountdown(today: Date): string {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let target = new Date(start.getFullYear(), 11, 25);
  if (start.getTime() > target.getTime()) {
    target = new Date(start.getFullYear() + 1, 11, 25);
  }
  const days = Math.round((target.getTime() - start.getTime()) / DAY_MS);
  if (days === 0) return "Christmas is today";
  if (days === 1) return "1 day until Christmas";
  return `${days} days until Christmas`;
}
