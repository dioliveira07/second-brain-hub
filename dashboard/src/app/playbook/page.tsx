import { PlaybookClient } from "@/components/PlaybookClient";

export default function PlaybookPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 860 }}>
      <div>
        <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Busca Semântica</div>
        <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.6rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
          Playbook
        </h2>
        <p style={{ fontFamily: "var(--sans)", fontSize: "0.85rem", color: "var(--muted)" }}>
          Consulte o conhecimento indexado em linguagem natural
        </p>
      </div>
      <PlaybookClient />
    </div>
  );
}
