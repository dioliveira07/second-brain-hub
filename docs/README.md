# Second Brain Hub

Plataforma central de inteligência para times de desenvolvimento. O Hub indexa repositórios GitHub, armazena decisões arquiteturais capturadas de PRs mergeados, monitora notificações proativas (PRs parados, docs desatualizados) e serve todo esse contexto via MCP (Model Context Protocol) diretamente para o Claude Code — eliminando o tempo que o dev gasta reaprendendo o código da empresa a cada sessão.

---

## Por que existe

Times que crescem acumulam conhecimento tácito espalhado em PRs, Slack e cabeças individuais. O Second Brain Hub centraliza esse conhecimento de forma semântica e pesquisável: qualquer dev (ou o Claude) consegue perguntar "como autenticação funciona no `org/api`?" e receber trechos de código reais com contexto de quando e por que foram escritos assim.

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                        GITHUB                                   │
│   push / pull_request (webhook) ─────────────────────────┐     │
└──────────────────────────────────────────────────────────┼─────┘
                                                           │
                    ┌──────────────────────────────────────▼──────┐
                    │              hub-api  :8010                 │
                    │   FastAPI / Python 3.12                     │
                    │                                             │
                    │  /api/v1/auth          /api/v1/search       │
                    │  /api/v1/index         /api/v1/repos        │
                    │  /api/v1/webhooks      /api/v1/notifications│
                    │  /api/v1/graph         /api/v1/stats        │
                    └──┬────────────┬────────────────────────┬───┘
                       │            │                        │
              enfileira │     lê/escreve                lê/escreve
                       │            │                        │
          ┌────────────▼──┐  ┌──────▼──────┐    ┌───────────▼──────┐
          │ celery-worker │  │  PostgreSQL  │    │     Qdrant       │
          │ (indexação)   │  │  :5432       │    │   :6333          │
          │               │  │             │    │                  │
          │ index_repo    │  │ users        │    │ company_knowledge│
          │ heartbeat     │  │ indexed_repos│    │ architectural_   │
          │ refresh_perms │  │ arch_decs    │    │ decisions        │
          └──────────┬────┘  │ indexing_log │    └──────────────────┘
                     │       │ notifications│
          ┌──────────▼────┐  └─────────────┘
          │ celery-beat   │
          │ (agendamentos)│
          └───────────────┘

          ┌───────────────────────────────┐
          │       dashboard  :3010        │
          │  Next.js 15 / React 19        │
          │                               │
          │  / (overview)  /repos         │
          │  /graph        /timeline      │
          │  /activity     /playbook      │
          └───────────────────────────────┘

          ┌───────────────────────────────┐
          │       mcp-server              │
          │  Roda na máquina do dev       │
          │  stdio → Claude Code          │
          │                               │
          │  search_company_code          │
          │  get_repo_architecture        │
          │  get_recent_decisions         │
          │  list_indexed_repos           │
          │  get_notifications            │
          └───────────────────────────────┘
```

---

## Stack completa

| Componente       | Tecnologia                              | Versão         |
|------------------|-----------------------------------------|----------------|
| hub-api          | Python + FastAPI + uvicorn              | Python 3.12    |
| ORM              | SQLAlchemy (async) + asyncpg            | SQLAlchemy 2.x |
| Task queue       | Celery + Redis broker                   | Celery 5.x     |
| Agendamento      | Celery Beat                             | —              |
| Banco relacional | PostgreSQL                              | 16-alpine      |
| Banco vetorial   | Qdrant                                  | v1.12.4        |
| Cache/broker     | Redis                                   | 7-alpine       |
| Embeddings       | fastembed (BAAI/bge-small-en-v1.5)      | dims=384       |
| Resumos via IA   | Claude Haiku 4.5 (Anthropic SDK)        | opcional       |
| Autenticação     | GitHub OAuth + JWT HS256 + Fernet       | —              |
| Dashboard        | Next.js 15 + React 19 + Tailwind CSS    | Node.js 20+    |
| MCP Server       | Python mcp + httpx                      | stdio          |
| Containerização  | Docker + Docker Compose                 | v3.9           |

---

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

### Hub API

| Variável               | Descrição                                                 | Exemplo / Padrão                         |
|------------------------|-----------------------------------------------------------|------------------------------------------|
| `HUB_HOST`             | Interface de bind do uvicorn                              | `0.0.0.0`                                |
| `HUB_PORT`             | Porta interna do uvicorn                                  | `8000`                                   |
| `HUB_ENV`              | Ambiente (`development` ou `production`)                  | `production`                             |
| `SECRET_KEY`           | Chave para JWT HS256 e derivação Fernet                   | `openssl rand -hex 32`                   |
| `HUB_BASE_URL`         | URL pública do hub (usada no OAuth callback)              | `http://localhost:8010`                  |

### PostgreSQL

| Variável            | Descrição                      | Padrão        |
|---------------------|-------------------------------|----------------|
| `POSTGRES_HOST`     | Host do banco                  | `postgres`     |
| `POSTGRES_PORT`     | Porta                          | `5432`         |
| `POSTGRES_DB`       | Nome do banco                  | `secondbrain`  |
| `POSTGRES_USER`     | Usuário                        | `sbuser`       |
| `POSTGRES_PASSWORD` | Senha                          | —              |
| `DATABASE_URL`      | DSN completo (asyncpg)         | derivado acima |

### Qdrant

| Variável       | Padrão   |
|----------------|----------|
| `QDRANT_HOST`  | `qdrant` |
| `QDRANT_PORT`  | `6333`   |

### Redis

| Variável    | Padrão                      |
|-------------|------------------------------|
| `REDIS_HOST`| `redis`                      |
| `REDIS_PORT`| `6379`                       |
| `REDIS_URL` | `redis://redis:6379/0`       |

### GitHub

| Variável                   | Descrição                                                          |
|----------------------------|--------------------------------------------------------------------|
| `GITHUB_APP_CLIENT_ID`     | Client ID do OAuth App (github.com/settings/developers)           |
| `GITHUB_APP_CLIENT_SECRET` | Client Secret do OAuth App                                         |
| `GITHUB_WEBHOOK_SECRET`    | Secret HMAC para validar payloads de webhook                       |
| `GITHUB_PAT`               | Personal Access Token para clonar repos e chamar API GitHub        |

### Claude / Embeddings

| Variável              | Descrição                                                            | Padrão                   |
|-----------------------|----------------------------------------------------------------------|--------------------------|
| `ANTHROPIC_API_KEY`   | API Key Anthropic (opcional — habilita resumos arquiteturais via IA) | `sk-ant-...`             |
| `EMBEDDING_MODEL`     | Modelo de embeddings (fastembed)                                     | `BAAI/bge-small-en-v1.5` |
| `EMBEDDING_DIMENSIONS`| Dimensões do vetor                                                   | `384`                    |

### Dashboard (Next.js)

| Variável                   | Descrição                                    |
|----------------------------|----------------------------------------------|
| `NEXTAUTH_URL`             | URL pública do dashboard (com `/painel`)     |
| `NEXTAUTH_SECRET`          | Secret NextAuth                              |
| `GITHUB_APP_CLIENT_ID`     | Mesmo OAuth App do hub-api                   |
| `GITHUB_APP_CLIENT_SECRET` | Mesmo OAuth App do hub-api                   |

---

## Como rodar localmente com Docker Compose

```bash
# 1. Clone o repositório
git clone https://github.com/dioliveira07/second-brain-hub.git
cd second-brain-hub

# 2. Configure o ambiente
cp .env.example .env
# edite .env com suas credenciais reais

# 3. Suba todos os serviços
docker compose up -d

# 4. Verifique os logs
docker compose logs -f hub-api
docker compose logs -f celery-worker
```

Os serviços sobem na seguinte ordem (via healthchecks): Qdrant → PostgreSQL → Redis → hub-api + celery-worker + celery-beat → dashboard.

### Registrar webhooks nos seus repos GitHub

```bash
./register-webhooks.sh https://seu-hub.com
# Lê GITHUB_PAT e GITHUB_WEBHOOK_SECRET do .env automaticamente
```

### Configurar o MCP no Claude Code

```bash
./setup-mcp.sh https://seu-hub.com [JWT_TOKEN]
# Edita ~/.claude/settings.json automaticamente
# Reinicie o Claude Code para ativar
```

---

## URLs dos serviços

| Serviço        | URL local                      | Porta host |
|----------------|-------------------------------|------------|
| hub-api        | http://localhost:8010          | 8010       |
| hub-api docs   | http://localhost:8010/docs     | 8010       |
| dashboard      | http://localhost:3010/painel   | 3010       |
| Qdrant UI      | http://localhost:6333/dashboard| 6333       |
| PostgreSQL     | localhost:5432                 | 5432       |
| Redis          | localhost:6379                 | 6379       |
