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

// ✅ Allow dashboard (localhost:3000) to call /health
app.use(
  cors({
    origin: ["http://localhost:3000"],
  })
);

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const MIN_SECONDS_BETWEEN_SIGNALS = 15;
const DAILY_MAX_LOSS = -500;

let dailyPnl = 0;
let lastSignalTs = 0;

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    engine: "mnq-quant-desk",
    dailyPnl,
    lockout: dailyPnl <= DAILY_MAX_LOSS,
    minSecondsBetweenSignals: MIN_SECONDS_BETWEEN_SIGNALS,
  });
});

function broadcast(payload: unknown) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client: any) => {
    if (client.readyState === 1) client.send(msg);
  });
}

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

setInterval(() => {
  const now = Date.now();

  if (dailyPnl <= DAILY_MAX_LOSS) return;
  if (now - lastSignalTs < MIN_SECONDS_BETWEEN_SIGNALS * 1000) return;

  const signal = makeMockSignal();
  console.log("Broadcasting:", signal);

  broadcast(signal);
  lastSignalTs = now;
}, 1000);

server.listen(8787, () => {
  console.log("Engine running:");
  console.log("  HTTP: http://localhost:8787/health");
  console.log("  WS:   ws://localhost:8787");
});