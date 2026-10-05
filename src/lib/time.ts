/** All dates are shown in Asia/Jakarta (WIB), with the label visible. */
const WIB = "Asia/Jakarta";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: WIB,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** e.g. "Mon 6 Oct, 20:00 WIB" */
export function formatWIB(iso: string | Date) {
  return `${dateTimeFmt.format(new Date(iso))} WIB`;
}

/** e.g. 93 -> "1m 33s", 3725 -> "1h 2m 5s" */
export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m ${sec}s`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}
