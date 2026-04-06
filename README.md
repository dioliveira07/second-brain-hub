# Second Brain Hub

Segundo Cérebro Corporativo — Hub Central para indexação, busca semântica e memória técnica da empresa.

## Arquitetura

```
Hub Central (FastAPI) ← Qdrant + PostgreSQL + Redis
       ↑
  HTTPS + JWT
       ↑
Dev machines (Claude Code + MCP Server)
```

## Stack

| Componente | Tecnologia |
|---|---|
| API | FastAPI (Python 3.12) |
| Vector DB | Qdrant |
| Relacional | PostgreSQL 16 |
| Queue | Redis + Celery |
| Embeddings | FastEmbed (bge-small-en-v1.5) |
| AI | Claude API (Anthropic) |

## Setup (Desenvolvimento)

```bash
# 1. Copiar variáveis de ambiente
cp .env.example .env

# 2. Subir infraestrutura
docker compose up -d

# 3. API disponível em
http://localhost:8000/health
http://localhost:8000/docs  # Swagger UI
```

## Estrutura do Projeto

```
second-brain-hub/
├── app/
│   ├── api/              # Endpoints REST
│   │   ├── auth.py       # GitHub OAuth + JWT (Fase 3)
│   │   ├── health.py     # Health check
│   │   ├── indexing.py   # Trigger de indexação
│   │   ├── repos.py      # Summary + decisions por repo
│   │   ├── search.py     # Busca semântica
│   │   └── webhooks.py   # GitHub webhooks (Fase 4)
│   ├── core/             # Configuração e segurança
│   ├── db/               # Models SQLAlchemy + sessão
│   ├── services/         # Lógica de negócio
│   │   ├── chunker.py        # Chunking context-aware
│   │   ├── embeddings.py     # FastEmbed wrapper
│   │   ├── github_client.py  # GitHub API integration
│   │   ├── qdrant.py         # Qdrant client + collections
│   │   ├── reflection.py     # PR analysis engine (Fase 4)
│   │   └── repo_analyzer.py  # Stack detection + mapping
│   ├── worker.py         # Celery tasks
│   └── main.py           # FastAPI app entrypoint
├── mcp_server/           # MCP Server para Claude Code dos devs (Fase 5)
├── tests/
├── docs/
│   └── PRD.md            # Product Requirements Document
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── .env.example
```

## Fases do MVP

| Fase | Objetivo | Status |
|---|---|---|
| 1A | Infraestrutura base | 🏗️ Em progresso |
| 1B | Repo Analyzer (detecção de stack + mapeamento) | ⏳ Pendente |
| 1C | Pipeline de indexação inteligente | ⏳ Pendente |
| 2 | Busca semântica + API de consulta | ⏳ Pendente |
| 3 | Autenticação Zero Trust (GitHub OAuth) | ⏳ Pendente |
| 4 | Reflection via Pull Requests | ⏳ Pendente |
| 5 | Skills Corporativas + MCP Server | ⏳ Pendente |
| 6 | Heartbeat + Proatividade | ⏳ Pendente |

Detalhes completos no [PRD](docs/PRD.md).
