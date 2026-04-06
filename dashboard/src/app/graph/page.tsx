import { GraphPageClient } from "@/components/GraphPageClient";
import { hubFetch, GraphNode, GraphEdge } from "@/lib/hub";

export default async function GraphPage() {
  let nodes: GraphNode[] = [];
  let edges: GraphEdge[] = [];

  try {
    const [nodesData, edgesData] = await Promise.all([
      hubFetch<{ nodes: GraphNode[] }>("/graph/nodes"),
      hubFetch<{ edges: GraphEdge[] }>("/graph/edges"),
    ]);
    nodes = nodesData.nodes;
    edges = edgesData.edges;
  } catch {}

  return <GraphPageClient initialNodes={nodes} initialEdges={edges} />;
}
