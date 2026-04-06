"""
Repo Analyzer — Fase 1B

Responsável por entender um repositório antes de indexá-lo:
1. Detectar stack tecnológica
2. Mapear estrutura de diretórios com anotações semânticas
3. Identificar arquivos-chave por papel (entrypoints, rotas, models, configs)
4. Gerar resumo arquitetural via Claude API
"""

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
    "*.map",
    "*.lock",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
]


# TODO: Fase 1B — Implementar:
# - detect_stack(repo_path: str) -> dict
# - map_directory(repo_path: str) -> dict
# - identify_key_files(repo_path: str) -> list[dict]
# - generate_summary(repo_path: str) -> str  (via Claude API)
