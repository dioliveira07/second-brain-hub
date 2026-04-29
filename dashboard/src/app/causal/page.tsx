import { cerebroFetch, CausalGraphData } from "@/lib/hub";
import { CausalGraphClient } from "@/components/CausalGraphClient";

export default async function CausalPage() {
  let data: CausalGraphData = { nodes: [], edges: [], totals: { nodes: 0, edges: 0, edges_total_db: 0 } };
  try {
    data = await cerebroFetch<CausalGraphData>("/causal/graph?limit=1000");
  } catch {}

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: "1rem",
      height: "calc(100vh - 4rem)", margin: "-2rem -2.5rem", padding: "2rem 2.5rem 0",
    }}>
      <div>
        <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Grafo Causal</div>
        <h1 style={{ fontFamily: "'Fira Code', monospace", color: "#06b6d4", fontSize: "1.4rem", margin: 0 }}>
          ◈ CAUSAL GRAPH — {data.totals.nodes} nodes · {data.totals.edges} edges
        </h1>
      </div>
      <CausalGraphClient initial={data} />
    </div>
  );
}
