# Indexação de Repositórios

A indexação é o processo central do Second Brain Hub: transforma código-fonte bruto em vetores semânticos pesquisáveis no Qdrant, com metadados estruturados no PostgreSQL.

---

## Visão geral do fluxo

```
Trigger (push / manual / webhook)
        │
        ▼
  hub-api recebe requisição
        │
        ▼ (Celery .delay())
  Redis (broker) — fila Celery
        │
        ▼
  celery-worker executa index_repo_task
        │
        ├─ 1. Clone / pull do repo (git, depth=1)
        │       → /data/repos/org_repo (volume git-mirrors)
        │
        ├─ 2. Análise do repo (repo_analyzer)
        │       → detect_stack()       → detected_stack (JSONB)
        │       → map_directory()      → directory_map (JSONB)
        │       → identify_key_files() → lista de arquivos priorizados
        │       → generate_summary()   → texto (Claude Haiku ou fallback)
        │
        ├─ 3. Persiste metadados no PostgreSQL
        │       → IndexedRepo.indexing_status = "indexing"
        │       → IndexingLog (trigger, status="running")
        │
        ├─ 4. Chunking dos key_files (chunker)
        │       → chunk_markdown / chunk_python / chunk_typescript / chunk_config
        │       → Cada chunk tem: content, file_path, language, semantic_role,
        │                         symbol_name, chunk_index, repo, stack_context
        │
        ├─ 5. Embeddings + ingestão Qdrant (batch de 25)
        │       → embed_texts(texts) → fastembed BAAI/bge-small-en-v1.5 (384d)
        │       → qdrant.upsert(collection="company_knowledge", points=[...])
        │
        └─ 6. Finalização
                → IndexedRepo.indexing_status = "done"
                → IndexedRepo.last_indexed_at = now()
                → IndexingLog.status = "done", files_processed, chunks_created, duration_ms
```

---

## Tipos de trigger

| Trigger  | Origem                                   | Como funciona                                                    |
|----------|------------------------------------------|------------------------------------------------------------------|
| `push`   | Webhook GitHub (evento `push`)           | Qualquer push na branch default dispara `index_repo_task.delay()`|
| `manual` | `POST /api/v1/index/repo`                | Dev ou script chama a API diretamente                            |
| `webhook`| Webhook GitHub (outros eventos)          | Apenas `push` e `pull_request` são tratados atualmente           |

O trigger ficará registrado no campo `trigger` da tabela `indexing_log` (`"manual"` para chamadas diretas — o campo ainda não diferencia webhook de push, ambos chegam como `"manual"` no log atual).

---

## Etapa 1: Clone / Pull

O `github_client.clone_repo()` usa `git clone --depth=1` com o token PAT embutido na URL HTTPS:

```
https://<GITHUB_PAT>@github.com/org/repo.git
```

Se o diretório já existe (re-indexação), faz `git fetch --depth=1 origin HEAD` seguido de `git reset --hard FETCH_HEAD` — garantindo que o working tree está no HEAD sem histórico desnecessário.

O repo é clonado em `/data/repos/org_repo` (underline substituindo a barra) no volume Docker `git-mirrors`.

---

## Etapa 2: Análise do repositório

O `repo_analyzer.analyze_repo()` orquestra quatro funções:

### `detect_stack()`

Varre todos os arquivos do repo e cruza com `STACK_MARKERS` (arquivo → tecnologia):
- `package.json` → Node.js
- `tsconfig.json` → TypeScript
- `requirements.txt` / `pyproject.toml` → Python
- `Dockerfile` → Docker
- `alembic.ini` → Alembic (SQL Migrations)
- etc.

Também lê `package.json` (dependencies + devDependencies) para detectar frameworks JS/TS (React, Next.js, Prisma, tRPC, Drizzle, etc.) e `requirements.txt` / `pyproject.toml` para frameworks Python (FastAPI, Django, SQLAlchemy, Celery, etc.).

Retorna: `{ "languages": [...], "frameworks": [...], "infra": [...] }`

### `map_directory()`

Gera uma árvore recursiva de diretórios com anotações semânticas baseadas em `SEMANTIC_ROLES`:

| Role         | Padrões de path                                         |
|--------------|---------------------------------------------------------|
| `entrypoint` | `main.py`, `app.py`, `index.ts`, `server.js`, etc.      |
| `routes`     | `routes/`, `routers/`, `controllers/`, `api/`, `endpoints/` |
| `models`     | `models/`, `schemas/`, `entities/`, `types/`            |
| `middleware` | `middleware/`, `middlewares/`                           |
| `config`     | `config/`, `settings/`, `.env.example`, `Dockerfile`   |
| `migrations` | `migrations/`, `alembic/versions/`                     |
| `tests`      | `tests/`, `test/`, `__tests__/`, `spec/`                |
| `docs`       | `docs/`, `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`|
| `ci_cd`      | `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`  |
| `infra`      | `terraform/`, `infra/`, `deploy/`, `k8s/`, `helm/`     |

Diretórios ignorados (`SKIP_PATTERNS`): `node_modules/`, `.git/`, `__pycache__/`, `.venv/`, `dist/`, `build/`, `.next/`, `target/`, `vendor/`, arquivos `*.min.js`, `*.map`, `*.lock`.

### `identify_key_files()`

Prioriza arquivos por role (entrypoints primeiro, testes por último) e filtra arquivos > 500KB. Retorna no máximo 1000 arquivos ordenados por prioridade.

### `generate_summary()`

Lê até 50KB dos arquivos-chave (pelos mais prioritários) e:
- **Com `ANTHROPIC_API_KEY`:** chama `claude-haiku-4-5` com prompt estruturado pedindo resposta em 6 seções: Stack, Padrão Arquitetural, Autenticação, Deploy, Pontos de Entrada, Dependências Externas
- **Sem chave:** gera resumo estático com os dados detectados automaticamente

---

## Etapa 4: Chunking

O chunker divide os arquivos em pedaços semânticos com overlap de ~800 chars (~200 tokens) entre chunks consecutivos para preservar contexto nas fronteiras.

| Tipo de arquivo          | Estratégia                                        |
|--------------------------|---------------------------------------------------|
| `.md`, `.mdx`            | Por seção h1/h2/h3                               |
| `.py`                    | Por função/classe (AST → fallback regex)          |
| `.ts`, `.tsx`, `.js`     | Por function/class/interface/type/enum (regex)    |
| `.json`, `.yaml`, `.toml`, `.env` | Arquivo inteiro como 1 chunk           |
| Demais                   | Arquivo inteiro (fallback config-style)           |

Cada chunk carrega os seguintes metadados:

| Campo           | Descrição                                                    |
|-----------------|--------------------------------------------------------------|
| `repo`          | Nome completo do repo (`org/repo`)                           |
| `file_path`     | Caminho relativo do arquivo no repo                          |
| `file_type`     | Tipo do arquivo (`python`, `typescript`, `markdown`, etc.)   |
| `language`      | Linguagem de programação                                     |
| `semantic_role` | Papel do arquivo (`routes`, `models`, `entrypoint`, etc.)    |
| `symbol_name`   | Nome da função ou classe (vazio para configs/docs)           |
| `chunk_index`   | Índice sequencial do chunk dentro do arquivo                 |
| `stack_context` | String com a stack do repo (para filtragem futura)           |
| `content`       | Texto completo do chunk (armazenado no payload do Qdrant)    |

---

## Etapa 5: Embeddings e Qdrant

Os textos dos chunks são convertidos em vetores de 384 dimensões usando o modelo `BAAI/bge-small-en-v1.5` via `fastembed`. O processamento é feito em batches de 25 chunks para evitar OOM.

Os vetores são inseridos na coleção `company_knowledge` do Qdrant com `upsert` (idempotente — re-indexações sobrescrevem pontos existentes pelo UUID gerado na inserção).

**Coleções Qdrant:**
- `company_knowledge` — chunks de código/docs (distance: COSINE, dims: 384)
- `architectural_decisions` — documentos de PRs mergeados (distance: COSINE, dims: 384)

---

## Decisões arquiteturais (pipeline paralelo)

Quando um PR é mergeado, o webhook `pull_request` dispara `process_pr()` de forma **síncrona** (não via Celery):

1. Busca diff completo do PR (truncado em 50KB) via `GET /repos/{repo}/pulls/{pr}`
2. Busca detalhes: título, body, autor, lista de arquivos, review comments (até 20)
3. Monta documento estruturado em Markdown com diff embutido
4. Embeda o documento e insere na coleção `architectural_decisions`
5. Infere `impact_areas` pelos paths dos arquivos alterados (auth, database, api, infra, tests, docs)
6. Detecta `breaking_changes` por palavras-chave no título/body (breaking, remove, deprecated, major, incompatible)
7. Persiste `ArchitecturalDecision` no PostgreSQL

---

## Tarefas agendadas (Celery Beat)

| Tarefa                      | Schedule     | O que faz                                                   |
|-----------------------------|--------------|-------------------------------------------------------------|
| `heartbeat_check`           | a cada 30min | Verifica PRs abertos > 3 dias sem review; gera notificações |
| `refresh_all_permissions`   | a cada hora  | Atualiza `repos_allowed` de todos os usuários via GitHub API|
