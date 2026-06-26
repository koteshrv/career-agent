// Backend timestamps are naive UTC (e.g. "2026-06-26T18:30:00"). Parse them as
// UTC and render in IST (Asia/Kolkata) regardless of the viewer's timezone.

const IST = "Asia/Kolkata"

export function toUTCDate(ts: string): Date {
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(ts)
  return new Date(hasTz ? ts : ts + "Z")
}

export function formatISTDateTime(ts: string): string {
  return toUTCDate(ts).toLocaleString("en-IN", {
    timeZone: IST,
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }) + " IST"
}

export function formatISTDate(ts: string, withYear = false): string {
  return toUTCDate(ts).toLocaleString("en-IN", {
    timeZone: IST,
    month: "short", day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  })
}
