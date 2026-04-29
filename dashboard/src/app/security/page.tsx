import { Suspense } from "react";
import { cerebroFetch } from "@/lib/hub";
import { FadeIn } from "@/components/reactbits/FadeIn";
import { SecurityClient } from "@/components/SecurityClient";

export type AuditEntry = {
  ts: string;
  mode: string;
  method: string;
  path: string;
  ip: string;
  key_present: boolean;
};

export type AuditLog = {
  entries: AuditEntry[];
  total: number;
  mode: "audit" | "enforce";
  hub_started_at: string;
};

export type MCPConn = {
  client_ip: string;
  real_ip: string | null;
  client_name: string | null;
  machine: string | null;
  connected_at: string;
  last_seen_at: string;
  minutos_atras: number;
  ativo: boolean;
  skills_pending: boolean;
  hb_version: string | null;
  hb_outdated: boolean;
};

export default async function SecurityPage() {
  const [auditLog, connections] = await Promise.all([
    cerebroFetch<AuditLog>("/security/audit-log?limit=200"),
    cerebroFetch<MCPConn[]>("/mcp/connections"),
  ]);

  return (
    <FadeIn>
      <Suspense fallback={<div style={{ color: "#8ab4cc", padding: 32 }}>Carregando...</div>}>
        <SecurityClient auditLog={auditLog} connections={connections} />
      </Suspense>
    </FadeIn>
  );
}
