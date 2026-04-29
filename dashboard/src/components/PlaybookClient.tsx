"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Search, Loader2, FileCode, Sparkles, List, Filter } from "lucide-react";

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
      <span style={{ fontFamily: 'var(--mono)', fontSize: "0.72rem", color }}>
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
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.file_path}
            </span>
            {r.symbol_name && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: "0.72rem", color: 'var(--purple)' }}>
                #{r.symbol_name}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: "0.72rem",
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
                  fontSize: "0.72rem",
                  color: 'var(--muted-foreground)',
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
                fontSize: "0.72rem",
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
              fontSize: "0.72rem",
              color: 'var(--muted-foreground)',
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

type Mode = "search" | "ask";

export function PlaybookClient() {
  const [query,       setQuery]       = useState("");
  const [mode,        setMode]        = useState<Mode>("search");
  const [results,     setResults]     = useState<SearchResult[]>([]);
  const [answer,      setAnswer]      = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [searched,    setSearched]    = useState(false);
  const [allRepos,    setAllRepos]    = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");

  // Carrega lista de repos indexados
  useEffect(() => {
    fetch("/painel/api/live-status")
      .then(r => r.json())
      .then(d => {
        const names = (d.repos || [])
          .filter((r: { status: string }) => r.status === "done")
          .map((r: { repo: string }) => r.repo)
          .sort();
        setAllRepos(names);
      })
      .catch(() => {});
  }, []);

  const run = useCallback(async (currentMode: Mode) => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    setAnswer(null);
    setResults([]);
    try {
      const body: Record<string, unknown> = {
        query,
        limit: currentMode === "ask" ? 15 : 20,
        synthesize: currentMode === "ask",
      };
      if (selectedRepo) body.repos = [selectedRepo];
      const res  = await fetch("/painel/api/search", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      setResults(data.results || []);
      setAnswer(data.answer || null);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, selectedRepo]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") run(mode);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {(["search", "ask"] as Mode[]).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                fontFamily: 'var(--mono)', fontSize: '0.72rem', fontWeight: 600,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '5px 12px', borderRadius: '5px', border: 'none',
                cursor: 'pointer',
                background: active ? 'rgba(6,182,212,0.12)' : 'transparent',
                color: active ? 'var(--cyan)' : 'var(--muted-foreground)',
                transition: 'all 150ms',
              }}
            >
              {m === "search" ? <List size={12} /> : <Sparkles size={12} />}
              {m === "search" ? "Buscar" : "Perguntar"}
            </button>
          );
        })}
      </div>

      {/* Repo filter */}
      {allRepos.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={12} color="var(--muted-foreground)" />
          <select
            value={selectedRepo}
            onChange={e => setSelectedRepo(e.target.value)}
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: '5px',
              color: selectedRepo ? 'var(--text)' : 'var(--muted-foreground)',
              fontFamily: 'var(--mono)',
              fontSize: '0.75rem',
              padding: '4px 10px',
              cursor: 'pointer',
              maxWidth: 280,
            }}
          >
            <option value="">todos os repositórios</option>
            {allRepos.map(r => (
              <option key={r} value={r}>{r.replace('dioliveira07/', '')}</option>
            ))}
          </select>
          {selectedRepo && (
            <button
              onClick={() => setSelectedRepo("")}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontFamily: 'var(--mono)', fontSize: '0.72rem' }}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Search bar */}
      <div
        className="panel"
        style={{ padding: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}
      >
        <div style={{ flex: 1, position: 'relative' }}>
          {mode === "ask"
            ? <Sparkles size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--purple)' }} />
            : <Search    size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
          }
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={mode === "ask"
              ? "Faça uma pergunta sobre o código (ex: como funciona a autenticação?)"
              : "O que você quer encontrar? (ex: autenticação, webhook handler)"
            }
            className="cyber-input"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
        <button
          onClick={() => run(mode)}
          disabled={loading || !query.trim()}
          className="cyber-btn"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
            background: mode === "ask" ? 'var(--purple)' : 'var(--green)',
          }}
        >
          {loading
            ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            : mode === "ask" ? <Sparkles size={13} /> : <Search size={13} />
          }
          {loading ? (mode === "ask" ? "Perguntando..." : "Buscando") : (mode === "ask" ? "Perguntar" : "Buscar")}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <Loader2 size={24} color={mode === "ask" ? 'var(--purple)' : 'var(--cyan)'} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
              {mode === "ask" ? "Consultando o cérebro..." : "Consultando vetor semântico..."}
            </span>
          </div>
        </div>
      )}

      {/* Synthesized answer */}
      {!loading && answer && (
        <div
          className="panel"
          style={{ padding: '1.25rem', borderColor: 'rgba(167,139,250,0.25)', background: 'rgba(167,139,250,0.04)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.75rem' }}>
            <Sparkles size={13} color="var(--purple)" />
            <span style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--purple)' }}>
              Resposta
            </span>
          </div>
          <p style={{ fontFamily: 'var(--sans)', fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: 0 }}>
            {answer}
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="label-accent" style={{ fontSize: '0.75rem' }}>
              {answer ? "Fontes" : "Resultados"}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: "0.72rem", color: 'var(--muted-foreground)' }}>
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
          <p style={{ color: 'var(--muted-foreground)', fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>
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
