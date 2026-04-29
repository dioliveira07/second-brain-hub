import { cerebroFetch } from "@/lib/hub";
import { FadeIn } from "@/components/reactbits/FadeIn";
import { DigestClient } from "@/components/DigestClient";

export type DigestDev = {
  dev: string;
  projetos: string[];
  commits: string[];
  sessoes: number;
  edits: number;
  errors: number;
};

export type DigestData = {
  data: string;
  total_sessoes: number;
  total_sinais: number;
  devs: DigestDev[];
};

export default async function DigestPage() {
  let digest: DigestData | null = null;

  try {
    digest = await cerebroFetch<DigestData>("/digest/hoje");
  } catch {}

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 900 }}>
      <FadeIn delay={0}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div className="label-accent" style={{ marginBottom: "0.2rem" }}>Resumo</div>
          <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.6rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
            Digest
          </h2>
          <p style={{ fontFamily: "var(--sans)", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            Atividade da equipe hoje — sessões, commits e sinais por dev
          </p>
        </div>
      </FadeIn>

      <DigestClient digest={digest} />
    </div>
  );
}
