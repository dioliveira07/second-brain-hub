import { NextRequest, NextResponse } from "next/server";

const HUB_URL = process.env.HUB_API_URL || "http://host.docker.internal:8010";
const HUB_KEY = process.env.HUB_API_KEY || "";
const HDRS: Record<string, string> = { "Content-Type": "application/json" };
if (HUB_KEY) HDRS["X-Hub-Key"] = HUB_KEY;

// GET /api/notif-proxy?unread_only=true&limit=50
export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  const res = await fetch(`${HUB_URL}/api/v1/notifications${qs ? "?" + qs : ""}`, { cache: "no-store", headers: HDRS });
  const data = await res.json();
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

// PATCH /api/notif-proxy?id=<uuid>&action=read
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest) {
  const id     = req.nextUrl.searchParams.get("id") ?? "";
  const action = req.nextUrl.searchParams.get("action") ?? "read";
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const res = await fetch(`${HUB_URL}/api/v1/notifications/${id}/${action}`, { method: "PATCH", headers: HDRS });
  const data = await res.json();
  return NextResponse.json(data);
}
