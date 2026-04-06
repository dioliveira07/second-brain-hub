const HUB_URL = process.env.HUB_API_URL || "http://hub-api:8000";

export async function hubFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${HUB_URL}/api/v1${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    cache: "no-store",
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
