export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function parseArgs(argv: string[]) {
  // very small arg parser: --file path --outdir path --rth true/false
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) continue;
    const key = k.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) out[key] = "true";
    else {
      out[key] = val;
      i++;
    }
  }
  return out;
}

export function hhmmToMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  return h * 60 + m;
}

// RTH filter using local clock time derived from an ISO string in the CSV
// In our pipeline, we store ts as epoch ms already, but we still want RTH by Los Angeles time.
// Node has Intl timeZone formatting — we can derive HH:MM from it.
export function isWithinRth(ts: number, timeZone: string, startHHMM: string, endHHMM: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ts));
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const minutes = hh * 60 + mm;
  const start = hhmmToMinutes(startHHMM);
  const end = hhmmToMinutes(endHHMM);
  return minutes >= start && minutes <= end;
}

export function roundToTick(price: number, tickSize: number) {
  return Math.round(price / tickSize) * tickSize;
}

export function ticksBetween(a: number, b: number, tickSize: number) {
  return (b - a) / tickSize;
}