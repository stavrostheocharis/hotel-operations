/**
 * Convert a wall-clock time in an IANA timezone to a UTC Date, without a
 * timezone library. Two passes handle daylight-saving offsets.
 */
export function zonedToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
  },
  timeZone: string,
): Date {
  const { year, month, day, hour = 0, minute = 0 } = parts;
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const wall = wallClockUtcMillis(new Date(guess), timeZone);
    guess += wanted - wall;
  }
  return new Date(guess);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClockUtcMillis(date: Date, timeZone: string): number {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, fmt);
  }
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** "DD/MM/YYYY HH:MM" (Greek-locale ticketing export) in a timezone. */
export function parseDmyHm(text: string, timeZone: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(
    text.trim(),
  );
  if (!m) return null;
  return zonedToUtc(
    {
      year: Number(m[3]),
      month: Number(m[2]),
      day: Number(m[1]),
      hour: m[4] ? Number(m[4]) : 0,
      minute: m[5] ? Number(m[5]) : 0,
    },
    timeZone,
  );
}

/** "YYYY-MM-DD" at local midnight in a timezone. */
export function parseIsoDateLocal(text: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) return null;
  return zonedToUtc(
    { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) },
    timeZone,
  );
}

/** "HH:MM" text → { hour, minute }, or null. */
export function parseHm(text: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}
