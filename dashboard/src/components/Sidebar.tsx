"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Network, FolderGit2,
  BookOpen, GitCommitHorizontal, Activity,
} from "lucide-react";
import { GlitchText } from "@/components/reactbits/GlitchText";

const NAV = [
  { href: "/",         label: "Dashboard",    Icon: LayoutDashboard },
  { href: "/graph",    label: "Grafo",        Icon: Network         },
  { href: "/repos",    label: "Repositórios", Icon: FolderGit2      },
  { href: "/playbook", label: "Playbook",     Icon: BookOpen        },
  { href: "/timeline", label: "Timeline",     Icon: GitCommitHorizontal },
  { href: "/activity", label: "Atividade",    Icon: Activity        },
];

const C = {
  bg:         "rgba(10,22,40,0.92)",
  border:     "#1a2840",
  cyan:       "#06b6d4",
  green:      "#22c55e",
  text:       "#e2e8f0",
  inactive:   "#7a9ab8",
  activeBg:   "rgba(6,182,212,0.08)",
  hoverBg:    "rgba(6,182,212,0.04)",
  dim:        "#334a62",
  footer:     "#4a6888",
};

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width:            220,
        flexShrink:       0,
        display:          "flex",
        flexDirection:    "column",
        background:       C.bg,
        backdropFilter:   "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderRight:      `1px solid ${C.border}`,
        position:         "relative",
        zIndex:           10,
      }}
    >
      {/* Linha decorativa no topo */}
      <div style={{
        position:   "absolute",
        top: 0, left: 0, right: 0,
        height:     "1px",
        background: `linear-gradient(90deg, transparent, ${C.cyan}55, transparent)`,
      }} />

      {/* Brand */}
      <div
        style={{
          padding:      "1.5rem 1.25rem 1.25rem",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            fontFamily:    "'Fira Code', monospace",
            fontSize:      "0.68rem",
            fontWeight:    700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color:         C.cyan,
            textShadow:    "0 0 16px rgba(6,182,212,.55)",
            marginBottom:  "0.3rem",
          }}
        >
          <GlitchText speed="slow">◈ SECOND BRAIN</GlitchText>
        </div>
        <div
          style={{
            fontFamily:    "'Fira Code', monospace",
            fontSize:      "0.56rem",
            color:         C.footer,
            letterSpacing: "0.12em",
          }}
        >
          KNOWLEDGE HUB v0.1
        </div>
      </div>

      {/* Nav */}
      <nav
        style={{
          flex:          1,
          padding:       "0.85rem 0.5rem",
          display:       "flex",
          flexDirection: "column",
          gap:           "1px",
        }}
      >
        {NAV.map(({ href, label, Icon }, i) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              style={{
                display:        "flex",
                alignItems:     "center",
                gap:            "0.6rem",
                padding:        "0.58rem 0.85rem",
                borderRadius:   "6px",
                fontFamily:     "'Fira Sans', sans-serif",
                fontSize:       "0.82rem",
                fontWeight:     active ? 500 : 400,
                color:          active ? C.cyan : C.inactive,
                background:     active ? C.activeBg : "transparent",
                borderLeft:     `2px solid ${active ? C.cyan : "transparent"}`,
                textDecoration: "none",
                transition:     "color 180ms, background 180ms, border-color 180ms, transform 120ms",
                animation:      `fade-left 0.35s cubic-bezier(.16,1,.3,1) both`,
                animationDelay: `${60 + i * 40}ms`,
                position:       "relative",
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = C.hoverBg;
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <Icon
                size={15}
                strokeWidth={active ? 2 : 1.6}
                color={active ? C.cyan : C.inactive}
                style={{ flexShrink: 0, transition: "color 180ms" }}
              />
              {label}

              {/* Ponto ativo */}
              {active && (
                <div style={{
                  width:        4,
                  height:       4,
                  borderRadius: "50%",
                  background:   C.cyan,
                  boxShadow:    `0 0 6px ${C.cyan}`,
                  marginLeft:   "auto",
                }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Status */}
      <div
        style={{
          padding:       "0.85rem 1.25rem",
          borderTop:     `1px solid ${C.border}`,
          display:       "flex",
          flexDirection: "column",
          gap:           "0.3rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <div
            className="pulse-dot"
            style={{
              width:        5,
              height:       5,
              borderRadius: "50%",
              background:   C.green,
              boxShadow:    `0 0 7px ${C.green}`,
              flexShrink:   0,
            }}
          />
          <span style={{ fontFamily: "'Fira Code', monospace", fontSize: "0.58rem", color: C.green, letterSpacing: "0.1em" }}>
            SYSTEM ONLINE
          </span>
        </div>
        <span style={{ fontFamily: "'Fira Code', monospace", fontSize: "0.54rem", color: C.dim, letterSpacing: "0.08em" }}>
          FASE 7 — PROD
        </span>
      </div>
    </aside>
  );
}
