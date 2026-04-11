import { hubFetch } from "@/lib/hub";
import { DepsGraphClient, type APIGraphNode, type APIGraphEdge } from "@/components/DepsGraphClient";
import { FadeIn } from "@/components/reactbits/FadeIn";
import { GitBranch, Info } from "lucide-react";

export default async function DepsGraphPage() {
  let nodes: APIGraphNode[] = [];
  let edges: APIGraphEdge[] = [];

  try {
    const [nodesRes, edgesRes] = await Promise.all([
      hubFetch<{ nodes: APIGraphNode[]; total: number }>("/graph/nodes", { revalidate: 60 }),
      hubFetch<{ edges: APIGraphEdge[]; total: number }>("/graph/edges", { revalidate: 60 }),
    ]);
    nodes = nodesRes.nodes;
    edges = edgesRes.edges;
  } catch {}

  const repoCount  = nodes.filter((n) => n.type === "repo").length;
  const techCount  = nodes.filter((n) => n.type === "technology").length;

  return (
    <FadeIn from="bottom" duration={500}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", height: "calc(100vh - 4rem)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", flexShrink: 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <GitBranch size={13} color="var(--cyan)" />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Grafo de Dependências
              </span>
            </div>
            <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.4rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", margin: 0 }}>
              Repository Dependency Graph
            </h2>
            <p style={{ fontFamily: "var(--sans)", fontSize: "0.78rem", color: "var(--muted-foreground)", margin: "0.3rem 0 0" }}>
              Dependências inter-repositório —{" "}
              <span style={{ color: "var(--cyan)" }}>{repoCount} repos indexados</span>
              {" · "}
              <span style={{ color: "var(--purple)" }}>{techCount} tecnologias</span>
              {" · "}
              <span style={{ color: "var(--green)" }}>{edges.length} conexões</span>
            </p>
          </div>
        </div>

        {/* Legend */}
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "1.5rem",
          flexWrap:     "wrap",
          padding:      "0.6rem 1rem",
          background:   "var(--bg-panel)",
          border:       "1px solid var(--border-dim)",
          borderRadius: "var(--r)",
          flexShrink:   0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Info size={10} color="var(--dim)" />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--dim)" }}>camadas:</span>
          </div>
          {[
            { label: "Full-stack",      color: "#a78bfa" },
            { label: "Backend",         color: "#f87171" },
            { label: "Frontend",        color: "#06b6d4" },
            { label: "Data / Storage",  color: "#fbbf24" },
            { label: "Infra / Ops",     color: "#fb923c" },
            { label: "Tooling",         color: "#34d399" },
            { label: "Tecnologia",      color: "#22c55e" },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}`, display: "inline-block" }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: "var(--muted-foreground)" }}>{label}</span>
            </div>
          ))}
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--dim)", marginLeft: "auto" }}>
            scroll para zoom · drag para mover · clique no nó para detalhes
          </span>
        </div>

        {/* Graph canvas */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <DepsGraphClient nodes={nodes} edges={edges} />
        </div>
      </div>
    </FadeIn>
  );
}
