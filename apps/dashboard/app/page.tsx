"use client";

import { useEffect, useMemo, useState } from "react";

type Signal = {
  ts: number;
  symbol: string;
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
  dailyPnl: number;
  lockout: boolean;
  minSecondsBetweenSignals: number;
};

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
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

export default function Page() {
  const [wsStatus, setWsStatus] = useState<"connected" | "disconnected" | "error">(
    "disconnected"
  );
  const [signals, setSignals] = useState<Signal[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthStatus, setHealthStatus] = useState<"ok" | "down">("down");

  // You can later override these via env vars when deploying
  const engineHttp = useMemo(() => "http://localhost:8787/health", []);
  const engineWs = useMemo(() => "ws://localhost:8787", []);

  // WebSocket for live signals
  useEffect(() => {
    const ws = new WebSocket(engineWs);

    ws.onopen = () => setWsStatus("connected");
    ws.onclose = () => setWsStatus("disconnected");
    ws.onerror = () => setWsStatus("error");

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === "signal") {
        const s: Signal = msg.data;
        setSignals((prev) => [s, ...prev].slice(0, 50));
        beep();
      }
    };

    return () => ws.close();
  }, [engineWs]);

  // Poll /health for engine state + lockout
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(engineHttp, { cache: "no-store" });
        if (!res.ok) throw new Error("bad response");
        const json = (await res.json()) as Health;
        if (!cancelled) {
          setHealth(json);
          setHealthStatus("ok");
        }
      } catch {
        if (!cancelled) {
          setHealthStatus("down");
        }
      }
    }

    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [engineHttp]);

  const latest = signals[0];

  const lockout = health?.lockout ?? false;

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
              <StatusPill
                label={healthStatus}
                tone={healthStatus === "ok" ? "good" : "bad"}
              />
            </div>
          </div>
        </header>

        {lockout && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
            <div className="font-semibold text-red-800">Trading Locked (Daily Max Loss Hit)</div>
            <div className="text-sm text-red-700 mt-1">
              Engine is in lockout mode. Signals are paused because dailyPnL ≤ -$500.
            </div>
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card title="Daily PnL" value={health ? formatUsd(health.dailyPnl) : "—"} />
          <Card
            title="Min Signal Spacing"
            value={health ? `${health.minSecondsBetweenSignals}s` : "—"}
          />
          <Card title="Engine" value={health?.engine ?? "—"} />
        </section>

        {latest ? (
          <div className="rounded-2xl border p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-xl font-semibold">
                {latest.side} — {latest.symbol}
              </div>
              <div className="text-sm opacity-70">
                {new Date(latest.ts).toLocaleTimeString()}
              </div>
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
                <li>Confirm MNQ contract + 5 contracts</li>
                <li>Place bracket: target {latest.targetTicks} ticks, stop {latest.stopTicks} ticks</li>
                <li>Use time stop: flatten if not working in {latest.timeStopSec}s</li>
                <li>If you’re down bad, stop — system will lock at -$500</li>
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
                  {Math.round(s.confidence * 100)}% · Target {s.targetTicks} · Stop {s.stopTicks} · TS{" "}
                  {s.timeStopSec}s
                </div>
                <div className="text-xs opacity-60 mt-1">{s.reason}</div>
              </div>
            ))}
          </div>
        </section>

        <footer className="text-xs opacity-60">
          Next step: replace mock signals with real microstructure logic and feed from Sierra (DTC).
        </footer>
      </div>
    </main>
  );
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

  return <span className={`inline-block rounded-full border px-2 py-0.5 ${cls}`}>{label}</span>;
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

function formatUsd(n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toFixed(2)}`;
}