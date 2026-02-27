import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch("http://127.0.0.1:8787/health", { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { status: "down", error: e?.message ?? "health proxy failed" },
      { status: 502 }
    );
  }
}