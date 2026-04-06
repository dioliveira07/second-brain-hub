# PRD — Segundo Cérebro Corporativo (MVP)

## Visão Geral

Sistema multiusuário centralizado que indexa, retém e disponibiliza o conhecimento técnico da empresa a partir dos repositórios GitHub, acessível por qualquer desenvolvedor via Claude Code em seus terminais.

## Arquitetura Macro

```
┌─────────────────────────────────────────────────────────┐
│                    SERVIDOR HUB CENTRAL                  │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐             │
│  │ FastAPI   │  │ Celery   │  │ Webhook   │             │
│  │ REST API  │  │ Workers  │  │ Listener  │             │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘             │
│       │              │              │                    │
│  ┌────▼──────────────▼──────────────▼─────┐             │
│  │           Camada de Serviços            │             │
│  │  • Indexação  • Reflection  • Search    │             │
│  │  • Auth/RBAC  • Heartbeat               │             │
│  └────┬───────────────┬───────────────┬───┘             │
│       │               │               │                  │
│  ┌────▼─────┐  ┌──────▼─────┐  ┌─────▼──────┐          │
│  │ Qdrant   │  │ PostgreSQL │  │ Redis      │          │
│  │ VectorDB │  │ Relacional │  │ Cache/Queue│          │
│  └──────────┘  └────────────┘  └────────────┘          │
│                                                          │
│  ┌──────────────────────────────────┐                   │
│  │ Git Mirror (bare clones locais)  │                   │
│  │ + Repo de Soul/Diretrizes        │                   │
│  └──────────────────────────────────┘                   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS + JWT
          ┌────────────┼────────────┐
          │            │            │
   ┌──────▼──┐  ┌─────▼───┐  ┌────▼────┐
   │ Dev A   │  │ Dev B   │  │ Dev C   │
   │ Claude  │  │ Claude  │  │ Claude  │
   │ Code +  │  │ Code +  │  │ Code +  │
   │ MCP     │  │ MCP     │  │ MCP     │
   └─────────┘  └─────────┘  └─────────┘
```

---

## Fases do MVP

### Fase 1 — Fundação + Indexação Profunda (Semana 1-3)
**Objetivo:** Infraestrutura base e um indexador que entenda repos de verdade, não só o que foi documentado.

#### 1A — Infraestrutura (Semana 1)
- [ ] Repositório `second-brain-hub` estruturado
- [ ] Docker Compose com FastAPI + Qdrant + PostgreSQL + Redis
- [ ] Endpoint de health check (`GET /health`)
- [ ] Modelo de dados inicial no PostgreSQL (tabelas `indexed_repos`, `indexing_log`)
- [ ] Collections criadas no Qdrant (`company_knowledge`, `architectural_decisions`)

#### 1B — Repo Analyzer: Mapeamento Estrutural (Semana 2)
O indexador não lê arquivos cegamente. Ele primeiro **entende o que o repo é**:

- [ ] **Detector de stack**: analisa `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `Dockerfile`, `pom.xml` etc. para classificar o repo (ex: "FastAPI + PostgreSQL + Redis", "Next.js + Prisma")
- [ ] **Mapeador de estrutura**: gera árvore de diretórios com anotações semânticas:
  ```
  src/
    auth/         → módulo de autenticação
    models/       → definições de dados
    routes/       → endpoints da API
  infra/
    docker/       → configuração de containers
    terraform/    → infraestrutura como código
  ```
- [ ] **Identificador de arquivos-chave** por tipo de projeto:
  | Tipo de arquivo | O que revela |
  |---|---|
  | Entrypoints (`main.py`, `index.ts`, `cmd/`) | Como o app inicia, estrutura geral |
  | Rotas/Controllers | Superfície da API, endpoints disponíveis |
  | Models/Schemas | Estrutura de dados, relações entre entidades |
  | Middlewares | Padrões transversais (auth, logging, error handling) |
  | Configs (`docker-compose`, CI/CD, `.env.example`) | Como faz deploy, variáveis necessárias |
  | Migrations | Evolução do schema de banco |
  | Tests (estrutura, não conteúdo) | O que é testado, padrões de teste |
- [ ] **Geração de resumo arquitetural via Claude API**: para cada repo, o analyzer envia os arquivos-chave e pede um resumo estruturado:
  ```
  - Stack: FastAPI 0.104, PostgreSQL 16, Redis 7
  - Padrão: Clean Architecture com camadas service/repository
  - Autenticação: JWT via middleware customizado
  - Deploy: Docker Compose, CI via GitHub Actions
  - Pontos de entrada: POST /api/users, GET /api/products...
  ```
  Este resumo é vetorizado E salvo como documento legível no PostgreSQL.

#### 1C — Pipeline de Indexação Inteligente (Semana 3)
- [ ] **Chunking context-aware**: não corta por tamanho fixo. Respeita limites semânticos:
  - Markdown: chunk por seção (h1/h2/h3)
  - Código Python/TS: chunk por função/classe (AST-based quando possível, regex fallback)
  - Configs: arquivo inteiro como um chunk (geralmente pequenos)
  - Overlap de ~200 tokens entre chunks para manter contexto
- [ ] **Metadata rica por chunk**:
  ```json
  {
    "repo": "org/api-gateway",
    "file_path": "src/auth/middleware.py",
    "file_type": "source_code",
    "language": "python",
    "semantic_role": "middleware",       // novo: o que esse arquivo FAZ
    "stack_context": "FastAPI + JWT",    // novo: stack do repo
    "symbol_name": "AuthMiddleware",     // novo: classe/função do chunk
    "chunk_index": 0,
    "last_commit_sha": "abc123",
    "last_modified": "2026-03-15T10:00:00Z"
  }
  ```
- [ ] **Embedding + ingestão no Qdrant** com a metadata acima
- [ ] **Endpoint `POST /api/v1/index/repo`**: recebe `github_full_name`, faz clone, roda o analyzer, chunka, vetoriza, ingere
- [ ] **Endpoint `GET /api/v1/repos/{repo}/summary`**: retorna o resumo arquitetural gerado
- [ ] **Seed inicial**: indexar 2-3 repos reais da empresa, validar que o resumo e os chunks fazem sentido

#### Por que isso importa
Com essa indexação, quando um dev perguntar *"quero criar um novo serviço seguindo o padrão da empresa"*, o sistema vai retornar:
- O resumo arquitetural dos repos existentes (stack, padrões, estrutura)
- Código real dos entrypoints, rotas e models (não o que alguém escreveu num README)
- Configs de deploy reais (Dockerfile, CI/CD) para copiar como base

**Stack desta fase:** FastAPI, Qdrant, FastEmbed, Claude API (Haiku para resumos), pygit2, Docker Compose

---

### Fase 2 — Busca Semântica + API de Consulta (Semana 3)
**Objetivo:** Devs conseguem buscar conhecimento via API.

**Entregáveis:**
- [ ] Endpoint `POST /api/v1/search` com query semântica
  - Input: `{ "query": "como funciona o auth no projeto X", "repos": ["repo-a"] }`
  - Output: chunks rankeados com score, path de origem, snippet
- [ ] Endpoint `GET /api/v1/repos/{repo}/architecture` — retorna resumo arquitetural gerado
- [ ] Reranking básico: combinar score semântico + keyword match (BM25-like)
- [ ] Testes de qualidade: 10 queries reais, avaliar relevância dos top-5 resultados
- [ ] Rate limiting básico por API key

---

### Fase 3 — Autenticação Zero Trust (Semana 4)
**Objetivo:** Cada dev só acessa repos que tem permissão no GitHub.

**Entregáveis:**
- [ ] GitHub OAuth App configurado
- [ ] Fluxo de login: dev autentica via GitHub, Hub obtém token e lista repos acessíveis
- [ ] Tabela `users` no PostgreSQL: github_id, access_token (encrypted), repos_allowed (cache)
- [ ] Middleware JWT: todo request à API valida token + verifica permissão no repo solicitado
- [ ] Refresh periódico de permissões (Celery task a cada 1h)
- [ ] Endpoint `GET /api/v1/me` — retorna perfil do dev + repos acessíveis
- [ ] Filter no Qdrant por repos permitidos ao buscar (metadata filter nativo)

---

### Fase 4 — Reflection via Pull Requests (Semana 5-6)
**Objetivo:** Memória viva que aprende com cada PR mergeado.

**Entregáveis:**
- [ ] GitHub Webhook listener no Hub (`POST /api/v1/webhooks/github`)
  - Escuta eventos: `pull_request` (action: closed + merged)
- [ ] Pipeline de reflection por PR:
  1. Extrai diff do PR via GitHub API
  2. Extrai título, descrição, review comments
  3. Gera resumo via Claude API: decisões arquiteturais, breaking changes, padrões novos
  4. Armazena resumo como documento no Qdrant (tipo: `architectural_decision`)
  5. Persiste no PostgreSQL para audit trail
- [ ] Endpoint `GET /api/v1/repos/{repo}/decisions` — lista decisões arquiteturais extraídas
- [ ] Re-indexação incremental dos arquivos alterados no PR (atualiza chunks antigos)
- [ ] Signature verification (GitHub webhook secret) para segurança

---

### Fase 5 — Skills Corporativas + MCP Client (Semana 7-8)
**Objetivo:** Claude Code dos devs consulta o Hub nativamente.

**Entregáveis:**
- [ ] MCP Server local (Python) que expõe tools para o Claude Code:
  - `search_company_code(query, repos?)` → chama `POST /api/v1/search`
  - `get_repo_architecture(repo)` → chama `GET /api/v1/repos/{repo}/architecture`
  - `get_recent_decisions(repo, days?)` → chama `GET /api/v1/repos/{repo}/decisions`
  - `who_knows_about(topic)` → retorna devs que mais contribuíram naquele contexto
- [ ] Script de setup: `./setup-mcp.sh` que configura o MCP no Claude Code do dev
- [ ] Autenticação transparente: MCP lê token JWT do dev de `~/.second-brain/config.json`
- [ ] Documentação de uso para a equipe
- [ ] Testes end-to-end: dev faz pergunta no Claude Code, resposta inclui contexto de outro repo

---

### Fase 6 — Heartbeat + Proatividade (Semana 9-10)
**Objetivo:** O Hub monitora e notifica proativamente.

**Entregáveis:**
- [ ] Celery Beat: task periódica (30min) que verifica:
  - PRs abertos há mais de X dias sem review
  - Conflitos de dependência entre repos
  - Docs desatualizados (README com referências a código que mudou)
- [ ] Sistema de notificação: endpoint `GET /api/v1/notifications/{user_id}`
- [ ] MCP tool `get_notifications()` para o Claude Code exibir alertas ao dev
- [ ] Configuração de proatividade por usuário (Observer/Advisor/Assistant/Partner)

---

## Modelo de Dados

### PostgreSQL

```sql
-- Usuários autenticados via GitHub
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id INTEGER UNIQUE NOT NULL,
    github_login VARCHAR(255) NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    repos_allowed JSONB DEFAULT '[]',
    proactivity_level VARCHAR(20) DEFAULT 'advisor',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Repos indexados
CREATE TABLE indexed_repos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_full_name VARCHAR(255) UNIQUE NOT NULL, -- org/repo
    last_indexed_at TIMESTAMPTZ,
    last_commit_sha VARCHAR(40),
    indexing_status VARCHAR(20) DEFAULT 'pending', -- pending, indexing, done, error
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Decisões arquiteturais extraídas de PRs
CREATE TABLE architectural_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id UUID REFERENCES indexed_repos(id),
    pr_number INTEGER NOT NULL,
    pr_title TEXT,
    pr_author VARCHAR(255),
    summary TEXT NOT NULL,
    impact_areas JSONB DEFAULT '[]', -- ["auth", "database", "api"]
    breaking_changes BOOLEAN DEFAULT FALSE,
    qdrant_point_id VARCHAR(255), -- referência ao vetor no Qdrant
    merged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Log de indexações
CREATE TABLE indexing_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id UUID REFERENCES indexed_repos(id),
    trigger VARCHAR(20) NOT NULL, -- manual, webhook, scheduled
    files_processed INTEGER DEFAULT 0,
    chunks_created INTEGER DEFAULT 0,
    duration_ms INTEGER,
    status VARCHAR(20) DEFAULT 'running',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Qdrant Collections

```
Collection: company_knowledge
├── Vectors: 384 dims (bge-small-en-v1.5)
├── Payload (metadata):
│   ├── repo: string          # "org/repo-name"
│   ├── file_path: string     # "docs/architecture.md"
│   ├── file_type: string     # "readme", "docs", "config", "dockerfile"
│   ├── chunk_index: integer  # posição do chunk no arquivo
│   ├── content_type: string  # "code", "documentation", "decision"
│   ├── last_commit_sha: string
│   ├── last_modified: datetime
│   └── language: string      # "python", "typescript", "markdown"
└── Index: HNSW (ef=128, m=16)

Collection: architectural_decisions
├── Vectors: 384 dims
├── Payload:
│   ├── repo: string
│   ├── pr_number: integer
│   ├── pr_author: string
│   ├── impact_areas: string[]
│   ├── breaking_changes: boolean
│   └── merged_at: datetime
└── Index: HNSW
```

---

## Requisitos Não-Funcionais

| Requisito | Target MVP |
|---|---|
| Latência de busca | < 500ms p95 |
| Repos suportados | até 50 |
| Usuários simultâneos | até 20 |
| Disponibilidade | 99% (single node ok para MVP) |
| Segurança | JWT + GitHub OAuth, zero trust per-repo |
| Embedding model | Local (FastEmbed), sem chamada externa |
| Custo de reflection | ~$0.02/PR (1 chamada Claude Haiku por PR) |

---

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Repos muito grandes sobrecarregam indexação | Analyzer prioriza arquivos-chave por papel semântico; código de teste/vendor/node_modules é ignorado. Limite de ~500 arquivos relevantes por repo no MVP |
| Token GitHub expira | Refresh automático via Celery + fallback para re-auth |
| Chunks mal cortados perdem contexto | Usar chunking com overlap (200 tokens overlap) + respeitar limites de seção Markdown |
| Qdrant single point of failure | MVP aceita risco; Fase futura: snapshot + restore automático |
| Custo de Claude API no Reflection | Usar Claude Haiku para resumos de PR (custo mínimo) |
