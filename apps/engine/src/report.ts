import fs from "fs";
import path from "path";
import { Trade } from "./types";

export type Report = {
  trades: number;
  winRate: number;
  avgPnlUsd: number;
  totalPnlUsd: number;
  maxDrawdownUsd: number;
  avgHoldSec: number;
  avgMaeTicks: number;
  avgMfeTicks: number;
};

export function computeReport(trades: Trade[]): Report {
  const n = trades.length;
  const total = trades.reduce((s, t) => s + t.pnlUsd, 0);
  const wins = trades.filter((t) => t.pnlUsd > 0).length;

  let peak = 0;
  let eq = 0;
  let maxDd = 0;
  for (const t of trades) {
    eq += t.pnlUsd;
    peak = Math.max(peak, eq);
    maxDd = Math.min(maxDd, eq - peak);
  }

  const avgHoldSec = n ? trades.reduce((s, t) => s + t.holdingMs, 0) / n / 1000 : 0;
  const avgMaeTicks = n ? trades.reduce((s, t) => s + t.maeTicks, 0) / n : 0;
  const avgMfeTicks = n ? trades.reduce((s, t) => s + t.mfeTicks, 0) / n : 0;

  return {
    trades: n,
    winRate: n ? wins / n : 0,
    avgPnlUsd: n ? total / n : 0,
    totalPnlUsd: total,
    maxDrawdownUsd: maxDd, // negative number
    avgHoldSec,
    avgMaeTicks,
    avgMfeTicks,
  };
}

export function writeTradesCsv(outDir: string, fileName: string, trades: Trade[]) {
  fs.mkdirSync(outDir, { recursive: true });
  const p = path.join(outDir, fileName);

  const header = [
    "id",
    "entry_ts",
    "side",
    "qty",
    "entry_price",
    "exit_ts",
    "exit_price",
    "exit_reason",
    "pnl_ticks",
    "pnl_usd",
    "mae_ticks",
    "mfe_ticks",
    "holding_ms"
  ].join(",");

  const rows = trades.map((t) =>
    [
      t.id,
      new Date(t.entry.ts).toISOString(),
      t.entry.side,
      t.entry.qty,
      t.entry.entryPrice.toFixed(2),
      new Date(t.exit.ts).toISOString(),
      t.exit.exitPrice.toFixed(2),
      t.exit.reason,
      t.pnlTicks.toFixed(2),
      t.pnlUsd.toFixed(2),
      t.maeTicks.toFixed(2),
      t.mfeTicks.toFixed(2),
      t.holdingMs
    ].join(",")
  );

  fs.writeFileSync(p, [header, ...rows].join("\n"), "utf8");
  return p;
}

export function writeSummaryJson(outDir: string, fileName: string, summary: unknown) {
  fs.mkdirSync(outDir, { recursive: true });
  const p = path.join(outDir, fileName);
  fs.writeFileSync(p, JSON.stringify(summary, null, 2), "utf8");
  return p;
}