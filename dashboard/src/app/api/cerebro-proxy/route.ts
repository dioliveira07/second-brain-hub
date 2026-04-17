import { NextRequest, NextResponse } from "next/server";

const HUB_URL = process.env.HUB_API_URL || "http://host.docker.internal:8010";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path) return NextResponse.json({ error: "missing path" }, { status: 400 });
  try {
    const res = await fetch(`${HUB_URL}/api/cerebro${path}`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "upstream error" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path) return NextResponse.json({ error: "missing path" }, { status: 400 });
  try {
    const body = req.headers.get("content-type")?.includes("application/json")
      ? await req.text()
      : undefined;
    const res = await fetch(`${HUB_URL}/api/cerebro${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "upstream error" }, { status: 502 });
  }
}
