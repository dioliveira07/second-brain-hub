import { NextResponse } from "next/server";

const HUB_URL = process.env.HUB_API_URL || "http://host.docker.internal:8010";

export async function GET() {
  try {
    const [reposRes, statsRes] = await Promise.all([
      fetch(`${HUB_URL}/api/v1/repos`, { cache: "no-store" }),
      fetch(`${HUB_URL}/api/v1/stats/overview`, { cache: "no-store" }),
    ]);
    const repos = await reposRes.json();
    const stats = await statsRes.json();
    const active = repos.some((r: { status: string }) =>
      r.status === "indexing" || r.status === "queued"
    );
    return NextResponse.json({ active, repos, stats }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ active: false, repos: [], stats: null });
  }
}
