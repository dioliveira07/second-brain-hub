"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 style={{ fontFamily: "var(--mono)", fontSize: "1.1rem", fontWeight: 700, color: "var(--cyan)", borderBottom: "1px solid rgba(6,182,212,0.2)", paddingBottom: "0.4rem", marginTop: "1.5rem", marginBottom: "0.75rem", letterSpacing: "-0.01em" }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontFamily: "var(--mono)", fontSize: "0.9rem", fontWeight: 700, color: "var(--cyan)", borderBottom: "1px solid rgba(6,182,212,0.15)", paddingBottom: "0.3rem", marginTop: "1.25rem", marginBottom: "0.6rem", letterSpacing: "0.04em", textTransform: "uppercase" }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", fontWeight: 600, color: "var(--purple, #a78bfa)", marginTop: "1rem", marginBottom: "0.4rem" }}>
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p style={{ fontFamily: "var(--sans)", fontSize: "0.83rem", color: "var(--text)", lineHeight: 1.7, marginBottom: "0.6rem", opacity: 0.9 }}>
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul style={{ paddingLeft: "1.25rem", marginBottom: "0.6rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol style={{ paddingLeft: "1.25rem", marginBottom: "0.6rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li style={{ fontFamily: "var(--sans)", fontSize: "0.82rem", color: "var(--text)", lineHeight: 1.65, opacity: 0.88 }}>
      {children}
    </li>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return (
        <code style={{ display: "block", fontFamily: "var(--mono)", fontSize: "0.75rem", color: "var(--cyan)", background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)", borderRadius: "6px", padding: "0.75rem 1rem", overflowX: "auto", lineHeight: 1.6 }}>
          {children}
        </code>
      );
    }
    return (
      <code style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: "var(--cyan)", background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.18)", borderRadius: "4px", padding: "1px 6px" }}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre style={{ margin: "0.75rem 0", borderRadius: "6px", overflow: "hidden" }}>
      {children}
    </pre>
  ),
  strong: ({ children }) => (
    <strong style={{ color: "var(--text)", fontWeight: 600 }}>
      {children}
    </strong>
  ),
  em: ({ children }) => (
    <em style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>
      {children}
    </em>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: "2px solid rgba(167,139,250,0.4)", paddingLeft: "1rem", margin: "0.75rem 0", opacity: 0.85 }}>
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr style={{ border: "none", borderTop: "1px solid rgba(6,182,212,0.15)", margin: "1rem 0" }} />
  ),
};

export function MarkdownSummary({ content }: { content: string }) {
  return (
    <div style={{ lineHeight: 1.6 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
