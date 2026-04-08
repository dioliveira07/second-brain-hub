import { hubFetch } from "@/lib/hub";
import { GraphClient, type APIGraphNode, type APIGraphEdge } from "@/components/GraphClient";
import { FadeIn } from "@/components/reactbits/FadeIn";

export default async function GraphPage() {
  let nodes: APIGraphNode[] = [];
  let edges: APIGraphEdge[] = [];

  try {
    const [nodesRes, edgesRes] = await Promise.all([
      hubFetch<{ nodes: APIGraphNode[]; total: number }>("/graph/nodes"),
      hubFetch<{ edges: APIGraphEdge[]; total: number }>("/graph/edges"),
    ]);
    nodes = nodesRes.nodes;
    edges = edgesRes.edges;
  } catch {}

  const repoCount = nodes.filter((n) => n.type === "repo").length;
  const techCount = nodes.filter((n) => n.type === "technology").length;

  return (
    <FadeIn from="bottom" duration={500}>
      <div
        style={{
          display:       "flex",
          flexDirection: "column",
          gap:           "1.25rem",
          height:        "calc(100vh - 4rem)",
        }}
      >
        {/* Header */}
        <FadeIn from="bottom" delay={60}>
          <div style={{ flexShrink: 0 }}>
            <div className="label-accent" style={{ marginBottom: "0.4rem" }}>
              Mapa Arquitetural
            </div>
            <div
              style={{
                display:        "flex",
                alignItems:     "flex-end",
                justifyContent: "space-between",
                gap:            "1rem",
                flexWrap:       "wrap",
              }}
            >
              <div>
                <h2
                  style={{
                    fontFamily:    "var(--mono)",
                    fontSize:      "1.6rem",
                    fontWeight:    700,
                    color:         "var(--text)",
                    letterSpacing: "-0.02em",
                    marginBottom:  "0.3rem",
                  }}
                >
                  Grafo de Dependências
                </h2>
                <p style={{ fontFamily: "var(--sans)", fontSize: "0.82rem", color: "var(--muted)" }}>
                  Hover para revelar nomes · Clique para detalhes · Arraste para reorganizar
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                {[
                  { label: `${repoCount} repos`,       color: "var(--cyan)"   },
                  { label: `${techCount} tecnologias`, color: "var(--purple)" },
                  { label: `${edges.length} conexões`, color: "var(--green)"  },
                ].map(({ label, color }, i) => (
                  <FadeIn key={label} from="bottom" delay={120 + i * 60}>
                    <span
                      style={{
                        fontFamily:    "var(--mono)",
                        fontSize:      "0.7rem",
                        color,
                        background:    `${color}11`,
                        border:        `1px solid ${color}33`,
                        borderRadius:  "var(--r)",
                        padding:       "0.25rem 0.7rem",
                        letterSpacing: "0.06em",
                        display:       "block",
                      }}
                    >
                      {label}
                    </span>
                  </FadeIn>
                ))}
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Canvas */}
        <FadeIn from="scale" delay={200} duration={600}>
          <div style={{ flex: 1, minHeight: 0, height: "calc(100vh - 10rem)" }}>
            <GraphClient nodes={nodes} edges={edges} />
          </div>
        </FadeIn>
      </div>
    </FadeIn>
  );
}
