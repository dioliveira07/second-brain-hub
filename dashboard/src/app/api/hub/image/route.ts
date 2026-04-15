import { NextRequest, NextResponse } from "next/server";

const HUB_URL = process.env.HUB_API_URL || "http://host.docker.internal:8010";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const owner = searchParams.get("owner");
  const repo  = searchParams.get("repo");
  const path  = searchParams.get("path");

  if (!owner || !repo || !path) {
    return NextResponse.json({ error: "owner, repo e path são obrigatórios" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${HUB_URL}/api/v1/repos/${owner}/${repo}/image?path=${encodeURIComponent(path)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return NextResponse.json({ error: `Hub error: ${res.status}` }, { status: res.status });
    }
    const buf = await res.arrayBuffer();
    const ct  = res.headers.get("content-type") ?? "image/octet-stream";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `Hub indisponível: ${e}` }, { status: 502 });
  }
}
