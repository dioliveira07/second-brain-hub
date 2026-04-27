"use client";
import { useState, useEffect, useRef } from "react";
import { Shield, ShieldAlert, ShieldCheck, Wifi, WifiOff, RefreshCw } from "lucide-react";
import type { AuditLog, AuditEntry, MCPConn } from "@/app/security/page";

const C = {
  bg:     "rgba(10,22,40,0.6)",
  border: "#1a2840",
  cyan:   "#06b6d4",
  green:  "#22c55e",
  yellow: "#eab308",
  red:    "#ef4444",
  text:   "#e2e8f0",
  muted:  "#8ab4cc",
  dim:    "#4a6a8a",
  card:   "rgba(15,30,55,0.7)",
};

function timeAgoFromIso(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}min atrás`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function SecurityClient({
  auditLog: initial,
  connections: initialConns,
}: {
  auditLog: AuditLog;
  connections: MCPConn[];
}) {
  const [log, setLog] = useState<AuditLog>(initial);
  const [conns, setConns] = useState<MCPConn[]>(initialConns);
  const [filterIp, setFilterIp] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    try {
      const base = "/painel/api/cerebro-proxy";
      const [l, c] = await Promise.all([
        fetch(`${base}?path=${encodeURIComponent("/security/audit-log?limit=200")}`).then(r => r.json()),
        fetch(`${base}?path=/mcp/connections`).then(r => r.json()),
      ]);
      setLog(l);
      setConns(c);
    } catch {}
  };

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(refresh, 5000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh]);

  const filtered = filterIp
    ? log.entries.filter(e => e.ip.includes(filterIp))
    : log.entries;

  const uniqueIps = [...new Set(log.entries.map(e => e.ip))];
  const withKey = conns.filter(c => {
    const hits = log.entries.filter(e => e.ip === c.client_ip);
    return hits.length === 0 || hits.some(e => e.key_present);
  });

  const isEnforce = log.mode === "enforce";

  return (
    <div style={{ padding: "24px 32px", color: C.text, fontFamily: "monospace" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Shield size={24} color={isEnforce ? C.green : C.yellow} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Segurança — Auth Monitor</h1>
        <span style={{
          marginLeft: 8, padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
          background: isEnforce ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)",
          color: isEnforce ? C.green : C.yellow,
          border: `1px solid ${isEnforce ? C.green : C.yellow}`,
        }}>
          {isEnforce ? "ENFORCE" : "AUDIT"}
        </span>
        <button
          onClick={() => setAutoRefresh(a => !a)}
          style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: autoRefresh ? "rgba(6,182,212,0.1)" : "transparent",
            color: autoRefresh ? C.cyan : C.muted, cursor: "pointer", fontSize: 12,
          }}
        >
          <RefreshCw size={12} />
          {autoRefresh ? "Auto (5s)" : "Pausado"}
        </button>
        <button onClick={refresh} style={{
          padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
          background: "transparent", color: C.muted, cursor: "pointer", fontSize: 12,
        }}>
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Sem chave (log)", value: log.entries.filter(e => !e.key_present).length, color: C.red },
          { label: "Com chave", value: log.entries.filter(e => e.key_present).length, color: C.green },
          { label: "IPs únicos", value: uniqueIps.length, color: C.cyan },
          { label: "Máquinas", value: conns.length, color: C.muted },
        ].map(s => (
          <div key={s.label} style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px",
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
        {/* Audit log */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <ShieldAlert size={16} color={C.yellow} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Audit Log</span>
            <span style={{ fontSize: 12, color: C.dim }}>{log.total} total (últimas 200)</span>
            <input
              placeholder="Filtrar por IP..."
              value={filterIp}
              onChange={e => setFilterIp(e.target.value)}
              style={{
                marginLeft: "auto", padding: "3px 10px", borderRadius: 6,
                border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.3)",
                color: C.text, fontSize: 12, outline: "none", width: 160,
              }}
            />
          </div>
          <div style={{ overflowY: "auto", maxHeight: 480 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 24, color: C.dim, textAlign: "center", fontSize: 13 }}>
                Nenhuma entrada sem chave — tudo autenticado ✓
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "rgba(0,0,0,0.2)" }}>
                    {["Hora", "IP", "Método", "Path", "Chave"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: C.dim, fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => (
                    <tr key={i} style={{
                      borderTop: `1px solid ${C.border}`,
                      background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.1)",
                    }}>
                      <td style={{ padding: "6px 12px", color: C.dim }}>{fmtTime(e.ts)}</td>
                      <td style={{ padding: "6px 12px", color: C.cyan }}>{e.ip}</td>
                      <td style={{ padding: "6px 12px", color: C.muted }}>{e.method}</td>
                      <td style={{ padding: "6px 12px", color: C.text, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.path}</td>
                      <td style={{ padding: "6px 12px" }}>
                        {e.key_present
                          ? <span style={{ color: C.green }}>✓</span>
                          : <span style={{ color: C.red }}>✗</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Conexões MCP */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
            <Wifi size={16} color={C.cyan} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Máquinas Registradas</span>
          </div>
          <div style={{ overflowY: "auto", maxHeight: 480 }}>
            {conns.map((c, i) => {
              // Só tem dados reais se a máquina conectou APÓS o restart do hub
              const seenAfterRestart = new Date(c.last_seen_at) > new Date((log as any).hub_started_at);
              const ips = [c.client_ip, c.real_ip].filter(Boolean);
              const hasUnauth = log.entries.some(e => ips.includes(e.ip) && !e.key_present);
              const hasAuth   = log.entries.some(e => ips.includes(e.ip) && e.key_present);

              let statusEl;
              if (!seenAfterRestart) {
                statusEl = <span style={{ color: C.dim }}>sem dados</span>;
              } else if (hasUnauth) {
                statusEl = <span style={{ color: C.red }}>⚠ sem chave</span>;
              } else if (hasAuth) {
                statusEl = <span style={{ color: C.green }}>✓ autenticada</span>;
              } else {
                statusEl = <span style={{ color: C.cyan }}>✓ rede interna</span>;
              }
              return (
                <div key={i} style={{
                  padding: "12px 16px",
                  borderTop: i > 0 ? `1px solid ${C.border}` : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {c.ativo
                      ? <Wifi size={13} color={C.green} />
                      : <WifiOff size={13} color={C.dim} />}
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{c.machine || c.client_name || c.client_ip}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11 }}>
                      {statusEl}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>
                    {c.client_ip} · {timeAgoFromIso(c.last_seen_at)}
                    {c.hb_version && (
                      <span style={{ marginLeft: 8, color: (c as any).hb_outdated ? C.red : C.dim }}>
                        · HB {c.hb_version}{(c as any).hb_outdated ? " ⚠ desatualizado" : ""}
                      </span>
                    )}
                    {!c.hb_version && seenAfterRestart && (
                      <span style={{ marginLeft: 8, color: C.red }}>· HB versão desconhecida</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
