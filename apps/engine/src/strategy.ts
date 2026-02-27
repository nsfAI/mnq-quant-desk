import { clamp, ticksBetween } from "./utils";
import { Signal, TickRow } from "./types";

export type StrategyState = {
  lastSignalTs: number;
  // rolling window buffers
  window: TickRow[];
};

export type StrategyConfig = {
  symbol: "MNQ";
  tickSize: number;
  windowMs: number; // e.g., 15000
  minTradesInWindow: number; // activity floor
  minSecondsBetweenSignals: number;

  // thresholds (we’ll tune later on real data)
  minAbsorptionScore: number; // bigger = stricter
  maxMomentumTicks: number; // avoid chasing
};

export function makeInitialState(): StrategyState {
  return { lastSignalTs: 0, window: [] };
}

export function onTick(
  state: StrategyState,
  cfg: StrategyConfig,
  tick: TickRow
): Signal | null {
  // maintain window
  state.window.push(tick);
  const cutoff = tick.ts - cfg.windowMs;
  while (state.window.length && state.window[0].ts < cutoff) state.window.shift();

  // spacing
  if (tick.ts - state.lastSignalTs < cfg.minSecondsBetweenSignals * 1000) return null;

  const w = state.window;
  if (w.length < cfg.minTradesInWindow) return null;

  const first = w[0];
  const last = w[w.length - 1];

  // delta proxy: trade at ask = buy aggressor, trade at bid = sell aggressor
  let delta = 0;
  for (const t of w) {
    if (t.price >= t.ask) delta += t.size;
    else if (t.price <= t.bid) delta -= t.size;
  }

  // momentum in ticks over the window
  const momTicks = ticksBetween(first.price, last.price, cfg.tickSize);

  // activity rate
  const secs = cfg.windowMs / 1000;
  const tradesPerSec = w.length / secs;

  // basic regime filter
  if (tradesPerSec < 3) return null;      // dead tape
  if (tradesPerSec > 120) return null;    // often news spikes / messy

  // absorption-style score: big delta but limited progress
  const absorptionScore = Math.abs(delta) / (1 + Math.abs(momTicks));

  if (absorptionScore < cfg.minAbsorptionScore) return null;
  if (Math.abs(momTicks) > cfg.maxMomentumTicks) return null;

  // If buyers are aggressive (delta positive) but price isn’t moving much up -> potential SHORT
  // If sellers are aggressive (delta negative) but price isn’t moving much down -> potential LONG
  let side: "LONG" | "SHORT" | null = null;

  if (delta > 0 && momTicks < 2) side = "SHORT";
  if (delta < 0 && momTicks > -2) side = "LONG";

  if (!side) return null;

  const confidence = clamp(absorptionScore / (cfg.minAbsorptionScore * 3), 0.55, 0.92);

  const signal: Signal = {
    ts: tick.ts,
    symbol: "MNQ",
    side,
    confidence,
    targetTicks: 10,
    stopTicks: 14,
    timeStopSec: 20,
    reason: `absorptionScore=${absorptionScore.toFixed(1)} delta=${delta.toFixed(0)} momTicks=${momTicks.toFixed(
      1
    )} trades/s=${tradesPerSec.toFixed(1)}`,
  };

  state.lastSignalTs = tick.ts;
  return signal;
}