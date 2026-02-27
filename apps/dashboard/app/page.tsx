"use client";

import { useEffect, useMemo, useState } from "react";

type Signal = {
  ts: number;
  symbol: "MNQ";
  side: "LONG" | "SHORT";
  confidence: number;
  targetTicks: number;
  stopTicks: number;
  timeStopSec: number;
  reason: string;
};

type Health = {
  status: "ok";
  engine: string;
  dailyPnL: number;
  lockout: boolean;
  dailyMaxLoss: number;
  minSecondsBetweenSignals: number;
};

function formatUsd(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function Pill({
  label,
  tone,
}: {
  label: string;
  tone: "good" | "bad" | "warn";
}) {
  const styles =
    tone === "good"
      ? "bg-green-100 text-green-800 border-green-200"
      : tone === "warn"
      ? "bg-yellow-100 text-yellow-800 border-yellow-200"
      : "bg-red-100 text-red-800 border-red-200";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${styles}`}>
      {label}
    </span>
  );
}

export default function Page() {
  const wsUrl = useMemo(() => "ws://localhost:8787", []);

  const [signals, setSignals] = useState<Signal[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthStatus, setHealthStatus] = useState<"ok" | "down">("down");
  const [wsStatus, setWsStatus] = useState<
    "connected" | "disconnected" | "error"
  >("disconnected");

  const [pnlInput, setPnlInput] = useState("0");
  const [busy, setBusy] = useState(false);

  const latest = signals[0] ?? null;

  // -------------------------
  // WebSocket (signals)
  // -------------------------
  useEffect(() => {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setWsStatus("connected");
    ws.onclose = () => setWsStatus("disconnected");
    ws.onerror = () => setWsStatus("error");

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "signal" && msg.data) {
          setSignals((prev) => [msg.data, ...prev].slice(0, 50));
        }
      } catch {}
    };

    return () => ws.close();
  }, [wsUrl]);

  // -------------------------
  // Health polling (via proxy)
  // -------------------------
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) throw new Error("health failed");

        const data = (await res.json()) as Health;

        if (!cancelled) {
          setHealth(data);
          setHealthStatus(data.status === "ok" ? "ok" : "down");
          setPnlInput(String(data.dailyPnL));
        }
      } catch {
        if (!cancelled) setHealthStatus("down");
      }
    }

    poll();
    const id = setInterval(poll, 1500);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // -------------------------
  // Engine commands
  // -------------------------
  async function post(path: string, body?: any) {
    setBusy(true);
    try {
      await fetch(`http://localhost:8787${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  // -------------------------
  // UI
  // -------------------------
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* HEADER */}
        <header className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-semibold">MNQ Quant Desk</h1>
            <p className="text-sm opacity-70">
              Live alerts (manual execution in Tradovate). RTH only.
            </p>
          </div>

          <div className="text-right space-y-1">
            <div>
              WS:{" "}
              <Pill
                label={wsStatus}
                tone={
                  wsStatus === "connected"
                    ? "good"
                    : wsStatus === "error"
                    ? "bad"
                    : "warn"
                }
              />
            </div>
            <div>
              Health:{" "}
              <Pill
                label={healthStatus}
                tone={healthStatus === "ok" ? "good" : "bad"}
              />
            </div>
          </div>
        </header>

        {/* STATS */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border p-4">
            <div className="text-xs opacity-70">Daily PnL</div>
            <div className="text-xl font-semibold">
              {health ? formatUsd(health.dailyPnL) : "—"}
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-xs opacity-70">Daily Max Loss</div>
            <div className="text-xl font-semibold">
              {health ? formatUsd(health.dailyMaxLoss) : "—"}
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-xs opacity-70">Min Signal Spacing</div>
            <div className="text-xl font-semibold">
              {health ? `${health.minSecondsBetweenSignals}s` : "—"}
            </div>
          </div>
        </section>

        {/* CONTROLS */}
        <section className="rounded-xl border p-4 flex flex-col md:flex-row justify-between gap-3">
          <div>
            <div className="font-semibold text-sm">Controls</div>
            <div className="text-xs opacity-70">
              Manual risk control while executing trades.
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <input
              className="border rounded-xl px-3 py-2 text-sm w-28"
              value={pnlInput}
              onChange={(e) => setPnlInput(e.target.value)}
            />
            <button
              className="border rounded-xl px-3 py-2 text-sm"
              disabled={busy}
              onClick={() =>
                post("/pnl", { dailyPnl: Number(pnlInput) })
              }
            >
              Apply
            </button>
            <button
              className="border rounded-xl px-3 py-2 text-sm"
              disabled={busy}
              onClick={() => post("/reset")}
            >
              Reset
            </button>
          </div>
        </section>

        {/* LATEST SIGNAL */}
        {latest ? (
          <div className="rounded-xl border p-6 space-y-3">
            <div className="flex justify-between">
              <div className="text-xl font-semibold">
                {latest.side} — {latest.symbol}
              </div>
              <div className="text-sm opacity-70">
                {new Date(latest.ts).toLocaleTimeString()}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="border rounded-xl p-3 text-center">
                <div className="text-xs opacity-70">Confidence</div>
                <div className="font-semibold">
                  {Math.round(latest.confidence * 100)}%
                </div>
              </div>
              <div className="border rounded-xl p-3 text-center">
                <div className="text-xs opacity-70">Target</div>
                <div className="font-semibold">
                  {latest.targetTicks} ticks
                </div>
              </div>
              <div className="border rounded-xl p-3 text-center">
                <div className="text-xs opacity-70">Stop</div>
                <div className="font-semibold">
                  {latest.stopTicks} ticks
                </div>
              </div>
            </div>

            <div className="text-sm opacity-70">
              Time stop: {latest.timeStopSec}s
            </div>
          </div>
        ) : (
          <div className="rounded-xl border p-6 opacity-70">
            Waiting for signals…
          </div>
        )}

        {/* FOOTER */}
        <div className="text-xs opacity-60">
          Next: plug real market data into strategy + backtest 1 month.
        </div>

      </div>
    </main>
  );
}