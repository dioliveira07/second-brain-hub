"use client";
import { useState, useMemo, useCallback } from "react";
import { Search, Loader2, Code, FileCode, Percent } from "lucide-react";

// Pretext: mede linhas de snippet sem DOM reflow
// Usado para truncar snippets a exatamente MAX_LINES antes de renderizar
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pretextMod: any = null;

if (typeof window !== "undefined") {
  import("@chenglou/pretext").then((mod) => {
    pretextMod = mod;
  }).catch(() => {/* pretext optional */});
}

const SNIPPET_FONT    = "13px 'Fira Code', monospace";
const SNIPPET_LH      = 20;  // line-height em px
const MAX_LINES       = 8;
const SNIPPET_WIDTH   = 640; // largura estimada do container

function truncateSnippet(snippet: string): { text: string; truncated: boolean } {
  // Fallback: corta por \n
  const linesFallback = snippet.split("\n");
  if (linesFallback.length <= MAX_LINES) return { text: snippet, truncated: false };

  if (!pretextMod) {
    return { text: linesFallback.slice(0, MAX_LINES).join("\n"), truncated: true };
  }

  try {
    const { prepare, layout } = pretextMod;
    const prepared = prepare(snippet, SNIPPET_FONT);
    const result   = layout(prepared, SNIPPET_WIDTH, SNIPPET_LH);
    if (result.lineCount <= MAX_LINES) return { text: snippet, truncated: false };

    // Binary search para encontrar quantos chars cabem em MAX_LINES
    let lo = 0, hi = snippet.length;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      const p   = prepare(snippet.slice(0, mid), SNIPPET_FONT);
      const r   = layout(p, SNIPPET_WIDTH, SNIPPET_LH);
      if (r.lineCount <= MAX_LINES) lo = mid; else hi = mid;
    }
    return { text: snippet.slice(0, lo), truncated: true };
  } catch {
    return { text: linesFallback.slice(0, MAX_LINES).join("\n"), truncated: true };
  }
}

type SearchResult = {
  score:         number;
  repo:          string;
  file_path:     string;
  language:      string;
  semantic_role: string;
  symbol_name:   string;
  snippet:       string;
};

const LANG_COLOR: Record<string, string> = {
  typescript: '#3178c6', javascript: '#f7df1e', python: '#3572a5',
  rust: '#dea584', go: '#00add8', default: 'var(--muted)',
};

function ScoreBar({ score }: { score: number }) {
  const pct   = Math.round(score * 100);
  const color = pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--cyan)' : 'var(--amber)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div
        style={{
          width: 40,
          height: 3,
          background: 'var(--border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color }}>
        {pct}%
      </span>
    </div>
  );
}

function ResultCard({ r }: { r: SearchResult }) {
  const [expanded, setExpanded] = useState(false);
  const { text, truncated } = useMemo(
    () => truncateSnippet(r.snippet),
    [r.snippet]
  );

  const langColor = LANG_COLOR[r.language?.toLowerCase()] || LANG_COLOR.default;

  return (
    <div className="panel" style={{ padding: '1rem 1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.6rem' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--cyan)' }}>
              {r.repo.replace('dioliveira07/', '')}
            </span>
            <span style={{ color: 'var(--dim)', fontSize: '0.7rem' }}>/</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.file_path}
            </span>
            {r.symbol_name && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--purple)' }}>
                #{r.symbol_name}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '0.6rem',
                color: langColor,
                background: `${langColor}18`,
                border: `1px solid ${langColor}33`,
                borderRadius: '3px',
                padding: '1px 6px',
              }}
            >
              {r.language}
            </span>
            {r.semantic_role && (
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '0.6rem',
                  color: 'var(--muted)',
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '3px',
                  padding: '1px 6px',
                }}
              >
                {r.semantic_role}
              </span>
            )}
          </div>
        </div>

        <ScoreBar score={r.score} />
      </div>

      {/* Snippet */}
      <div style={{ position: 'relative' }}>
        <pre
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '0.78rem',
            lineHeight: `${SNIPPET_LH}px`,
            color: 'var(--text)',
            background: 'var(--bg-void)',
            border: '1px solid var(--border)',
            borderRadius: '5px',
            padding: '0.75rem',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            margin: 0,
          }}
        >
          {expanded ? r.snippet : text}
        </pre>
        {truncated && !expanded && (
          <div
            style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: 40,
              background: 'linear-gradient(transparent, var(--bg-void))',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingBottom: '4px',
            }}
          >
            <button
              onClick={() => setExpanded(true)}
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '0.65rem',
                color: 'var(--cyan)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
                letterSpacing: '0.06em',
              }}
            >
              [ mostrar mais ]
            </button>
          </div>
        )}
        {expanded && truncated && (
          <button
            onClick={() => setExpanded(false)}
            style={{
              display: 'block',
              width: '100%',
              fontFamily: 'var(--mono)',
              fontSize: '0.65rem',
              color: 'var(--muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              marginTop: '4px',
              letterSpacing: '0.06em',
            }}
          >
            [ recolher ]
          </button>
        )}
      </div>
    </div>
  );
}

export function PlaybookClient() {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res  = await fetch("/api/search", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query, limit: 20 }),
      });
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Search bar */}
      <div
        className="panel"
        style={{ padding: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}
      >
        <div style={{ flex: 1, position: 'relative' }}>
          <Search
            size={14}
            style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="O que você quer aprender? (ex: como funciona a autenticação)"
            className="cyber-input"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          className="cyber-btn"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
        >
          {loading
            ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            : <Search size={13} />
          }
          {loading ? "Buscando" : "Buscar"}
        </button>
      </div>

      {/* Results */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <Loader2 size={24} color="var(--cyan)" style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: 'var(--muted)' }}>
              Consultando vetor semântico...
            </span>
          </div>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="label-accent" style={{ fontSize: '0.75rem' }}>
              Resultados
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--muted)' }}>
              {results.length} encontrados
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {results.map((r, i) => <ResultCard key={i} r={r} />)}
          </div>
        </>
      )}

      {!loading && searched && results.length === 0 && (
        <div
          className="panel"
          style={{ padding: '2rem', textAlign: 'center' }}
        >
          <FileCode size={28} color="var(--dim)" style={{ margin: '0 auto 0.75rem' }} />
          <p style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>
            Nenhum resultado encontrado para &quot;{query}&quot;
          </p>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
