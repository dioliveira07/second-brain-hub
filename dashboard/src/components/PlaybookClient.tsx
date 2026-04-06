"use client";
import { useState } from "react";

type SearchResult = {
  score: number;
  repo: string;
  file_path: string;
  language: string;
  semantic_role: string;
  symbol_name: string;
  snippet: string;
};

export function PlaybookClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 20 }),
      });
      const data = await res.json();
      setResults(data.results || []);
    } catch { setResults([]); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="O que você quer aprender? (ex: como funciona a autenticação)"
          className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600"
        />
        <button
          onClick={search}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white disabled:opacity-50"
        >
          {loading ? "..." : "Buscar"}
        </button>
      </div>

      <div className="space-y-3">
        {results.map((r, i) => (
          <div key={i} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <span className="text-blue-400 text-xs font-mono">{r.repo}</span>
                <span className="text-gray-500 text-xs"> / {r.file_path}</span>
                {r.symbol_name && <span className="ml-1 text-purple-400 text-xs">#{r.symbol_name}</span>}
              </div>
              <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full flex-shrink-0">
                {(r.score * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex gap-2 mb-2">
              <span className="text-xs bg-gray-800 text-gray-400 px-1.5 rounded">{r.language}</span>
              {r.semantic_role && <span className="text-xs bg-gray-800 text-gray-400 px-1.5 rounded">{r.semantic_role}</span>}
            </div>
            <pre className="text-xs text-gray-300 bg-gray-800 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">{r.snippet}</pre>
          </div>
        ))}
        {results.length === 0 && query && !loading && (
          <p className="text-gray-500 text-sm">Nenhum resultado encontrado.</p>
        )}
      </div>
    </div>
  );
}
