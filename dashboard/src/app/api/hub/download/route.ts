import { NextRequest, NextResponse } from "next/server";

const HUB_URL = process.env.HUB_API_URL || "http://host.docker.internal:8010";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const owner = searchParams.get("owner");
  const repo  = searchParams.get("repo");
  const path  = searchParams.get("path") ?? "";

  if (!owner || !repo) {
    return NextResponse.json({ error: "owner e repo são obrigatórios" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${HUB_URL}/api/v1/repos/${owner}/${repo}/download?path=${encodeURIComponent(path)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      return NextResponse.json({ error: err.detail ?? "Erro no hub" }, { status: res.status });
    }
    const buf = await res.arrayBuffer();
    const cd  = res.headers.get("content-disposition") ?? `attachment; filename="${repo}.zip"`;
    return new NextResponse(buf, {
      headers: {
        "Content-Type":        "application/zip",
        "Content-Disposition": cd,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `Hub indisponível: ${e}` }, { status: 502 });
  }
}
