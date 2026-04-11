import { DepsGraphClient } from "@/components/DepsGraphClient";
import { FadeIn } from "@/components/reactbits/FadeIn";
import { GitBranch, Zap, Info } from "lucide-react";

export default function DepsGraphPage() {
  return (
    <FadeIn from="bottom" duration={500}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", height: "calc(100vh - 4rem)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", flexShrink: 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <GitBranch size={13} color="var(--cyan)" />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Simulação — Grafo de Dependências
              </span>
            </div>
            <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.4rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", margin: 0 }}>
              File Dependency Graph
            </h2>
            <p style={{ fontFamily: "var(--sans)", fontSize: "0.78rem", color: "var(--muted-foreground)", margin: "0.3rem 0 0" }}>
              Visualização de imports entre arquivos — <span style={{ color: "var(--cyan)" }}>cotacao-inteligente-crm</span>
            </p>
          </div>

          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          "0.5rem",
            background:   "rgba(251,191,36,0.06)",
            border:       "1px solid rgba(251,191,36,0.2)",
            borderRadius: "var(--r)",
            padding:      "0.5rem 0.85rem",
            flexShrink:   0,
          }}>
            <Zap size={11} color="#fbbf24" />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "#fbbf24" }}>
              simulação — dados reais em breve
            </span>
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
            { label: "pages",      color: "#06b6d4" },
            { label: "components", color: "#a78bfa" },
            { label: "hooks",      color: "#22c55e" },
            { label: "lib",        color: "#fbbf24" },
            { label: "utils",      color: "#f97316" },
            { label: "backend",    color: "#f87171" },
            { label: "operator",   color: "#fb923c" },
            { label: "core",       color: "#e2e8f0" },
            { label: "orphan",     color: "#334155" },
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
          <DepsGraphClient />
        </div>
      </div>
    </FadeIn>
  );
}
