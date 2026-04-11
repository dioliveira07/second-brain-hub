import { NextRequest, NextResponse } from "next/server";
import { codeToHtml } from "shiki";

const HUB_URL = process.env.HUB_API_URL || "http://host.docker.internal:8010";

const LANG_MAP: Record<string, string> = {
  typescript: "typescript",
  javascript: "javascript",
  python:     "python",
  go:         "go",
  rust:       "rust",
  java:       "java",
  php:        "php",
  ruby:       "ruby",
  css:        "css",
  scss:       "scss",
  html:       "html",
  json:       "json",
  yaml:       "yaml",
  toml:       "toml",
  markdown:   "markdown",
  sql:        "sql",
  bash:       "bash",
  dockerfile: "dockerfile",
  text:       "text",
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const owner = searchParams.get("owner");
  const repo  = searchParams.get("repo");
  const path  = searchParams.get("path");

  if (!owner || !repo || !path) {
    return NextResponse.json({ error: "owner, repo e path são obrigatórios" }, { status: 400 });
  }

  // Buscar conteúdo do arquivo na hub API
  const apiUrl = `${HUB_URL}/api/v1/repos/${owner}/${repo}/file?path=${encodeURIComponent(path)}`;
  let data: { content: string; language: string; size: number; path: string };
  try {
    const res = await fetch(apiUrl, { cache: "no-store" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      return NextResponse.json({ error: err.detail ?? "Erro ao buscar arquivo" }, { status: res.status });
    }
    data = await res.json();
  } catch (e) {
    return NextResponse.json({ error: `Hub indisponível: ${e}` }, { status: 502 });
  }

  // Highlight com shiki (VS Code Dark+ theme)
  const lang = LANG_MAP[data.language] ?? "text";
  let html = "";
  try {
    html = await codeToHtml(data.content, {
      lang,
      theme: "github-dark",
    });
  } catch {
    // fallback: escapar HTML e retornar como texto simples
    html = `<pre><code>${data.content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</code></pre>`;
  }

  return NextResponse.json({
    path:     data.path,
    language: data.language,
    size:     data.size,
    html,
    lines:    data.content.split("\n").length,
  });
}
