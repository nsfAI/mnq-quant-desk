"use client";

import { useEffect, useMemo, useState } from "react";

type Signal = {
  ts: number;
  symbol: "MNQ";
  side: "LONG" | "SHORT";
  confidence: number; // 0..1
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

type WsMsg =
  | { type: "signal"; data: Signal }
  | { type: string; [k: string]: any };

function formatUsd(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function beep() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as any;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    o.frequency.value = 880;
    o.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 120);
  } catch {}
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "good" | "warn" | "bad";
}) {
  const cls =
    tone === "good"
      ? "bg-green-100 text-green-800 border-green-200"
      : tone === "warn"
      ? "bg-yellow-100 text-yellow-800 border-yellow-200"
      : "bg-red-100 text-red-800 border-red-200";

  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 ${cls}`}>
      {label}
    </span>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="text-xs opacity-70">{title}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}

export default function Page() {
  const engineHttp = useMemo(() => "http://localhost:8787", []);
  const engineWs = useMemo(() => "ws://localhost:8787", []);

  const [wsStatus, setWsStatus] = useState<"connected" | "disconnected" | "error">(
    "disconnected"
  );
  const [health, setHealth] = useState<Health | null>(null);
  const [healthStatus, setHealthStatus] = useState<"ok" | "down">("down");

  const [signals, setSignals] = useState<Signal[]>([]);
  const [pnlInput, setPnlInput] = useState("0");
  const [busy, setBusy] = useState(false);

  const latest = signals[0] ?? null;
  const lockout = health?.lockout ?? false;

  // WS: receive signals
  useEffect(() => {
    const ws = new WebSocket(engineWs);

    ws.onopen = () => setWsStatus("connected");
    ws.onclose = () => setWsStatus("disconnected");
    ws.onerror = () => setWsStatus("error");

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data) as WsMsg;
        if (msg.type === "signal" && msg.data) {
          setSignals((prev) => [msg.data, ...prev].slice(0, 50));
          beep();
        }
      } catch {}
    };

    return () => ws.close();
  }, [engineWs]);

  // HTTP: poll /health
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`${engineHttp}/health`, { cache: "no-store" });
        if (!res.ok) throw new Error("bad response");
        const json = (await res.json()) as Health;

        if (!cancelled) {
          setHealth(json);
          setHealthStatus(json?.status === "ok" ? "ok" : "down");
          setPnlInput(String(json.dailyPnL));
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
  }, [engineHttp]);

  async function postJson(path: string, body?: any) {
    setBusy(true);
    try {
      await fetch(`${engineHttp}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">MNQ Quant Desk</h1>
            <p className="text-sm opacity-70">
              Live alerts (manual execution in Tradovate). RTH only.
            </p>
          </div>

          <div className="text-right text-sm">
            <div>
              WS:{" "}
              <StatusPill
                label={wsStatus}
                tone={wsStatus === "connected" ? "good" : wsStatus === "error" ? "bad" : "warn"}
              />
            </div>
            <div className="mt-1">
              Health:{" "}
              <StatusPill label={healthStatus} tone={healthStatus === "ok" ? "good" : "bad"} />
            </div>
          </div>
        </header>

        {lockout && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
            <div className="font-semibold text-red-800">Signals Paused (Lockout Active)</div>
            <div className="text-sm text-red-700 mt-1">
              Daily PnL is at or below max loss. Engine will not emit signals.
            </div>
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Daily PnL" value={health ? formatUsd(health.dailyPnL) : "—"} />
          <Card title="Daily Max Loss" value={health ? formatUsd(health.dailyMaxLoss) : "—"} />
          <Card
            title="Min Signal Spacing"
            value={health ? `${health.minSecondsBetweenSignals}s` : "—"}
          />
        </section>

        <section className="rounded-2xl border p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-sm font-semibold">Controls</div>
              <div className="text-xs opacity-70">
                Manual risk control while you execute trades in Tradovate.
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm opacity-70">Set Daily PnL</label>
                <input
                  className="w-32 rounded-xl border px-3 py-2 text-sm"
                  value={pnlInput}
                  onChange={(e) => setPnlInput(e.target.value)}
                  inputMode="decimal"
                />
                <button
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
                  onClick={() => postJson("/pnl", { dailyPnl: Number(pnlInput) })}
                  disabled={busy || healthStatus !== "ok" || !Number.isFinite(Number(pnlInput))}
                >
                  Apply
                </button>
              </div>

              <button
                className="rounded-xl border px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
                onClick={() => postJson("/reset")}
                disabled={busy || healthStatus !== "ok"}
              >
                Reset Day
              </button>

              <button
                className="rounded-xl border px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
                onClick={() => postJson("/lock", { locked: !lockout })}
                disabled={busy || healthStatus !== "ok"}
              >
                {lockout ? "Unlock" : "Lock"}
              </button>
            </div>
          </div>
        </section>

        {latest ? (
          <div className="rounded-2xl border p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-xl font-semibold">
                {latest.side} — {latest.symbol}
              </div>
              <div className="text-sm opacity-70">{new Date(latest.ts).toLocaleTimeString()}</div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="Confidence" value={`${Math.round(latest.confidence * 100)}%`} />
              <Stat label="Target" value={`${latest.targetTicks} ticks`} />
              <Stat label="Stop" value={`${latest.stopTicks} ticks`} />
            </div>

            <div className="mt-3 text-sm opacity-80">Time stop: {latest.timeStopSec}s</div>
            <div className="mt-3 text-xs opacity-70 whitespace-pre-wrap">{latest.reason}</div>

            <div className="mt-4 rounded-xl bg-black/5 p-3 text-sm">
              <div className="font-semibold">Manual execution checklist</div>
              <ul className="list-disc pl-5 mt-1 opacity-80">
                <li>Confirm MNQ contract + up to 5 contracts</li>
                <li>
                  Place bracket: target {latest.targetTicks} ticks, stop {latest.stopTicks} ticks
                </li>
                <li>Time stop: flatten if not working in {latest.timeStopSec}s</li>
                <li>If you’re down bad, set PnL and let lockout protect you</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border p-6 opacity-70">Waiting for signals…</div>
        )}

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Recent Signals</h2>
          <div className="space-y-2">
            {signals.map((s) => (
              <div key={s.ts} className="rounded-xl border p-3 text-sm">
                <div className="flex justify-between">
                  <div className="font-medium">
                    {s.side} {s.symbol}
                  </div>
                  <div className="opacity-70">{new Date(s.ts).toLocaleTimeString()}</div>
                </div>
                <div className="opacity-70">
                  {Math.round(s.confidence * 100)}% · Target {s.targetTicks} · Stop {s.stopTicks} ·
                  TS {s.timeStopSec}s
                </div>
                <div className="text-xs opacity-60 mt-1">{s.reason}</div>
              </div>
            ))}
          </div>
        </section>

        <footer className="text-xs opacity-60">
          Next: plug real market data into strategy + backtest on 1 month.
        </footer>
      </div>
    </main>
  );
}