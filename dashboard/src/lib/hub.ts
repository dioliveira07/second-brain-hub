const HUB_URL = process.env.HUB_API_URL || "http://host.docker.internal:8010";
const HUB_KEY = process.env.HUB_API_KEY || "";

function hubHeaders(extra?: HeadersInit): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (HUB_KEY) h["X-Hub-Key"] = HUB_KEY;
  if (extra) Object.assign(h, extra);
  return h;
}

export async function cerebroFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${HUB_URL}/api/cerebro${path}`, {
    headers: hubHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Cerebro API error: ${res.status} ${path}`);
  return res.json();
}

// no-store por padrão — router.refresh() busca dados frescos em tempo real
// passar revalidate: 60 apenas para dados caros (grafo)
export async function hubFetch<T>(
  path: string,
  options?: RequestInit & { revalidate?: number | false },
): Promise<T> {
  const { revalidate = false, ...fetchOptions } = options ?? {};

  const res = await fetch(`${HUB_URL}/api/v1${path}`, {
    ...fetchOptions,
    headers: hubHeaders(fetchOptions?.headers as HeadersInit),
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

export type TaskItem = {
  title: string;
  status: "pending" | "running" | "done" | "error";
};

export type TaskNotification = {
  id: string;
  message: string;
  repo: string | null;
  metadata: { tasks: TaskItem[]; projeto?: string };
  created_at: string;
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

// Foundation v2: memory + events + agents

export type Memory = {
  id: string;
  type: string;
  scope: string;
  scope_ref: string | null;
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  access_count: number;
  source_type: string | null;
  source_ref: string | null;
  expires_at: string | null;
  archived: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type EventItem = {
  id: string;
  type: string;
  actor: string | null;
  projeto: string | null;
  payload: Record<string, unknown>;
  source_table: string | null;
  source_id: string | null;
  ts: string | null;
  created_at: string | null;
};

export type AgentInfo = {
  name: string;
  model: string;
  subscribes: string[];
  cron: string | null;
};

export type AgentRunRow = {
  id: string;
  agent_name: string;
  model: string | null;
  trigger_type: string;
  trigger_ref: string | null;
  status: "running" | "done" | "error";
  error_message: string | null;
  duration_ms: number | null;
  cost_estimate: number | null;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
};

export type AgentSubscription = {
  id: string;
  agent_name: string;
  projeto: string;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};
