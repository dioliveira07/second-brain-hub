const HUB_URL = process.env.HUB_API_URL || "http://host.docker.internal:8010";

// revalidate: 30s para dados que mudam raramente (repos, stats, grafo)
// no-store: apenas para dados em tempo real (notificações, search)
export async function hubFetch<T>(
  path: string,
  options?: RequestInit & { revalidate?: number | false },
): Promise<T> {
  const { revalidate = 30, ...fetchOptions } = options ?? {};

  const res = await fetch(`${HUB_URL}/api/v1${path}`, {
    ...fetchOptions,
    headers: { "Content-Type": "application/json", ...(fetchOptions?.headers || {}) },
    next: revalidate === false ? undefined : { revalidate },
    cache: revalidate === false ? "no-store" : undefined,
  });
  if (!res.ok) throw new Error(`Hub API error: ${res.status} ${path}`);
  return res.json();
}

export type StatsOverview = {
  repos_indexed: number;
  chunks_total: number;
  qdrant_points: number;
  decisions_captured: number;
  notifications_unread: number;
};

export type Repo = {
  repo: string;
  status: string;
  last_indexed_at: string | null;
};

export type Decision = {
  id: string;
  repo: string;
  pr_number: number;
  pr_title: string;
  pr_author: string;
  impact_areas: string[];
  breaking_changes: boolean;
  merged_at: string | null;
};

export type GraphNode = {
  id: string;
  type: "repo" | "technology" | "developer";
  label: string;
  size: number;
  color: string;
  data: Record<string, unknown>;
};

export type GraphEdge = {
  source: string;
  target: string;
  type: string;
  weight: number;
};
