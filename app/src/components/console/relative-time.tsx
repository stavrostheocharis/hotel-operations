/**
 * "2 h ago" / "3 d ago" / "12 Jul", with the exact timestamp on hover.
 * Server component; `now` is passed in so the static shell never reads the
 * clock.
 */
export function RelativeTime({ at, now, timeZone }: { at: Date; now: Date; timeZone: string }) {
  const diff = now.getTime() - at.getTime();
  const minutes = Math.round(diff / 60_000);
  const hours = Math.round(diff / 3_600_000);
  const days = Math.round(diff / 86_400_000);
  let text: string;
  if (Math.abs(minutes) < 60) text = minutes <= 0 ? "now" : `${minutes} min ago`;
  else if (Math.abs(hours) < 48) text = hours < 0 ? `in ${-hours} h` : `${hours} h ago`;
  else if (Math.abs(days) < 14) text = days < 0 ? `in ${-days} d` : `${days} d ago`;
  else text = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "short" }).format(at);
  const exact = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(at);
  return (
    <time dateTime={at.toISOString()} title={exact} className="whitespace-nowrap tabular-nums">
      {text}
    </time>
  );
}
