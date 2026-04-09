import { cerebroFetch } from "@/lib/hub";
import { FadeIn } from "@/components/reactbits/FadeIn";
import { CerebroClient } from "@/components/CerebroClient";

export type Sessao = {
  dev: string;
  projeto: string;
  branch: string;
  arquivos: string[];
  ultimo_commit: string;
  minutos_atras: number;
  timestamp: string;
};

export type AfinidadeItem = {
  dev: string;
  projeto: string;
  score: number;
};

export default async function CerebroPage() {
  let sessoes: Sessao[] = [];
  let afinidade: AfinidadeItem[] = [];

  try {
    sessoes = await cerebroFetch<Sessao[]>("/sessoes?limit=50");
  } catch {}

  try {
    const af = await cerebroFetch<{ tabela: AfinidadeItem[] }>("/afinidade?dias=30");
    afinidade = af.tabela ?? [];
  } catch {}

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 1100 }}>
      <FadeIn delay={0}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div className="label-accent" style={{ marginBottom: "0.2rem" }}>Contexto</div>
          <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.6rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
            Cérebro
          </h2>
          <p style={{ fontFamily: "var(--sans)", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            Sessões ativas, afinidade de devs e contexto entre equipes
          </p>
        </div>
      </FadeIn>

      <CerebroClient sessoes={sessoes} afinidade={afinidade} />
    </div>
  );
}
