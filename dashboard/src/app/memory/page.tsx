import { cerebroFetch, Memory } from "@/lib/hub";
import { MemoryList } from "@/components/MemoryList";

export default async function MemoryPage() {
  let memories: Memory[] = [];
  try {
    memories = await cerebroFetch<Memory[]>("/memory?limit=100");
  } catch {}

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: 1100 }}>
      <div>
        <div className="label-accent" style={{ marginBottom: "0.5rem" }}>Memória Causal</div>
        <h1 style={{ fontFamily: "'Fira Code', monospace", color: "#06b6d4", fontSize: "1.4rem", margin: 0 }}>
          ◈ MEMORIES — {memories.length}
        </h1>
      </div>
      <MemoryList initial={memories} />
    </div>
  );
}
