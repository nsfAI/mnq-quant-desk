import fs from "fs";
import path from "path";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function main() {
  const out = path.resolve(process.cwd(), "..", "..", "data", "sample_mnq_ticks.csv");
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const start = new Date("2026-02-27T06:30:00-08:00").getTime();
  const rows: string[] = [];
  rows.push("ts,price,bid,ask,size");

  let px = 17350.0;
  const tick = 0.25;

  // ~60 minutes of synthetic ticks
  for (let i = 0; i < 60 * 60 * 8; i++) {
    const ts = start + i * 125; // 8 ticks/sec

    // random walk with occasional bursts
    const burst = Math.random() < 0.01 ? (Math.random() - 0.5) * 8 : (Math.random() - 0.5) * 1.2;
    px += Math.round(burst) * tick;

    const bid = px;
    const ask = px + tick;
    const price = Math.random() > 0.5 ? ask : bid;
    const size = 1 + Math.floor(Math.random() * 6);

    rows.push(`${new Date(ts).toISOString()},${price.toFixed(2)},${bid.toFixed(2)},${ask.toFixed(2)},${size}`);
  }

  fs.writeFileSync(out, rows.join("\n"), "utf8");
  console.log("Wrote:", out);
}

main();