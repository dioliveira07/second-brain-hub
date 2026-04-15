"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { FileTree, type TreeNode } from "@/components/FileTree";
import { MarkdownSummary } from "@/components/MarkdownSummary";
import {
  X, Loader2, FileX, ChevronLeft, ChevronRight,
  PanelLeftClose, PanelLeftOpen, Copy, Check, BookOpen, Code2,
} from "lucide-react";
import Link from "next/link";

/* ─── Types ──────────────────────────────────────── */
type OpenFile = {
  path:      string;
  language:  string;
  size:      number;
  html:      string;
  lines:     number;
  truncated?: boolean;
  content?:  string; // markdown ou data URL de imagem
};

type TabState = {
  path:    string;
  loading: boolean;
  error?:  string;
  file?:   OpenFile;
};

/* ─── Helpers ─────────────────────────────────────── */
function basename(path: string) {
  return path.split("/").pop() ?? path;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const LANG_COLORS: Record<string, string> = {
  typescript: "#06b6d4", javascript: "#fbbf24", python: "#22c55e",
  go: "#06b6d4", rust: "#f97316", java: "#f97316", php: "#a78bfa",
  css: "#a78bfa", scss: "#a78bfa", html: "#f87171",
  json: "#fbbf24", yaml: "#fbbf24", toml: "#fbbf24",
  markdown: "#a78bfa", sql: "#fbbf24", bash: "#22c55e",
  dockerfile: "#06b6d4", text: "#5a7a9a",
};

/* ─── Image Viewer ───────────────────────────────── */
function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom]       = useState(1);
  const [offset, setOffset]   = useState({ x: 0, y: 0 });
  const [dragging, setDrag]   = useState(false);
  const dragStart             = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const MIN = 0.2, MAX = 8;
  const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.12 : 0.88)));
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setDrag(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return;
    setOffset({ x: dragStart.current.ox + e.clientX - dragStart.current.x, y: dragStart.current.oy + e.clientY - dragStart.current.y });
  };
  const stopDrag = () => { setDrag(false); dragStart.current = null; };

  // Reset ao trocar imagem
  useEffect(() => { setZoom(1); setOffset({ x: 0, y: 0 }); }, [src]);

  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden", background: "#0d0d0d", userSelect: "none" }}
      onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={stopDrag} onMouseLeave={stopDrag}
    >
      {/* Toolbar */}
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 10, display: "flex", gap: 6 }}>
        {[
          { label: "−", fn: () => setZoom((z) => clamp(z * 0.75)) },
          { label: `${Math.round(zoom * 100)}%`, fn: () => { setZoom(1); setOffset({ x: 0, y: 0 }); } },
          { label: "+", fn: () => setZoom((z) => clamp(z * 1.33)) },
          { label: "⤢",  fn: () => setZoom(MAX) },
        ].map(({ label, fn }) => (
          <button key={label} onClick={fn} style={{
            background: "#1a1a1a", border: "1px solid #333", color: "#ccc",
            borderRadius: 4, padding: "3px 9px", fontSize: "0.75rem",
            cursor: "pointer", fontFamily: "var(--mono)",
          }}>{label}</button>
        ))}
      </div>

      {/* Imagem */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src} alt={alt}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: "center",
            transition: dragging ? "none" : "transform 0.1s ease",
            maxWidth: zoom <= 1 ? "100%" : "none",
            maxHeight: zoom <= 1 ? "100%" : "none",
            cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "default",
            borderRadius: 4,
          }}
        />
      </div>

      {/* Hint */}
      {zoom === 1 && (
        <span style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
          fontFamily: "var(--mono)", fontSize: "0.6rem", color: "#444", pointerEvents: "none" }}>
          scroll para zoom · clique no % para resetar
        </span>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────── */
export function ExploreClient({
  owner, repo, root,
}: {
  owner: string;
  repo:  string;
  root:  TreeNode;
}) {
  const [tabs, setTabs]         = useState<TabState[]>([]);
  const [activeTab, setActive]  = useState<string | null>(null);
  const [sidebarOpen, setSide]  = useState(true);
  const [copied, setCopied]     = useState(false);
  const [mdRendered, setMdRend] = useState(true); // markdown toggle: rendered vs raw
  const codeRef = useRef<HTMLDivElement>(null);

  /* Fetch file content */
  const openFile = useCallback(async (path: string) => {
    // Se já está aberta, só ativar
    setTabs((prev) => {
      const exists = prev.find((t) => t.path === path);
      if (exists) return prev;
      return [...prev, { path, loading: true }];
    });
    setActive(path);

    // Buscar conteúdo
    try {
      const res = await fetch(
        `/painel/api/hub/file?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro desconhecido");
      setTabs((prev) =>
        prev.map((t) =>
          t.path === path
            ? { path, loading: false, file: data }
            : t
        )
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTabs((prev) =>
        prev.map((t) =>
          t.path === path ? { path, loading: false, error: msg } : t
        )
      );
    }
  }, [owner, repo]);

  /* Close tab */
  const closeTab = useCallback((path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs((prev) => {
      const idx  = prev.findIndex((t) => t.path === path);
      const next = prev.filter((t) => t.path !== path);
      if (activeTab === path) {
        const fallback = next[Math.min(idx, next.length - 1)]?.path ?? null;
        setActive(fallback);
      }
      return next;
    });
  }, [activeTab]);

  /* Scroll tabs on wheel */
  const tabBarRef = useRef<HTMLDivElement>(null);
  const onTabWheel = (e: React.WheelEvent) => {
    if (tabBarRef.current) tabBarRef.current.scrollLeft += e.deltaY;
  };

  /* Copy code */
  const copyCode = () => {
    const active = tabs.find((t) => t.path === activeTab);
    if (!active?.file) return;
    const text = codeRef.current?.querySelector("pre")?.textContent ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const activeFile = tabs.find((t) => t.path === activeTab);

  return (
    <div style={{
      position:      "fixed",
      inset:         0,
      zIndex:        50,
      display:       "flex",
      flexDirection: "column",
      background:    "var(--bg-void)",
      overflow:      "hidden",
    }}>

      {/* ── Top bar ─────────────────────────────── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        gap:            "0.75rem",
        padding:        "0 1rem",
        height:         40,
        background:     "var(--bg-deep)",
        borderBottom:   "1px solid var(--border)",
        flexShrink:     0,
      }}>
        <Link
          href={`/repos/${owner}/${repo}`}
          style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--muted-foreground)", textDecoration: "none" }}
        >
          <ChevronLeft size={14} color="var(--dim)" />
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
            voltar
          </span>
        </Link>

        <span style={{ color: "var(--border)", fontSize: "0.8rem" }}>|</span>

        <span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: "var(--muted-foreground)", letterSpacing: "-0.01em" }}>
          <span style={{ color: "var(--dim)" }}>{owner} / </span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{repo}</span>
        </span>

        <div style={{ flex: 1 }} />

        {/* Sidebar toggle */}
        <button
          onClick={() => setSide((v) => !v)}
          title={sidebarOpen ? "Fechar painel" : "Abrir painel"}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--dim)", padding: "4px", borderRadius: "4px",
            display: "flex", alignItems: "center",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--dim)"; }}
        >
          {sidebarOpen
            ? <PanelLeftClose size={15} />
            : <PanelLeftOpen  size={15} />}
        </button>
      </div>

      {/* ── Body ─────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Sidebar ─────────────────────────── */}
        <div style={{
          width:          sidebarOpen ? 280 : 0,
          minWidth:       sidebarOpen ? 280 : 0,
          overflow:       "hidden",
          transition:     "width 0.2s ease, min-width 0.2s ease",
          background:     "var(--bg-deep)",
          borderRight:    "1px solid var(--border)",
          display:        "flex",
          flexDirection:  "column",
          flexShrink:     0,
        }}>
          {/* Sidebar header */}
          <div style={{
            padding:      "0.6rem 1rem",
            borderBottom: "1px solid var(--border-dim)",
            flexShrink:   0,
          }}>
            <span style={{
              fontFamily:    "var(--mono)",
              fontSize:      "0.65rem",
              color:         "var(--dim)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}>
              Explorer
            </span>
          </div>

          {/* File tree */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0.35rem 0.5rem 1rem" }}>
            <FileTreeClickable root={root} onFileClick={openFile} activeFile={activeTab} />
          </div>
        </div>

        {/* ── Editor area ─────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* Tab bar */}
          {tabs.length > 0 && (
            <div
              ref={tabBarRef}
              onWheel={onTabWheel}
              style={{
                display:        "flex",
                alignItems:     "stretch",
                background:     "var(--bg-deep)",
                borderBottom:   "1px solid var(--border)",
                overflowX:      "auto",
                overflowY:      "hidden",
                flexShrink:     0,
                scrollbarWidth: "none",
                height:         36,
              }}
            >
              {tabs.map((tab) => {
                const isActive = tab.path === activeTab;
                const lang     = tab.file?.language ?? "";
                const color    = LANG_COLORS[lang] ?? "#5a7a9a";
                return (
                  <div
                    key={tab.path}
                    onClick={() => setActive(tab.path)}
                    title={tab.path}
                    style={{
                      display:     "flex",
                      alignItems:  "center",
                      gap:         "0.4rem",
                      padding:     "0 0.85rem 0 0.75rem",
                      cursor:      "pointer",
                      borderRight: "1px solid var(--border-dim)",
                      borderBottom: isActive ? "2px solid var(--cyan)" : "2px solid transparent",
                      background:  isActive ? "var(--bg-panel)" : "transparent",
                      flexShrink:  0,
                      maxWidth:    200,
                      transition:  "background 0.1s",
                      whiteSpace:  "nowrap",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    }}
                  >
                    {/* language dot */}
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: tab.loading ? "var(--dim)" : (tab.error ? "var(--red)" : color),
                      flexShrink: 0,
                    }} />

                    {/* filename */}
                    <span style={{
                      fontFamily:   "var(--mono)",
                      fontSize:     "0.75rem",
                      color:        isActive ? "var(--text)" : "var(--muted-foreground)",
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                      flex:         1,
                      minWidth:     0,
                    }}>
                      {basename(tab.path)}
                    </span>

                    {/* close button */}
                    <button
                      onClick={(e) => closeTab(tab.path, e)}
                      style={{
                        background:   "none",
                        border:       "none",
                        cursor:       "pointer",
                        color:        "var(--dim)",
                        padding:      "1px",
                        borderRadius: "3px",
                        display:      "flex",
                        alignItems:   "center",
                        flexShrink:   0,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--dim)"; }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Code area */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

            {/* Empty state */}
            {tabs.length === 0 && (
              <div style={{
                flex:           1,
                display:        "flex",
                flexDirection:  "column",
                alignItems:     "center",
                justifyContent: "center",
                gap:            "1rem",
                opacity:        0.4,
              }}>
                <ChevronRight size={32} color="var(--dim)" />
                <span style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", color: "var(--dim)" }}>
                  Selecione um arquivo
                </span>
              </div>
            )}

            {/* Active file content */}
            {activeFile && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

                {/* File breadcrumb bar */}
                <div style={{
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "space-between",
                  padding:      "0 1rem",
                  height:       32,
                  background:   "var(--bg-panel)",
                  borderBottom: "1px solid var(--border-dim)",
                  flexShrink:   0,
                  gap:          "0.5rem",
                }}>
                  <span style={{
                    fontFamily:   "var(--mono)",
                    fontSize:     "0.7rem",
                    color:        "var(--muted-foreground)",
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace:   "nowrap",
                  }}>
                    {activeFile.path.split("/").map((seg, i, arr) => (
                      <span key={i}>
                        {i > 0 && <span style={{ color: "var(--dim)", margin: "0 3px" }}>/</span>}
                        <span style={{ color: i === arr.length - 1 ? "var(--text)" : "var(--muted-foreground)" }}>
                          {seg}
                        </span>
                      </span>
                    ))}
                  </span>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                    {activeFile.file && (
                      <>
                        <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--dim)" }}>
                          {activeFile.file.lines} linhas · {formatSize(activeFile.file.size)}
                        </span>
                        <span style={{
                          fontFamily:   "var(--mono)", fontSize: "0.65rem",
                          color:        LANG_COLORS[activeFile.file.language] ?? "var(--dim)",
                          background:   `${LANG_COLORS[activeFile.file.language] ?? "#5a7a9a"}14`,
                          border:       `1px solid ${LANG_COLORS[activeFile.file.language] ?? "#5a7a9a"}30`,
                          borderRadius: "3px", padding: "1px 6px",
                          textTransform: "uppercase",
                        }}>
                          {activeFile.file.language}
                        </span>

                        {/* Aviso de truncado */}
                        {activeFile.file.truncated && (
                          <span style={{
                            fontFamily: "var(--mono)", fontSize: "0.65rem",
                            color: "#f59e0b", background: "#f59e0b14",
                            border: "1px solid #f59e0b30",
                            borderRadius: "3px", padding: "1px 6px",
                          }}>
                            truncado (2000 linhas)
                          </span>
                        )}

                        {/* Markdown toggle */}
                        {activeFile.file.language === "markdown" && activeFile.file.content && (
                          <button
                            onClick={() => setMdRend((v) => !v)}
                            title={mdRendered ? "Ver raw" : "Ver renderizado"}
                            style={{
                              display: "flex", alignItems: "center", gap: "4px",
                              background: mdRendered ? "rgba(167,139,250,0.1)" : "none",
                              border: `1px solid ${mdRendered ? "rgba(167,139,250,0.3)" : "var(--border-dim)"}`,
                              borderRadius: "4px", cursor: "pointer",
                              color: mdRendered ? "var(--purple, #a78bfa)" : "var(--dim)",
                              padding: "2px 7px", fontSize: "0.65rem",
                              fontFamily: "var(--mono)", transition: "all 0.15s",
                            }}
                          >
                            {mdRendered ? <BookOpen size={11} /> : <Code2 size={11} />}
                            {mdRendered ? "rendered" : "raw"}
                          </button>
                        )}
                      </>
                    )}
                    <button
                      onClick={copyCode}
                      title="Copiar código"
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: copied ? "var(--green)" : "var(--dim)",
                        padding: "3px", borderRadius: "4px", display: "flex", alignItems: "center",
                        transition: "color 0.15s",
                      }}
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>

                {/* Code content */}
                <div style={{ flex: 1, overflow: "auto" }}>

                  {/* Loading */}
                  {activeFile.loading && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: "0.5rem" }}>
                      <Loader2 size={16} color="var(--cyan)" style={{ animation: "spin 1s linear infinite" }} />
                      <span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: "var(--dim)" }}>
                        carregando...
                      </span>
                    </div>
                  )}

                  {/* Error */}
                  {activeFile.error && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "0.75rem" }}>
                      <FileX size={28} color="var(--red)" style={{ opacity: 0.6 }} />
                      <span style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: "var(--red)", opacity: 0.8 }}>
                        {activeFile.error}
                      </span>
                    </div>
                  )}

                  {/* File content */}
                  {activeFile.file && (
                    activeFile.file.language === "image" && activeFile.file.content
                      ? <ImageViewer src={activeFile.file.content} alt={activeFile.file.path} />
                      : activeFile.file.language === "markdown" && activeFile.file.content && mdRendered
                      ? (
                        <div style={{ padding: "1.5rem 2rem", maxWidth: 860 }}>
                          <MarkdownSummary content={activeFile.file.content} />
                        </div>
                      ) : (
                        <div
                          ref={codeRef}
                          className="shiki-wrapper"
                          dangerouslySetInnerHTML={{ __html: activeFile.file.html }}
                        />
                      )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .shiki-wrapper { height: 100%; }
        .shiki-wrapper pre {
          margin: 0;
          padding: 1.25rem 0;
          min-height: 100%;
          background: var(--bg-void) !important;
          font-family: var(--mono);
          font-size: 0.82rem;
          line-height: 1.65;
          counter-reset: line;
          tab-size: 2;
        }
        .shiki-wrapper pre code {
          display: block;
          width: fit-content;
          min-width: 100%;
        }
        .shiki-wrapper pre .line {
          display: inline-block;
          width: 100%;
          padding: 0 1.5rem 0 0;
          min-height: 1.65em;
        }
        .shiki-wrapper pre .line::before {
          counter-increment: line;
          content: counter(line);
          display: inline-block;
          width: 3rem;
          padding-right: 1.5rem;
          text-align: right;
          color: #3d5a7a;
          user-select: none;
          font-size: 0.78rem;
        }
        .shiki-wrapper pre .line:hover {
          background: rgba(255,255,255,0.025);
        }
        .shiki-wrapper pre .line:hover::before {
          color: #6a8fa8;
        }
      `}</style>
    </div>
  );
}

/* ─── FileTree adaptado para IDE (sem search/stats) ── */
function FileTreeClickable({
  root, onFileClick, activeFile,
}: {
  root:        TreeNode;
  onFileClick: (path: string) => void;
  activeFile:  string | null;
}) {
  return (
    <div>
      {(root.children ?? []).map((child, i) => (
        <ClickableNode
          key={child.path}
          node={child}
          depth={0}
          isLast={i === (root.children?.length ?? 0) - 1}
          lineStack={[]}
          onFileClick={onFileClick}
          activeFile={activeFile}
        />
      ))}
    </div>
  );
}

const LANG_COLORS2: Record<string, string> = {
  typescript: "#06b6d4", javascript: "#fbbf24", python: "#22c55e",
  json: "#fbbf24", yaml: "#fbbf24", toml: "#fbbf24",
  markdown: "#a78bfa", html: "#f87171", css: "#a78bfa", scss: "#a78bfa",
  rust: "#f97316", go: "#06b6d4", java: "#f97316", php: "#a78bfa",
  sql: "#fbbf24", shell: "#22c55e", dockerfile: "#06b6d4", text: "#5a7a9a",
};

const LANG_ICONS: Record<string, string> = {
  typescript: "TS", javascript: "JS", python: "PY", json: "{}", yaml: "YM",
  toml: "TM", markdown: "MD", html: "HT", css: "CS", scss: "SC",
  rust: "RS", go: "GO", java: "JV", php: "PH", sql: "SQ", shell: "SH",
  dockerfile: "DK", text: "  ",
};

function ClickableNode({
  node, depth, isLast, lineStack, onFileClick, activeFile,
}: {
  node:        TreeNode;
  depth:       number;
  isLast:      boolean;
  lineStack:   boolean[];
  onFileClick: (path: string) => void;
  activeFile:  string | null;
}) {
  const isDir  = !!node.children;
  const [open, setOpen] = useState(depth < 1);
  const name   = node.path === "." ? "." : (node.path.split("/").pop() ?? node.path);
  const lang   = node.language ?? "";
  const color  = isDir ? "#fbbf24" : (LANG_COLORS2[lang] ?? "#5a7a9a");
  const icon   = LANG_ICONS[lang] ?? "  ";
  const indent = depth * 14;
  const isActive = !isDir && node.path === activeFile;

  const handleClick = () => {
    if (isDir) { setOpen((v) => !v); }
    else { onFileClick(node.path); }
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === "Enter" && handleClick()}
        style={{
          display:     "flex",
          alignItems:  "center",
          gap:         "0.3rem",
          padding:     `2px 0.5rem 2px ${8 + indent}px`,
          borderRadius: "4px",
          cursor:      "pointer",
          background:  isActive ? "rgba(6,182,212,0.1)" : "transparent",
          borderLeft:  isActive ? "2px solid var(--cyan)" : "2px solid transparent",
          transition:  "background 0.1s",
          userSelect:  "none",
          minHeight:   22,
        }}
        onMouseEnter={(e) => {
          if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          if (!isActive) (e.currentTarget as HTMLDivElement).style.background = isActive ? "rgba(6,182,212,0.1)" : "transparent";
        }}
      >
        {/* Indent connector */}
        {lineStack.map((_, li) => (
          <span key={li} style={{ display: "inline-block", width: 14, borderLeft: "1px solid #1a2840", alignSelf: "stretch" }} />
        ))}

        {isDir ? (
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color, lineHeight: 1, flexShrink: 0 }}>
            {open ? "▾" : "▸"}
          </span>
        ) : (
          <span style={{
            fontFamily: "var(--mono)", fontSize: "0.52rem", fontWeight: 700,
            color, background: `${color}14`, border: `1px solid ${color}28`,
            borderRadius: "3px", padding: "0 2px", lineHeight: "13px",
            flexShrink: 0, minWidth: 20, textAlign: "center",
          }}>
            {icon}
          </span>
        )}

        <span style={{
          fontFamily:   "var(--mono)",
          fontSize:     "0.775rem",
          color:        isActive ? "var(--cyan)" : (isDir ? "var(--text)" : "var(--muted-foreground)"),
          fontWeight:   isActive ? 500 : 400,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
          flex:         1,
        }}>
          {name}{isDir && <span style={{ color: "var(--dim)" }}>/</span>}
        </span>
      </div>

      {isDir && open && node.children && (
        <div>
          {node.children.map((child, i) => (
            <ClickableNode
              key={child.path}
              node={child}
              depth={depth + 1}
              isLast={i === node.children!.length - 1}
              lineStack={[...lineStack, !isLast]}
              onFileClick={onFileClick}
              activeFile={activeFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}
