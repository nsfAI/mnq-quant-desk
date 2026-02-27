import path from "path";
import { readTicksCsv } from "./csv_ticks";
import { makeInitialState, onTick } from "./strategy";
import { makeSimState, onTick as simOnTick, tryOpen } from "./sim";
import { computeReport, writeSummaryJson, writeTradesCsv } from "./report";
import { parseArgs, isWithinRth } from "./utils";
import { BacktestConfig } from "./types";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const file = args["file"];
  const outdir = args["outdir"] ?? path.resolve(process.cwd(), "out");
  const rth = (args["rth"] ?? "true").toLowerCase() === "true";

  if (!file) {
    console.error("Usage: npm run backtest -- --file <pathToCsv> [--outdir <dir>] [--rth true|false]");
    process.exit(1);
  }

  const cfg: BacktestConfig = {
    symbol: "MNQ",
    rthOnly: rth,
    timezone: "America/Los_Angeles",
    rthStartHHMM: "06:30",
    rthEndHHMM: "13:00",
    minSecondsBetweenSignals: 15,
    sim: {
      symbol: "MNQ",
      tickSize: 0.25,
      tickValueUsd: 0.5,
      qty: 5,
      commissionPerContractUsd: 1.2, // edit later to match your broker
      slippageTicks: 1, // conservative: 1 tick each side
      dailyMaxLossUsd: -500,
      maxConsecutiveLosses: 6
    }
  };

  const stratCfg = {
    symbol: "MNQ" as const,
    tickSize: cfg.sim.tickSize,
    windowMs: 15000,
    minTradesInWindow: 80,
    minSecondsBetweenSignals: cfg.minSecondsBetweenSignals,
    minAbsorptionScore: 140,
    maxMomentumTicks: 8
  };

  const stratState = makeInitialState();
  const sim = makeSimState();

  let tickCount = 0;
  let signalCount = 0;

  for await (const tick of readTicksCsv(file)) {
    tickCount++;

    if (cfg.rthOnly) {
      if (!isWithinRth(tick.ts, cfg.timezone, cfg.rthStartHHMM, cfg.rthEndHHMM)) {
        continue;
      }
    }

    // update sim on every tick
    simOnTick(sim, cfg.sim, tick);
    if (sim.locked) break;

    // generate potential signal
    const sig = onTick(stratState, stratCfg, tick);
    if (sig) {
      signalCount++;
      // open only if flat
      tryOpen(sim, cfg.sim, sig, tick);
    }
  }

  const report = computeReport(sim.trades);

  const summary = {
    inputFile: file,
    outdir,
    rthOnly: cfg.rthOnly,
    ticksProcessed: tickCount,
    signalsGenerated: signalCount,
    tradesTaken: sim.trades.length,
    locked: sim.locked,
    dailyPnlUsd: sim.dailyPnlUsd,
    config: cfg,
    report
  };

  const tradesPath = writeTradesCsv(outdir, "trades.csv", sim.trades);
  const summaryPath = writeSummaryJson(outdir, "summary.json", summary);

  console.log("Backtest complete.");
  console.log(`Trades CSV:   ${tradesPath}`);
  console.log(`Summary JSON: ${summaryPath}`);
  console.log("");
  console.log("Key stats:");
  console.log(`  Trades: ${report.trades}`);
  console.log(`  Win rate: ${(report.winRate * 100).toFixed(1)}%`);
  console.log(`  Total PnL: $${report.totalPnlUsd.toFixed(2)}`);
  console.log(`  Avg PnL/trade: $${report.avgPnlUsd.toFixed(2)}`);
  console.log(`  Max drawdown: $${report.maxDrawdownUsd.toFixed(2)}`);
  console.log(`  Avg hold: ${report.avgHoldSec.toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});