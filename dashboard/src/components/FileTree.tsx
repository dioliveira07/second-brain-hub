"use client";

import { useState, useMemo } from "react";
import { Folder, FolderOpen, ChevronRight, Search } from "lucide-react";

/* ─── Types ──────────────────────────────────────── */
export type TreeNode = {
  path:      string;
  role?:     string;
  language?: string;
  children?: TreeNode[];
};

/* ─── Language → color + icon char ──────────────── */
const LANG_META: Record<string, { color: string; icon: string }> = {
  typescript:  { color: "#06b6d4", icon: "TS" },
  javascript:  { color: "#fbbf24", icon: "JS" },
  python:      { color: "#22c55e", icon: "PY" },
  json:        { color: "#fbbf24", icon: "{}" },
  yaml:        { color: "#fbbf24", icon: "YM" },
  toml:        { color: "#fbbf24", icon: "TM" },
  markdown:    { color: "#a78bfa", icon: "MD" },
  html:        { color: "#f87171", icon: "HT" },
  css:         { color: "#a78bfa", icon: "CS" },
  scss:        { color: "#a78bfa", icon: "SC" },
  rust:        { color: "#f97316", icon: "RS" },
  go:          { color: "#06b6d4", icon: "GO" },
  java:        { color: "#f97316", icon: "JV" },
  php:         { color: "#a78bfa", icon: "PH" },
  sql:         { color: "#fbbf24", icon: "SQ" },
  shell:       { color: "#22c55e", icon: "SH" },
  dockerfile:  { color: "#06b6d4", icon: "DK" },
  prisma:      { color: "#22c55e", icon: "PR" },
  graphql:     { color: "#f87171", icon: "GQ" },
};

const ROLE_COLORS: Record<string, string> = {
  entrypoint: "#22c55e",
  config:     "#fbbf24",
  docs:       "#a78bfa",
  test:       "#f97316",
  root:       "#5a7a9a",
  other:      "#5a7a9a",
};

function getLangMeta(node: TreeNode) {
  return LANG_META[node.language ?? ""] ?? { color: "#5a7a9a", icon: "  " };
}

function getFolderColor(node: TreeNode) {
  return ROLE_COLORS[node.role ?? "other"] ?? "#fbbf24";
}

function countFiles(node: TreeNode): number {
  if (!node.children) return 1;
  return node.children.reduce((s, c) => s + countFiles(c), 0);
}

function getName(path: string) {
  return path === "." ? "." : path.split("/").pop() ?? path;
}

/* ─── Flat search ────────────────────────────────── */
function flattenFiles(node: TreeNode, results: TreeNode[] = []): TreeNode[] {
  if (!node.children) {
    results.push(node);
  } else {
    (node.children ?? []).forEach((c) => flattenFiles(c, results));
  }
  return results;
}

/* ─── Single row ─────────────────────────────────── */
function NodeRow({
  node,
  depth,
  isLast,
  lineStack,
}: {
  node:      TreeNode;
  depth:     number;
  isLast:    boolean;
  lineStack: boolean[]; // per ancestor: should vertical line continue?
}) {
  const isDir   = !!node.children;
  const [open, setOpen] = useState(depth < 1);
  const name    = getName(node.path);
  const lang    = getLangMeta(node);
  const folderColor = getFolderColor(node);
  const fileCount = isDir ? countFiles(node) : 0;

  /* indentation prefix */
  const prefix = lineStack.map((hasLine) =>
    hasLine
      ? <span key={Math.random()} style={{ display: "inline-block", width: 16, borderLeft: "1px solid #1a2840", marginRight: 0 }} />
      : <span key={Math.random()} style={{ display: "inline-block", width: 16 }} />
  );

  return (
    <div>
      {/* Row */}
      <div
        role={isDir ? "button" : undefined}
        tabIndex={isDir ? 0 : undefined}
        onClick={isDir ? () => setOpen((v) => !v) : undefined}
        onKeyDown={isDir ? (e) => e.key === "Enter" && setOpen((v) => !v) : undefined}
        style={{
          display:     "flex",
          alignItems:  "center",
          gap:         "0.35rem",
          padding:     "2.5px 0.5rem 2.5px 0.25rem",
          borderRadius: "5px",
          cursor:      isDir ? "pointer" : "default",
          transition:  "background 0.1s",
          userSelect:  "none",
          minHeight:   24,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      >
        {/* Connector lines (ASCII tree) */}
        <span style={{ display: "flex", alignItems: "stretch", flexShrink: 0 }}>
          {prefix}
          {depth > 0 && (
            <span style={{ display: "inline-flex", flexDirection: "column", width: 16, flexShrink: 0 }}>
              {/* vertical part */}
              <span style={{
                display: "block",
                width: 1,
                flex: 1,
                background: isLast ? "transparent" : "#1a2840",
                marginLeft: 0,
                alignSelf: "flex-start",
                minHeight: 12,
              }} />
              {/* horizontal connector */}
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0,
              }}>
                <span style={{ width: 1, height: 1, background: "#1a2840" }} />
                <span style={{ width: 10, height: 1, background: "#1a2840" }} />
              </span>
              <span style={{ flex: 1 }} />
            </span>
          )}
        </span>

        {/* Chevron */}
        {isDir ? (
          <ChevronRight
            size={11}
            color={folderColor}
            style={{
              flexShrink: 0,
              transform:  open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.14s ease",
              opacity:    0.8,
            }}
          />
        ) : (
          <span style={{ width: 11, flexShrink: 0 }} />
        )}

        {/* Folder / file icon */}
        {isDir ? (
          open
            ? <FolderOpen size={13} color={folderColor} style={{ flexShrink: 0 }} />
            : <Folder     size={13} color={folderColor} style={{ flexShrink: 0 }} />
        ) : (
          /* language badge */
          <span style={{
            fontFamily:   "var(--mono)",
            fontSize:     "0.55rem",
            fontWeight:   700,
            color:        lang.color,
            background:   `${lang.color}14`,
            border:       `1px solid ${lang.color}30`,
            borderRadius: "3px",
            padding:      "0 3px",
            lineHeight:   "14px",
            flexShrink:   0,
            letterSpacing: "0.02em",
            minWidth:     22,
            textAlign:    "center",
          }}>
            {lang.icon}
          </span>
        )}

        {/* Name */}
        <span style={{
          fontFamily:  "var(--mono)",
          fontSize:    "0.775rem",
          color:       isDir ? "var(--text)" : "var(--muted-foreground)",
          letterSpacing: "-0.01em",
          whiteSpace:  "nowrap",
          overflow:    "hidden",
          textOverflow: "ellipsis",
          flex: 1,
        }}>
          {name}
          {isDir && (
            <span style={{ color: "var(--dim)", fontWeight: 400 }}>/</span>
          )}
        </span>

        {/* File count badge */}
        {isDir && (
          <span style={{
            fontFamily:   "var(--mono)",
            fontSize:     "0.65rem",
            color:        "var(--dim)",
            background:   "var(--bg-panel)",
            border:       "1px solid var(--border-dim)",
            borderRadius: "3px",
            padding:      "0 5px",
            lineHeight:   "16px",
            flexShrink:   0,
          }}>
            {fileCount}
          </span>
        )}

        {/* Role dot for special files */}
        {!isDir && node.role && node.role !== "other" && node.role !== "root" && (
          <span
            title={node.role}
            style={{
              width:        6,
              height:       6,
              borderRadius: "50%",
              background:   ROLE_COLORS[node.role] ?? "#5a7a9a",
              flexShrink:   0,
              opacity:      0.85,
            }}
          />
        )}
      </div>

      {/* Children */}
      {isDir && open && node.children && node.children.length > 0 && (
        <div>
          {node.children.map((child, i) => (
            <NodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              isLast={i === node.children!.length - 1}
              lineStack={[...lineStack, !isLast]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Search result list ─────────────────────────── */
function SearchResults({ nodes, query }: { nodes: TreeNode[]; query: string }) {
  const q = query.toLowerCase();
  const matches = nodes.filter((n) => getName(n.path).toLowerCase().includes(q));

  if (matches.length === 0) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: "var(--dim)" }}>
          Nenhum arquivo encontrado
        </p>
      </div>
    );
  }

  return (
    <div>
      {matches.slice(0, 80).map((n) => {
        const lang = getLangMeta(n);
        return (
          <div
            key={n.path}
            style={{
              display:     "flex",
              alignItems:  "center",
              gap:         "0.5rem",
              padding:     "3px 0.5rem",
              borderRadius: "5px",
              transition:  "background 0.1s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
          >
            <span style={{
              fontFamily:   "var(--mono)",
              fontSize:     "0.55rem",
              fontWeight:   700,
              color:        lang.color,
              background:   `${lang.color}14`,
              border:       `1px solid ${lang.color}30`,
              borderRadius: "3px",
              padding:      "0 3px",
              lineHeight:   "14px",
              flexShrink:   0,
              minWidth:     22,
              textAlign:    "center",
            }}>
              {lang.icon}
            </span>
            <span style={{
              fontFamily: "var(--mono)",
              fontSize:   "0.775rem",
              color:      "var(--muted-foreground)",
              flex:       1,
              overflow:   "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {n.path}
            </span>
          </div>
        );
      })}
      {matches.length > 80 && (
        <p style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--dim)", padding: "0.5rem", textAlign: "center" }}>
          +{matches.length - 80} resultados
        </p>
      )}
    </div>
  );
}

/* ─── Public component ───────────────────────────── */
export function FileTree({ root }: { root: TreeNode }) {
  const [search, setSearch] = useState("");
  const allFiles = useMemo(() => flattenFiles(root), [root]);
  const children = root.children ?? [];

  const totalFiles = allFiles.length;
  const totalDirs  = useMemo(() => {
    function countDirs(n: TreeNode): number {
      if (!n.children) return 0;
      return 1 + n.children.reduce((s, c) => s + countDirs(c), 0);
    }
    return countDirs(root) - 1; // exclude root itself
  }, [root]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>

      {/* Stats + Search bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search
            size={12}
            color="var(--dim)"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          />
          <input
            type="text"
            placeholder="filtrar arquivos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width:        "100%",
              background:   "var(--bg-deep)",
              border:       "1px solid var(--border)",
              borderRadius: "var(--r)",
              padding:      "6px 10px 6px 28px",
              fontFamily:   "var(--mono)",
              fontSize:     "0.75rem",
              color:        "var(--text)",
              outline:      "none",
              transition:   "border-color 0.15s",
            }}
            onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--cyan)"; }}
            onBlur={(e)  => { (e.target as HTMLInputElement).style.borderColor = "var(--border)"; }}
          />
        </div>

        {/* counters */}
        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
          {[
            { val: totalFiles, label: "arquivos", color: "var(--cyan)"   },
            { val: totalDirs,  label: "pastas",   color: "var(--amber, #fbbf24)" },
          ].map(({ val, label, color }) => (
            <span
              key={label}
              title={label}
              style={{
                fontFamily:   "var(--mono)",
                fontSize:     "0.7rem",
                color,
                background:   "var(--bg-panel)",
                border:       "1px solid var(--border-dim)",
                borderRadius: "var(--r)",
                padding:      "3px 8px",
                whiteSpace:   "nowrap",
              }}
            >
              {val} <span style={{ color: "var(--dim)" }}>{label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Tree / Search results */}
      <div style={{
        maxHeight:  420,
        overflowY:  "auto",
        overflowX:  "hidden",
        padding:    "0.35rem",
        background: "var(--bg-deep)",
        border:     "1px solid var(--border-dim)",
        borderRadius: "var(--r)",
      }}>
        {search.trim() ? (
          <SearchResults nodes={allFiles} query={search} />
        ) : (
          children.map((child, i) => (
            <NodeRow
              key={child.path}
              node={child}
              depth={0}
              isLast={i === children.length - 1}
              lineStack={[]}
            />
          ))
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", paddingTop: "0.1rem" }}>
        {[
          { role: "entrypoint", label: "entrypoint" },
          { role: "config",     label: "config" },
          { role: "docs",       label: "docs" },
          { role: "test",       label: "test" },
        ].map(({ role, label }) => (
          <div key={role} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: ROLE_COLORS[role],
              display: "inline-block",
            }} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: "var(--dim)" }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
