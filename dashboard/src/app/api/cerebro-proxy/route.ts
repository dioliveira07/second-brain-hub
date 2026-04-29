import { NextRequest, NextResponse } from "next/server";

const HUB_URL = process.env.HUB_API_URL || "http://host.docker.internal:8010";
const HUB_KEY = process.env.HUB_API_KEY || "";
const AUTH_HEADERS: Record<string, string> = {};
if (HUB_KEY) AUTH_HEADERS["X-Hub-Key"] = HUB_KEY;

function validatePath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.includes("..") || path.includes("//")) return false;
  if (!/^[a-zA-Z0-9/_\-?=&%]+$/.test(path)) return false;
  return true;
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path || !validatePath(path)) return NextResponse.json({ error: "invalid path" }, { status: 400 });
  try {
    const res = await fetch(`${HUB_URL}/api/cerebro${path}`, { cache: "no-store", headers: AUTH_HEADERS });
    const data = await res.json();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "upstream error" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path || !validatePath(path)) return NextResponse.json({ error: "invalid path" }, { status: 400 });
  try {
    const body = req.headers.get("content-type")?.includes("application/json")
      ? await req.text()
      : undefined;
    const res = await fetch(`${HUB_URL}/api/cerebro${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
      body,
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "upstream error" }, { status: 502 });
  }
}
