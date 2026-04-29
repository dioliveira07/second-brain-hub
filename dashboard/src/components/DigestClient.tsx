"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GitCommit, Edit3, AlertTriangle, FolderGit2, Brain, Zap } from "lucide-react";
import type { DigestData, DigestDev } from "@/app/digest/page";

const C = {
  border:  "#1a2840",
  cyan:    "#06b6d4",
  green:   "#22c55e",
  yellow:  "#eab308",
  purple:  "#a855f7",
  orange:  "#f97316",
  red:     "#ef4444",
  text:    "#e2e8f0",
  muted:   "#8ab4cc",
  dim:     "#4a6a8a",
  card:    "rgba(15,30,55,0.7)",
};

function devColor(dev: string): string {
  const colors = [C.cyan, C.green, C.yellow, C.purple, C.orange, "#ec4899"];
  let hash = 0;
  for (const c of dev) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function Avatar({ name }: { name: string }) {
  const color = devColor(name);
  return (
    <div style={{
      width: 36, height: 36, borderRadius: "50%",
      background: `${color}22`, border: `1px solid ${color}66`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--mono)", fontSize: "0.75rem", fontWeight: 700,
      color, flexShrink: 0,
    }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function StatBadge({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  if (value === 0) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.35rem",
      background: `${color}10`, border: `1px solid ${color}30`,
      borderRadius: 6, padding: "0.3rem 0.6rem",
    }}>
      <span style={{ color }}>{icon}</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", fontWeight: 700, color }}>{value}</span>
      <span style={{ fontFamily: "var(--sans)", fontSize: "0.72rem", color: C.muted }}>{label}</span>
    </div>
  );
}

function DevCard({ dev }: { dev: DigestDev }) {
  const color = devColor(dev.dev);
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: "1.1rem 1.2rem",
      display: "flex", flexDirection: "column", gap: "0.75rem",
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Avatar name={dev.dev} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: "0.9rem", fontWeight: 700, color }}>{dev.dev}</div>
          <div style={{ fontFamily: "var(--sans)", fontSize: "0.75rem", color: C.muted, marginTop: 2 }}>
            {dev.projetos.length > 0 ? dev.projetos.join(", ") : "sem projetos"}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <StatBadge icon={<Brain size={11} />}      value={dev.sessoes} label="sessões"  color={C.cyan}   />
          <StatBadge icon={<Edit3 size={11} />}      value={dev.edits}   label="edições"  color={C.purple} />
          <StatBadge icon={<AlertTriangle size={11} />} value={dev.errors} label="erros" color={C.red}    />
        </div>
      </div>

      {dev.commits.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {dev.commits.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <GitCommit size={11} color={C.yellow} style={{ flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: C.yellow }}>
                {c.slice(0, 70)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DigestClient({ digest }: { digest: DigestData | null }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [router]);

  if (!digest) {
    return (
      <div style={{ textAlign: "center", padding: "4rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.85rem" }}>
        API indisponível ou nenhum dado para hoje.
      </div>
    );
  }

  if (digest.devs.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "4rem", color: C.dim, fontFamily: "var(--mono)", fontSize: "0.85rem" }}>
        Nenhuma atividade registrada hoje ({digest.data}).
        <br />
        <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>Dados aparecem conforme devs usam Claude Code nos projetos.</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header stats */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        {[
          { label: "Devs ativos hoje",  value: digest.devs.length,                                                           icon: <Brain size={14} />,      color: C.cyan   },
          { label: "Sessões registradas",value: digest.total_sessoes,                                                         icon: <FolderGit2 size={14} />, color: C.green  },
          { label: "Sinais totais",      value: digest.total_sinais,                                                          icon: <Zap size={14} />,        color: C.yellow },
          { label: "Commits únicos",     value: digest.devs.reduce((acc, d) => acc + d.commits.length, 0),                   icon: <GitCommit size={14} />,  color: C.purple },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{ flex: "1 1 160px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0.85rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ color, opacity: 0.8 }}>{icon}</div>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: "1.3rem", fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontFamily: "var(--sans)", fontSize: "0.72rem", color: C.muted, marginTop: 3 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Date badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <div style={{ flex: 1, height: 1, background: C.border }} />
        <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: C.dim, padding: "0 0.75rem" }}>
          {digest.data}
        </span>
        <div style={{ flex: 1, height: 1, background: C.border }} />
      </div>

      {/* Dev cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {digest.devs
          .sort((a, b) => (b.sessoes + b.commits.length) - (a.sessoes + a.commits.length))
          .map((dev, i) => <DevCard key={i} dev={dev} />)
        }
      </div>
    </div>
  );
}
