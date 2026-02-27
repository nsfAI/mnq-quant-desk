export type TickRow = {
  // epoch ms (number) for fast replay
  ts: number;

  // prices
  price: number;
  bid: number;
  ask: number;

  // last trade size (contracts)
  size: number;
};

export type Side = "LONG" | "SHORT";

export type Signal = {
  ts: number;
  symbol: "MNQ";
  side: Side;

  // 0..1
  confidence: number;

  // bracket parameters
  targetTicks: number;
  stopTicks: number;
  timeStopSec: number;

  // explanation
  reason: string;
};

export type Fill = {
  ts: number;
  side: Side;
  entryPrice: number;
  qty: number;
};

export type Exit = {
  ts: number;
  exitPrice: number;
  reason: "TARGET" | "STOP" | "TIME" | "FLAT";
};

export type Trade = {
  id: number;
  entry: Fill;
  exit: Exit;
  pnlUsd: number;
  pnlTicks: number;
  maeTicks: number; // max adverse excursion
  mfeTicks: number; // max favorable excursion
  holdingMs: number;
};

export type SimConfig = {
  symbol: "MNQ";
  tickSize: number; // 0.25
  tickValueUsd: number; // $0.50 per tick per contract for MNQ
  qty: number; // max 5 contracts

  // Costs / realism
  commissionPerContractUsd: number; // round-turn commission per contract
  slippageTicks: number; // applied on entry + exit (each side)

  // Risk governor
  dailyMaxLossUsd: number; // -500
  maxConsecutiveLosses: number; // optional safety
};

export type BacktestConfig = {
  symbol: "MNQ";
  rthOnly: boolean;
  // interpret timestamps as America/Los_Angeles for RTH filter
  timezone: "America/Los_Angeles";
  // RTH session times (local)
  rthStartHHMM: "06:30";
  rthEndHHMM: "13:00";
  minSecondsBetweenSignals: number;

  sim: SimConfig;
};