const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 19_800_000;

export function dashboardDays(now: Date) {
  const local = new Date(now.getTime() + IST_OFFSET_MS);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - IST_OFFSET_MS;
  return Array.from({ length: 7 }, (_, index) => {
    const start = new Date(midnight - (6 - index) * DAY_MS);
    return {
      start,
      end: new Date(start.getTime() + DAY_MS),
      day: start.toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Kolkata" }),
    };
  });
}