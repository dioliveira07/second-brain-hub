"use client";
import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import type { GraphNode, GraphEdge } from "@/lib/hub";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false }) as any;

type Props = { initialNodes: GraphNode[]; initialEdges: GraphEdge[] };

export function GraphPageClient({ initialNodes, initialEdges }: Props) {
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [search, setSearch] = useState("");

  const graphData = {
    nodes: initialNodes.map((n) => ({
      ...n,
      name: n.label,
      val: n.size,
      color: search && n.label.toLowerCase().includes(search.toLowerCase())
        ? "#facc15"
        : n.color,
    })),
    links: initialEdges.map((e) => ({ source: e.source, target: e.target })),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeClick = useCallback((node: any) => {
    setSelected(node as GraphNode);
  }, []);

  return (
    <div className="flex h-full gap-4 -m-6 overflow-hidden">
      <div className="flex-1 bg-gray-950 relative">
        <div className="absolute top-4 left-4 z-10">
          <input
            type="text"
            placeholder="Buscar nó..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 w-60"
          />
        </div>
        <ForceGraph2D
          graphData={graphData}
          backgroundColor="#030712"
          nodeLabel="name"
          nodeColor={(n: Record<string, unknown>) => String(n.color || "#3b82f6")}
          nodeVal={(n: Record<string, unknown>) => Number(n.val || 5)}
          linkColor={() => "#374151"}
          onNodeClick={handleNodeClick}
          width={typeof window !== "undefined" ? window.innerWidth - (selected ? 400 : 0) - 16 : 800}
          height={typeof window !== "undefined" ? window.innerHeight - 32 : 600}
        />
      </div>
      {selected && (
        <div className="w-80 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto flex-shrink-0">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-semibold text-white text-sm">{selected.label}</h3>
            <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex gap-2">
              <span className="text-gray-400">Tipo:</span>
              <span className={`px-2 py-0.5 rounded-full text-white ${selected.type === "repo" ? "bg-blue-800" : selected.type === "technology" ? "bg-green-800" : "bg-orange-800"}`}>
                {selected.type}
              </span>
            </div>
            {Object.entries(selected.data || {}).map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5">
                <span className="text-gray-400 capitalize">{k.replace(/_/g, " ")}:</span>
                <span className="text-gray-200 break-words">{typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
