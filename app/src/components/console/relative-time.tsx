import { fmtDate } from "@/console/format";
import { t } from "@/i18n";

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
  if (Math.abs(minutes) < 60) text = minutes <= 0 ? t("time.now") : t("time.minutesAgo", { n: minutes });
  else if (Math.abs(hours) < 48) text = hours < 0 ? t("time.inHours", { n: -hours }) : t("time.hoursAgo", { n: hours });
  else if (Math.abs(days) < 14) text = days < 0 ? t("time.inDays", { n: -days }) : t("time.daysAgo", { n: days });
  else text = fmtDate(at, timeZone, now);
  const exact = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(at);
  return (
    <time dateTime={at.toISOString()} title={exact} className="whitespace-nowrap tabular-nums">
      {text}
    </time>
  );
}
