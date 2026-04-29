# API Reference — hub-api

Base URL: `http://localhost:8010` (ou a URL pública configurada em `HUB_BASE_URL`)

Documentação interativa Swagger: `GET /docs`

---

## Autenticação

A maioria dos endpoints não exige autenticação por padrão na versão atual (a guard `get_current_user` existe mas só é aplicada nos endpoints de auth). O token JWT é obtido via fluxo OAuth GitHub e enviado no header:

```
Authorization: Bearer <jwt_token>
```

O JWT é gerado com HS256 e expira em 7 dias.

---

## Health

### `GET /health`

Verifica se o serviço está respondendo. Sem autenticação.

**Response 200**
```json
{
  "status": "ok",
  "service": "second-brain-hub"
}
```

---

## Auth — `/api/v1/auth`

### `GET /api/v1/auth/login`

Inicia o fluxo OAuth GitHub. Redireciona o navegador para `github.com/login/oauth/authorize` com escopos `read:user,repo`.

**Requer:** `GITHUB_APP_CLIENT_ID` configurado.

**Response:** `302 Redirect` para GitHub.

---

### `GET /api/v1/auth/callback`

Callback OAuth. Recebe o `code` do GitHub, troca pelo access token, cria ou atualiza o usuário no banco (criptografando o token com Fernet), e retorna o JWT da sessão.

**Query params:**
| Param | Tipo   | Descrição            |
|-------|--------|----------------------|
| `code`| string | Código OAuth do GitHub|

**Response 200**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "github_login": "dioliveira07"
}
```

---

### `GET /api/v1/auth/me`

Retorna dados do usuário autenticado.

**Auth:** Bearer JWT obrigatório.

**Response 200**
```json
{
  "id": "uuid",
  "github_login": "dioliveira07",
  "repos_allowed": ["org/repo-a", "org/repo-b"],
  "proactivity_level": "advisor"
}
```

---

### `POST /api/v1/auth/refresh-permissions`

Atualiza a lista de repos acessíveis do usuário consultando a API GitHub com o token armazenado.

**Auth:** Bearer JWT obrigatório.

**Response 200**
```json
{
  "repos_allowed": ["org/repo-a", "org/repo-b"],
  "count": 2
}
```

---

## Indexação — `/api/v1/index`

### `POST /api/v1/index/repo`

Enfileira a indexação completa de um repositório via Celery. Retorna imediatamente — o trabalho real acontece no `celery-worker`.

**Body (JSON)**
```json
{
  "github_full_name": "org/repo-name"
}
```

**Response 200**
```json
{
  "status": "queued",
  "repo": "org/repo-name",
  "message": "Indexação em fila"
}
```

O pipeline executa: clone → análise de stack → mapeamento de diretórios → resumo arquitetural → chunking → embeddings → ingestão no Qdrant.

---

## Busca — `/api/v1/search`

### `POST /api/v1/search`

Busca semântica no código e documentação indexados. Combina similaridade vetorial (Qdrant cosine) com keyword boost simples.

**Body (JSON)**
```json
{
  "query": "como funciona autenticação JWT",
  "repos": ["org/api", "org/auth-service"],
  "limit": 10
}
```

| Campo  | Tipo            | Obrigatório | Descrição                                          |
|--------|-----------------|-------------|---------------------------------------------------|
| `query`| string          | sim         | Texto livre para busca                             |
| `repos`| array de strings| não         | Filtra resultados por repos específicos            |
| `limit`| integer         | não (padrão: 10) | Máximo de resultados                          |

**Response 200**
```json
{
  "query": "como funciona autenticação JWT",
  "results": [
    {
      "score": 0.8921,
      "repo": "org/api",
      "file_path": "app/core/security.py",
      "language": "python",
      "semantic_role": "config",
      "symbol_name": "create_jwt",
      "chunk_index": 2,
      "snippet": "def create_jwt(user_id: str, github_login: str, ..."
    }
  ],
  "total": 5
}
```

O campo `score` é o score cosine do Qdrant somado a um boost proporcional às palavras da query encontradas no chunk (até +0.1).

---

## Repositórios — `/api/v1/repos`

### `GET /api/v1/repos`

Lista todos os repositórios indexados com status e data da última indexação.

**Response 200**
```json
[
  {
    "repo": "org/api",
    "status": "done",
    "last_indexed_at": "2026-04-20T14:30:00Z"
  },
  {
    "repo": "org/frontend",
    "status": "indexing",
    "last_indexed_at": null
  }
]
```

Valores de `status`: `pending`, `indexing`, `done`, `error`.

---

### `GET /api/v1/repos/{owner}/{repo}/summary`

Retorna resumo completo do repositório: stack detectada, mapa de diretórios, resumo arquitetural gerado pelo Claude Haiku (ou fallback estático).

**Path params:** `owner`, `repo`

**Response 200**
```json
{
  "repo": "org/api",
  "summary": "## Stack\nPython, FastAPI...",
  "detected_stack": {
    "languages": ["Python", "TypeScript"],
    "frameworks": ["FastAPI", "SQLAlchemy"],
    "infra": ["Docker", "Docker Compose"]
  },
  "directory_map": { "path": ".", "role": "root", "children": [...] },
  "last_indexed_at": "2026-04-20T14:30:00Z",
  "status": "done"
}
```

**Response 404** se o repo não estiver indexado.

---

### `GET /api/v1/repos/{owner}/{repo}/architecture`

Idêntico ao `/summary` mas sem o campo `status`. Endpoint específico para consumo pelo MCP Server.

**Response 200**
```json
{
  "repo": "org/api",
  "summary": "...",
  "detected_stack": {...},
  "directory_map": {...},
  "last_indexed_at": "2026-04-20T14:30:00Z"
}
```

---

### `GET /api/v1/repos/{owner}/{repo}/decisions`

Lista as decisões arquiteturais capturadas de PRs mergeados, ordenadas da mais recente para a mais antiga.

**Response 200**
```json
{
  "repo": "org/api",
  "decisions": [
    {
      "id": "uuid",
      "pr_number": 42,
      "pr_title": "feat: migrar auth para JWT",
      "pr_author": "dioliveira07",
      "impact_areas": ["auth", "api"],
      "breaking_changes": false,
      "merged_at": "2026-04-15T10:00:00Z",
      "qdrant_point_id": "uuid-do-ponto-no-qdrant"
    }
  ]
}
```

---

## Webhooks — `/api/v1/webhooks`

### `POST /api/v1/webhooks/github`

Endpoint receptor de webhooks do GitHub. Valida a assinatura HMAC SHA-256 com `GITHUB_WEBHOOK_SECRET`.

**Headers obrigatórios:**
| Header                  | Descrição                          |
|-------------------------|------------------------------------|
| `X-Hub-Signature-256`   | `sha256=<hmac>` calculado pelo GitHub|
| `X-GitHub-Event`        | Tipo do evento (`push`, `pull_request`, etc.) |

**Comportamento por evento:**

- **`push`** para a branch default → enfileira `index_repo_task` via Celery
- **`pull_request` com `action=closed` e `merged=true`** → executa `process_pr` sincronamente: busca diff + detalhes via GitHub API, gera embedding do documento de decisão e persiste no Qdrant e PostgreSQL

**Response 200 (push)**
```json
{ "status": "queued", "repo": "org/api", "event": "push" }
```

**Response 200 (PR mergeado)**
```json
{ "status": "processed", "pr_number": 42, "point_id": "uuid", "repo": "org/api" }
```

**Response 200 (evento ignorado)**
```json
{ "status": "ignored", "event": "pull_request" }
```

**Response 401** se a assinatura HMAC for inválida.

---

## Notificações — `/api/v1/notifications`

### `GET /api/v1/notifications`

Lista notificações geradas proativamente pelo `heartbeat_check` (a cada 30 min).

**Query params:**
| Param        | Tipo    | Padrão | Descrição                  |
|--------------|---------|--------|----------------------------|
| `unread_only`| boolean | false  | Filtra apenas não lidas    |
| `limit`      | integer | 50     | Máximo de notificações     |

**Response 200**
```json
[
  {
    "id": "uuid",
    "type": "stale_pr",
    "repo": "org/api",
    "message": "PR #12 'fix: timeout' aberto ha 5 dias sem review",
    "metadata": { "pr_number": 12, "days_open": 5 },
    "read": false,
    "created_at": "2026-04-23T08:00:00Z"
  }
]
```

Tipos conhecidos de notificação: `stale_pr`, `dependency_conflict`, `outdated_docs`.

---

### `PATCH /api/v1/notifications/{notification_id}/read`

Marca uma notificação como lida.

**Path param:** `notification_id` (UUID)

**Response 200**
```json
{ "status": "ok" }
```

---

## Grafo — `/api/v1/graph`

### `GET /api/v1/graph/nodes`

Retorna todos os nós do grafo de conhecimento: repos, tecnologias e desenvolvedores (extraídos dos autores de PRs). O tamanho (`size`) de cada nó é proporcional ao número de chunks indexados ou PRs contribuídos.

**Response 200**
```json
{
  "nodes": [
    {
      "id": "repo:org/api",
      "type": "repo",
      "label": "org/api",
      "size": 25,
      "color": "#3b82f6",
      "data": { "full_name": "org/api", "status": "done", "stack": {...}, "summary": "..." }
    },
    {
      "id": "tech:FastAPI",
      "type": "technology",
      "label": "FastAPI",
      "size": 8,
      "color": "#22c55e",
      "data": { "name": "FastAPI", "repo_count": 3 }
    },
    {
      "id": "dev:dioliveira07",
      "type": "developer",
      "label": "dioliveira07",
      "size": 6,
      "color": "#f97316",
      "data": { "login": "dioliveira07", "pr_count": 4 }
    }
  ],
  "total": 12
}
```

---

### `GET /api/v1/graph/edges`

Retorna as arestas do grafo (sem duplicatas):
- `repo → tech` com tipo `uses_technology`
- `dev → repo` com tipo `contributed`

**Response 200**
```json
{
  "edges": [
    { "source": "repo:org/api", "target": "tech:FastAPI", "type": "uses_technology", "weight": 1 },
    { "source": "dev:dioliveira07", "target": "repo:org/api", "type": "contributed", "weight": 1 }
  ],
  "total": 8
}
```

---

## Stats — `/api/v1/stats`

### `GET /api/v1/stats/overview`

Cards de resumo do sistema. Resposta cacheada em memória por 20 segundos para evitar burst de queries.

**Response 200**
```json
{
  "repos_indexed": 5,
  "chunks_total": 4821,
  "qdrant_points": 4821,
  "decisions_captured": 37,
  "notifications_unread": 2
}
```

---

### `GET /api/v1/stats/activity`

Heatmap de PRs mergeados por repo por semana, nas últimas 12 semanas. Formatado para uso direto em gráficos Recharts.

**Response 200**
```json
{
  "weeks": ["2026-W15", "2026-W16", "..."],
  "repos": ["org/api", "org/frontend"],
  "data": [
    { "week": "2026-W15", "org/api": 3, "org/frontend": 1 },
    { "week": "2026-W16", "org/api": 0, "org/frontend": 2 }
  ]
}
```

---

### `GET /api/v1/stats/timeline`

Últimas 50 decisões arquiteturais ordenadas por data de merge, com metadados do PR e do repo.

**Response 200**
```json
{
  "decisions": [
    {
      "id": "uuid",
      "repo": "org/api",
      "pr_number": 42,
      "pr_title": "feat: migrar auth para JWT",
      "pr_author": "dioliveira07",
      "impact_areas": ["auth", "api"],
      "breaking_changes": false,
      "merged_at": "2026-04-15T10:00:00Z"
    }
  ]
}
```
