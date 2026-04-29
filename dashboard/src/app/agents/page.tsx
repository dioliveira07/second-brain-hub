import { cerebroFetch, hubFetch, AgentInfo, AgentRunRow } from "@/lib/hub";
import { AgentsClient } from "@/components/AgentsClient";

type AgentSub = { id: string; agent_name: string; projeto: string; enabled: boolean };
type Repo     = { repo: string; status: string };

export default async function AgentsPage() {
  let agents: AgentInfo[]  = [];
  let runs: AgentRunRow[]  = [];
  let subs: AgentSub[]     = [];
  let repos: Repo[]        = [];
  try {
    [agents, runs, subs, repos] = await Promise.all([
      cerebroFetch<AgentInfo[]>("/agents"),
      cerebroFetch<AgentRunRow[]>("/agent_runs?limit=80"),
      cerebroFetch<AgentSub[]>("/agent_subscriptions"),
      hubFetch<Repo[]>("/repos"),
    ]);
  } catch {}

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: 1100 }}>
      <div>
        <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Substrate de Agentes</div>
        <h1 style={{ fontFamily: "'Fira Code', monospace", color: "#06b6d4", fontSize: "1.4rem", margin: 0 }}>
          ◈ AGENTS — {agents.length} ativos · {runs.length} runs recentes
        </h1>
      </div>
      <AgentsClient
        initialAgents={agents}
        initialRuns={runs}
        initialSubs={subs}
        repos={repos.map(r => r.repo)}
      />
    </div>
  );
}
