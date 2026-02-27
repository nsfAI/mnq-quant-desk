import express from "express";
import http from "http";
import cors from "cors";
import { WebSocketServer } from "ws";

type Signal = {
  type: "signal";
  data: {
    ts: number;
    symbol: "MNQ";
    side: "LONG" | "SHORT";
    confidence: number;
    targetTicks: number;
    stopTicks: number;
    timeStopSec: number;
    reason: string;
  };
};

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: ["http://localhost:3000"],
  })
);

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/**
 * CONFIG
 */
const MIN_SECONDS_BETWEEN_SIGNALS = 15;
const DAILY_MAX_LOSS = -500;

/**
 * STATE
 */
let dailyPnl = 0;
let lastSignalTs = 0;
let locked = false;

function recomputeLock() {
  locked = locked || dailyPnl <= DAILY_MAX_LOSS;
}

/**
 * HEALTH
 */
app.get("/health", (_req, res) => {
  recomputeLock();
  res.json({
    status: "ok",
    engine: "mnq-quant-desk",
    dailyPnl,
    lockout: locked,
    dailyMaxLoss: DAILY_MAX_LOSS,
    minSecondsBetweenSignals: MIN_SECONDS_BETWEEN_SIGNALS,
  });
});

/**
 * SET PNL (manual)
 * body: { dailyPnl: number }
 */
app.post("/pnl", (req, res) => {
  const n = Number(req.body?.dailyPnl);
  if (!Number.isFinite(n)) {
    return res.status(400).json({ ok: false, error: "dailyPnl must be a number" });
  }
  dailyPnl = n;
  recomputeLock();
  return res.json({ ok: true, dailyPnl, lockout: locked });
});

/**
 * RESET DAY
 */
app.post("/reset", (_req, res) => {
  dailyPnl = 0;
  lastSignalTs = 0;
  locked = false;
  return res.json({ ok: true, dailyPnl, lockout: locked });
});

/**
 * MANUAL LOCK/UNLOCK (optional safety)
 * body: { locked: boolean }
 */
app.post("/lock", (req, res) => {
  const v = req.body?.locked;
  if (typeof v !== "boolean") {
    return res.status(400).json({ ok: false, error: "locked must be boolean" });
  }
  locked = v;
  recomputeLock();
  return res.json({ ok: true, lockout: locked, dailyPnl });
});

/**
 * WS BROADCAST
 */
function broadcast(payload: unknown) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client: any) => {
    if (client.readyState === 1) client.send(msg);
  });
}

/**
 * MOCK SIGNAL (placeholder)
 */
function makeMockSignal(): Signal {
  return {
    type: "signal",
    data: {
      ts: Date.now(),
      symbol: "MNQ",
      side: Math.random() > 0.5 ? "LONG" : "SHORT",
      confidence: Math.random() * 0.4 + 0.6,
      targetTicks: 10,
      stopTicks: 14,
      timeStopSec: 20,
      reason: "Mock signal (system plumbing test)",
    },
  };
}

/**
 * LOOP
 */
setInterval(() => {
  const now = Date.now();

  recomputeLock();
  if (locked) return;

  if (now - lastSignalTs < MIN_SECONDS_BETWEEN_SIGNALS * 1000) return;

  const signal = makeMockSignal();
  console.log("Broadcasting:", signal);

  broadcast(signal);
  lastSignalTs = now;
}, 1000);

/**
 * START
 */
server.listen(8787, () => {
  console.log("Engine running:");
  console.log("  HTTP: http://localhost:8787/health");
  console.log("  WS:   ws://localhost:8787");
});