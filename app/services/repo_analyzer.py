"""
Repo Analyzer — Fase 1B

Responsável por entender um repositório antes de indexá-lo:
1. Detectar stack tecnológica
2. Mapear estrutura de diretórios com anotações semânticas
3. Identificar arquivos-chave por papel (entrypoints, rotas, models, configs)
4. Gerar resumo arquitetural via Claude API
"""

import os
import ast
import json
import fnmatch
from pathlib import Path
from typing import Any

# Stack detection: file markers → stack identification
STACK_MARKERS = {
    "package.json": "Node.js",
    "tsconfig.json": "TypeScript",
    "next.config.js": "Next.js",
    "next.config.ts": "Next.js",
    "nuxt.config.ts": "Nuxt",
    "requirements.txt": "Python",
    "pyproject.toml": "Python",
    "Pipfile": "Python",
    "go.mod": "Go",
    "Cargo.toml": "Rust",
    "pom.xml": "Java/Maven",
    "build.gradle": "Java/Gradle",
    "Gemfile": "Ruby",
    "composer.json": "PHP",
    "Dockerfile": "Docker",
    "docker-compose.yml": "Docker Compose",
    "docker-compose.yaml": "Docker Compose",
    "terraform/": "Terraform",
    ".github/workflows/": "GitHub Actions",
    "prisma/schema.prisma": "Prisma",
    "alembic.ini": "Alembic (SQL Migrations)",
}

# Semantic roles: path patterns → what they represent
SEMANTIC_ROLES = {
    "entrypoint": ["main.py", "app.py", "index.ts", "index.js", "server.ts", "server.js", "cmd/main.go"],
    "routes": ["routes/", "routers/", "controllers/", "api/", "endpoints/"],
    "models": ["models/", "schemas/", "entities/", "types/"],
    "middleware": ["middleware/", "middlewares/"],
    "config": ["config/", "settings/", ".env.example", "docker-compose", "Dockerfile"],
    "migrations": ["migrations/", "alembic/versions/"],
    "tests": ["tests/", "test/", "__tests__/", "spec/"],
    "docs": ["docs/", "doc/", "README.md", "ARCHITECTURE.md", "CHANGELOG.md"],
    "ci_cd": [".github/workflows/", ".gitlab-ci.yml", "Jenkinsfile", ".circleci/"],
    "infra": ["terraform/", "infra/", "deploy/", "k8s/", "helm/"],
}

# Files/dirs to always skip
SKIP_PATTERNS = [
    "node_modules/",
    ".git/",
    "__pycache__/",
    ".venv/",
    "venv/",
    "vendor/",
    "dist/",
    "build/",
    ".next/",
    "target/",
    ".idea/",
    ".vscode/",
    "*.min.js",
    "*.min.css",
    "*.map",
    "*.cjs",
    "*.bundle.js",
    "*.chunk.js",
    "*.lock",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
]

# Known JS/TS dependencies → framework/infra tags
_JS_DEP_MAP = {
    "react": "React",
    "next": "Next.js",
    "vue": "Vue",
    "nuxt": "Nuxt",
    "svelte": "Svelte",
    "angular": "@angular/core",
    "express": "Express",
    "fastify": "Fastify",
    "nestjs": "NestJS",
    "@nestjs/core": "NestJS",
    "koa": "Koa",
    "hono": "Hono",
    "prisma": "Prisma",
    "@prisma/client": "Prisma",
    "typeorm": "TypeORM",
    "drizzle-orm": "Drizzle",
    "mongoose": "MongoDB/Mongoose",
    "pg": "PostgreSQL",
    "mysql2": "MySQL",
    "redis": "Redis",
    "ioredis": "Redis",
    "bull": "Bull Queue",
    "bullmq": "BullMQ",
    "graphql": "GraphQL",
    "@apollo/server": "Apollo GraphQL",
    "trpc": "tRPC",
    "@trpc/server": "tRPC",
    "zod": "Zod",
    "tailwindcss": "Tailwind CSS",
    "vite": "Vite",
    "webpack": "Webpack",
    "jest": "Jest",
    "vitest": "Vitest",
    "stripe": "Stripe",
    "supabase-js": "@supabase/supabase-js",
    "@supabase/supabase-js": "Supabase",
}

# Known Python packages → framework/infra tags
_PY_DEP_MAP = {
    "fastapi": "FastAPI",
    "django": "Django",
    "flask": "Flask",
    "starlette": "Starlette",
    "sqlalchemy": "SQLAlchemy",
    "alembic": "Alembic",
    "celery": "Celery",
    "pydantic": "Pydantic",
    "asyncpg": "PostgreSQL (asyncpg)",
    "psycopg2": "PostgreSQL (psycopg2)",
    "redis": "Redis",
    "anthropic": "Anthropic/Claude",
    "openai": "OpenAI",
    "langchain": "LangChain",
    "qdrant-client": "Qdrant",
    "httpx": "HTTPX",
    "requests": "Requests",
    "supabase": "Supabase",
    "stripe": "Stripe",
    "pytest": "pytest",
}


def _should_skip(path_str: str) -> bool:
    """Return True if the path matches any SKIP_PATTERNS."""
    for pat in SKIP_PATTERNS:
        if pat.endswith("/"):
            # directory pattern — check if it appears in the path components
            if pat.rstrip("/") in Path(path_str).parts:
                return True
        else:
            if fnmatch.fnmatch(Path(path_str).name, pat):
                return True
    return False


def _get_language(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    return {
        ".py": "python",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".js": "javascript",
        ".jsx": "javascript",
        ".go": "go",
        ".rs": "rust",
        ".java": "java",
        ".rb": "ruby",
        ".php": "php",
        ".md": "markdown",
        ".mdx": "markdown",
        ".json": "json",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".toml": "toml",
        ".env": "env",
        ".sh": "shell",
        ".sql": "sql",
        ".html": "html",
        ".css": "css",
        ".scss": "scss",
    }.get(ext, "text")


def _get_semantic_role(path_str: str) -> str:
    """Return the semantic role for a path."""
    for role, patterns in SEMANTIC_ROLES.items():
        for pat in patterns:
            if pat.endswith("/"):
                # directory prefix check
                if f"/{pat.rstrip('/')}" in f"/{path_str}" or path_str.startswith(pat.rstrip("/")):
                    return role
            else:
                # filename or path suffix
                if Path(path_str).name == pat or path_str.endswith(pat):
                    return role
    return "other"


def detect_stack(repo_path: str) -> dict:
    """Detecta stack tecnológica analisando arquivos do repo."""
    languages: set[str] = set()
    frameworks: set[str] = set()
    infra: set[str] = set()

    root = Path(repo_path)

    # Walk files and check against STACK_MARKERS
    for file_path in root.rglob("*"):
        if not file_path.is_file():
            continue
        rel = str(file_path.relative_to(root))
        if _should_skip(rel):
            continue

        # Check markers
        for marker, tech in STACK_MARKERS.items():
            if marker.endswith("/"):
                dir_marker = marker.rstrip("/")
                if dir_marker in Path(rel).parts:
                    infra.add(tech)
            else:
                if file_path.name == marker or rel == marker:
                    # classify by type
                    if tech in ("Docker", "Docker Compose", "Terraform", "GitHub Actions",
                                "Alembic (SQL Migrations)", "Prisma"):
                        infra.add(tech)
                    elif tech in ("Node.js", "TypeScript", "Next.js", "Nuxt", "Python", "Go",
                                  "Rust", "Java/Maven", "Java/Gradle", "Ruby", "PHP"):
                        languages.add(tech)

        # Detect language by extension
        ext = file_path.suffix.lower()
        if ext == ".py":
            languages.add("Python")
        elif ext in (".ts", ".tsx"):
            languages.add("TypeScript")
        elif ext in (".js", ".jsx"):
            languages.add("JavaScript")
        elif ext == ".go":
            languages.add("Go")
        elif ext == ".rs":
            languages.add("Rust")
        elif ext == ".rb":
            languages.add("Ruby")
        elif ext in (".java",):
            languages.add("Java")

        # Parse package.json for JS frameworks
        if file_path.name == "package.json" and file_path.parent == root:
            try:
                data = json.loads(file_path.read_text(encoding="utf-8", errors="ignore"))
                all_deps: dict = {}
                all_deps.update(data.get("dependencies", {}))
                all_deps.update(data.get("devDependencies", {}))
                for dep in all_deps:
                    dep_lower = dep.lower()
                    if dep_lower in _JS_DEP_MAP:
                        frameworks.add(_JS_DEP_MAP[dep_lower])
                    elif dep in _JS_DEP_MAP:
                        frameworks.add(_JS_DEP_MAP[dep])
            except Exception:
                pass

        # Parse requirements.txt for Python frameworks
        if file_path.name == "requirements.txt":
            try:
                for line in file_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                    line = line.strip().split("==")[0].split(">=")[0].split("[")[0].lower()
                    if line in _PY_DEP_MAP:
                        frameworks.add(_PY_DEP_MAP[line])
            except Exception:
                pass

        # Parse pyproject.toml for Python frameworks
        if file_path.name == "pyproject.toml":
            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
                for pkg, tag in _PY_DEP_MAP.items():
                    if pkg in content:
                        frameworks.add(tag)
            except Exception:
                pass

    return {
        "languages": sorted(languages),
        "frameworks": sorted(frameworks),
        "infra": sorted(infra),
    }


def map_directory(repo_path: str) -> dict:
    """Gera árvore de diretórios com anotações semânticas."""
    root = Path(repo_path)

    def _build_node(path: Path, rel_base: Path) -> dict | None:
        rel = str(path.relative_to(root)) if path != root else "."
        if rel != "." and _should_skip(rel):
            return None

        role = _get_semantic_role(rel) if rel != "." else "root"
        node: dict[str, Any] = {"path": rel, "role": role}

        if path.is_dir():
            children = []
            try:
                for child in sorted(path.iterdir()):
                    child_node = _build_node(child, rel_base)
                    if child_node is not None:
                        children.append(child_node)
            except PermissionError:
                pass
            node["children"] = children
        else:
            node["language"] = _get_language(rel)

        return node

    return _build_node(root, root) or {"path": ".", "role": "root", "children": []}


def identify_key_files(repo_path: str, stack: dict) -> list[dict]:
    """Identifica arquivos mais importantes baseado na stack e SEMANTIC_ROLES."""
    root = Path(repo_path)
    results: list[dict] = []

    # Priority ordering
    ROLE_PRIORITY = {
        "entrypoint": 1,
        "routes": 2,
        "models": 3,
        "middleware": 4,
        "config": 5,
        "docs": 6,
        "ci_cd": 7,
        "infra": 8,
        "migrations": 9,
        "tests": 10,
        "other": 11,
    }

    for file_path in root.rglob("*"):
        if not file_path.is_file():
            continue
        rel = str(file_path.relative_to(root))
        if _should_skip(rel):
            continue

        # Skip binary and very large files
        try:
            if file_path.stat().st_size > 500_000:
                continue
        except Exception:
            continue

        role = _get_semantic_role(rel)
        language = _get_language(rel)
        priority_num = ROLE_PRIORITY.get(role, 11)

        # Convert numeric priority to label
        if priority_num <= 2:
            priority = "high"
        elif priority_num <= 6:
            priority = "medium"
        else:
            priority = "low"

        results.append({
            "path": rel,
            "role": role,
            "language": language,
            "priority": priority,
            "_sort": priority_num,
        })

    # Sort by priority
    results.sort(key=lambda x: (x["_sort"], x["path"]))

    # Remove internal sort key and limit to 1000
    for r in results:
        r.pop("_sort", None)

    return results[:1000]


CLAUDE_BIN = "/usr/local/bin/claude"


def generate_summary(repo_path: str, stack: dict, key_files: list[dict]) -> str:
    """Gera resumo arquitetural via Claude Code CLI (mesmo padrão do synthesis.py)."""
    import subprocess

    root = Path(repo_path)

    # Read content of key files up to ~40KB total
    total_content = ""
    budget = 40_000

    for kf in key_files:
        if len(total_content) >= budget:
            break
        file_path = root / kf["path"]
        if not file_path.exists() or not file_path.is_file():
            continue
        try:
            text = file_path.read_text(encoding="utf-8", errors="ignore")
            remaining = budget - len(total_content)
            if len(text) > remaining:
                text = text[:remaining] + "\n...[truncated]"
            total_content += f"\n\n### {kf['path']} ({kf['role']})\n{text}"
        except Exception:
            continue

    prompt = (
        f"Analise este repositório e gere um resumo arquitetural estruturado em português.\n\n"
        f"Stack detectada: {json.dumps(stack, ensure_ascii=False)}\n\n"
        f"Arquivos principais:\n{total_content}\n\n"
        f"Responda EXATAMENTE neste formato (sem introdução, direto ao ponto):\n"
        f"## Stack\n<linguagens, frameworks, infra em bullets>\n\n"
        f"## Padrão Arquitetural\n<MVC, hexagonal, microservices, monólito, CRUD simples, etc.>\n\n"
        f"## Autenticação\n<JWT, OAuth, Supabase Auth, sessions, nenhuma, etc.>\n\n"
        f"## Deploy\n<Docker, Vercel, Railway, sem config detectada, etc.>\n\n"
        f"## Pontos de Entrada\n<arquivos ou endpoints principais>\n\n"
        f"## Dependências Externas\n<APIs, serviços de terceiros, SDKs>\n"
    )

    try:
        result = subprocess.run(
            [CLAUDE_BIN, "-p", prompt],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except Exception:
        pass

    # Basic summary without Claude API
    repo_name = Path(repo_path).name
    lines = [
        f"# Resumo Arquitetural — {repo_name}",
        "",
        "## Stack",
        f"- Linguagens: {', '.join(stack.get('languages', [])) or 'N/A'}",
        f"- Frameworks: {', '.join(stack.get('frameworks', [])) or 'N/A'}",
        f"- Infra: {', '.join(stack.get('infra', [])) or 'N/A'}",
        "",
        "## Padrão Arquitetural",
        "Não determinado automaticamente.",
        "",
        "## Autenticação",
        "Não determinada automaticamente.",
        "",
        "## Deploy",
    ]

    if "Docker" in stack.get("infra", []):
        lines.append("Docker / Docker Compose")
    elif "Kubernetes" in stack.get("infra", []):
        lines.append("Kubernetes")
    else:
        lines.append("Não determinado automaticamente.")

    lines += [
        "",
        "## Pontos de Entrada",
    ]
    entrypoints = [f["path"] for f in key_files if f["role"] == "entrypoint"]
    if entrypoints:
        for ep in entrypoints:
            lines.append(f"- {ep}")
    else:
        lines.append("Não identificados automaticamente.")

    lines += [
        "",
        "## Dependências Externas",
        f"Arquivos analisados: {len(key_files)}",
    ]

    return "\n".join(lines)


def analyze_repo(repo_path: str, existing_summary: str | None = None) -> dict:
    """Orquestrador: chama todas as funções acima em sequência.

    Se existing_summary for passado (indexação incremental), pula generate_summary
    para evitar consumo desnecessário de tokens — o summary só é regenerado em
    indexações completas (primeiro push ou indexação manual).
    """
    stack = detect_stack(repo_path)
    directory_map = map_directory(repo_path)
    key_files = identify_key_files(repo_path, stack)
    summary = existing_summary if existing_summary else generate_summary(repo_path, stack, key_files)
    return {
        "stack": stack,
        "directory_map": directory_map,
        "key_files": key_files,
        "summary": summary,
    }
