import { roundToTick, ticksBetween } from "./utils";
import { Exit, Fill, Signal, TickRow, Trade, SimConfig } from "./types";

export type SimState = {
  open: null | {
    id: number;
    entry: Fill;
    signal: Signal;
    // tracking for MAE/MFE
    bestPrice: number;
    worstPrice: number;
  };
  nextId: number;
  trades: Trade[];
  dailyPnlUsd: number;
  consecutiveLosses: number;
  locked: boolean;
};

export function makeSimState(): SimState {
  return {
    open: null,
    nextId: 1,
    trades: [],
    dailyPnlUsd: 0,
    consecutiveLosses: 0,
    locked: false,
  };
}

function applySlippage(price: number, side: "LONG" | "SHORT", slippageTicks: number, tickSize: number, isEntry: boolean) {
  // For entry:
  // LONG pays worse (higher), SHORT sells worse (lower)
  // For exit:
  // LONG exit worse (lower), SHORT exit worse (higher)
  const slip = slippageTicks * tickSize;

  if (isEntry) {
    return side === "LONG" ? price + slip : price - slip;
  } else {
    return side === "LONG" ? price - slip : price + slip;
  }
}

export function tryOpen(sim: SimState, cfg: SimConfig, signal: Signal, tick: TickRow) {
  if (sim.locked) return;
  if (sim.open) return;

  // entry at ask for long, bid for short (then apply slippage)
  const rawEntry = signal.side === "LONG" ? tick.ask : tick.bid;
  const entryPrice = roundToTick(applySlippage(rawEntry, signal.side, cfg.slippageTicks, cfg.tickSize, true), cfg.tickSize);

  sim.open = {
    id: sim.nextId++,
    entry: { ts: tick.ts, side: signal.side, entryPrice, qty: cfg.qty },
    signal,
    bestPrice: entryPrice,
    worstPrice: entryPrice,
  };
}

export function onTick(sim: SimState, cfg: SimConfig, tick: TickRow) {
  if (sim.locked) return;
  if (!sim.open) return;

  const o = sim.open;

  // update MFE/MAE tracking using mid-ish trade price
  const mark = tick.price;
  o.bestPrice = o.entry.side === "LONG" ? Math.max(o.bestPrice, mark) : Math.min(o.bestPrice, mark);
  o.worstPrice = o.entry.side === "LONG" ? Math.min(o.worstPrice, mark) : Math.max(o.worstPrice, mark);

  const heldMs = tick.ts - o.entry.ts;
  const timeStopMs = o.signal.timeStopSec * 1000;

  const targetPx =
    o.entry.side === "LONG"
      ? o.entry.entryPrice + o.signal.targetTicks * cfg.tickSize
      : o.entry.entryPrice - o.signal.targetTicks * cfg.tickSize;

  const stopPx =
    o.entry.side === "LONG"
      ? o.entry.entryPrice - o.signal.stopTicks * cfg.tickSize
      : o.entry.entryPrice + o.signal.stopTicks * cfg.tickSize;

  // Use bid/ask for realistic trigger:
  // LONG target hits when bid >= target, stop hits when ask <= stop? (conservative)
  // SHORT target hits when ask <= target, stop hits when bid >= stop
  let exit: Exit | null = null;

  if (o.entry.side === "LONG") {
    if (tick.bid >= targetPx) exit = { ts: tick.ts, exitPrice: targetPx, reason: "TARGET" };
    else if (tick.ask <= stopPx) exit = { ts: tick.ts, exitPrice: stopPx, reason: "STOP" };
  } else {
    if (tick.ask <= targetPx) exit = { ts: tick.ts, exitPrice: targetPx, reason: "TARGET" };
    else if (tick.bid >= stopPx) exit = { ts: tick.ts, exitPrice: stopPx, reason: "STOP" };
  }

  if (!exit && heldMs >= timeStopMs) {
    // time exit at worse side of spread (more realistic)
    const rawExit = o.entry.side === "LONG" ? tick.bid : tick.ask;
    const exitPrice = roundToTick(applySlippage(rawExit, o.entry.side, cfg.slippageTicks, cfg.tickSize, false), cfg.tickSize);
    exit = { ts: tick.ts, exitPrice, reason: "TIME" };
  }

  if (!exit) return;

  // apply slippage to target/stop exits too (realistic)
  const slippedExitPrice = roundToTick(
    applySlippage(exit.exitPrice, o.entry.side, cfg.slippageTicks, cfg.tickSize, false),
    cfg.tickSize
  );

  const pnlTicks =
    o.entry.side === "LONG"
      ? ticksBetween(o.entry.entryPrice, slippedExitPrice, cfg.tickSize)
      : ticksBetween(slippedExitPrice, o.entry.entryPrice, cfg.tickSize);

  const grossUsd = pnlTicks * cfg.tickValueUsd * o.entry.qty;

  const commissionUsd = cfg.commissionPerContractUsd * o.entry.qty;
  const pnlUsd = grossUsd - commissionUsd;

  const maeTicks =
    o.entry.side === "LONG"
      ? ticksBetween(o.entry.entryPrice, o.worstPrice, cfg.tickSize)
      : ticksBetween(o.worstPrice, o.entry.entryPrice, cfg.tickSize);

  const mfeTicks =
    o.entry.side === "LONG"
      ? ticksBetween(o.entry.entryPrice, o.bestPrice, cfg.tickSize)
      : ticksBetween(o.bestPrice, o.entry.entryPrice, cfg.tickSize);

  const trade: Trade = {
    id: o.id,
    entry: o.entry,
    exit: { ...exit, exitPrice: slippedExitPrice },
    pnlUsd,
    pnlTicks,
    maeTicks,
    mfeTicks,
    holdingMs: heldMs,
  };

  sim.trades.push(trade);
  sim.dailyPnlUsd += pnlUsd;

  if (pnlUsd < 0) sim.consecutiveLosses += 1;
  else sim.consecutiveLosses = 0;

  // risk locks
  if (sim.dailyPnlUsd <= cfg.dailyMaxLossUsd) sim.locked = true;
  if (sim.consecutiveLosses >= cfg.maxConsecutiveLosses) sim.locked = true;

  sim.open = null;
}