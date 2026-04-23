# Banco de Dados — PostgreSQL

O Second Brain Hub usa PostgreSQL 16 como banco relacional principal. O schema é gerenciado pelo SQLAlchemy com criação automática de tabelas via `init_db()` no startup da aplicação.

**Database:** `secondbrain`
**Driver:** `asyncpg` (I/O assíncrono)
**ORM:** SQLAlchemy 2.x com `DeclarativeBase` e `Mapped` (type hints nativos)

---

## Tabelas

### `users`

Armazena os desenvolvedores autenticados via GitHub OAuth.

| Coluna                    | Tipo                  | Constraints          | Descrição                                                    |
|---------------------------|----------------------|----------------------|--------------------------------------------------------------|
| `id`                      | UUID                 | PK, default uuid4    | Identificador interno do usuário                             |
| `github_id`               | INTEGER              | NOT NULL, UNIQUE     | ID numérico do GitHub (imutável)                             |
| `github_login`            | VARCHAR(255)         | NOT NULL             | Username do GitHub (`dioliveira07`)                          |
| `access_token_encrypted`  | TEXT                 | NOT NULL             | Access token OAuth criptografado com Fernet                  |
| `repos_allowed`           | JSONB                | default `[]`         | Lista de `full_name` dos repos acessíveis pelo usuário       |
| `proactivity_level`       | VARCHAR(20)          | default `"advisor"`  | Nível de proatividade: `advisor`, `passive`, `proactive`     |
| `created_at`              | TIMESTAMP WITH TZ    | default now()        | Data de criação do registro                                  |
| `updated_at`              | TIMESTAMP WITH TZ    | default now()        | Data da última atualização                                   |

**Relacionamentos:** nenhum (entidade raiz).

**Notas:**
- A chave de busca para upsert é `github_id` (único por usuário GitHub)
- O token é descriptografado em memória apenas quando necessário (refresh de permissões)
- `repos_allowed` é atualizado no login e pela task `refresh_all_permissions` (a cada hora)

---

### `indexed_repos`

Registra os repositórios GitHub indexados no Hub, com status do processo e metadados extraídos.

| Coluna              | Tipo               | Constraints          | Descrição                                                        |
|---------------------|--------------------|----------------------|------------------------------------------------------------------|
| `id`                | UUID               | PK, default uuid4    | Identificador interno                                            |
| `github_full_name`  | VARCHAR(255)       | NOT NULL, UNIQUE     | Nome completo do repo (`org/repo`)                               |
| `last_indexed_at`   | TIMESTAMP WITH TZ  | nullable             | Data/hora da última indexação bem-sucedida                       |
| `last_commit_sha`   | VARCHAR(40)        | nullable             | SHA do último commit indexado (reservado para otimização futura) |
| `indexing_status`   | VARCHAR(20)        | default `"pending"`  | Estado atual: `pending`, `indexing`, `done`, `error`             |
| `config`            | JSONB              | default `{}`         | Configurações específicas do repo (extensível)                   |
| `summary`           | TEXT               | nullable             | Resumo arquitetural em Markdown (gerado por Claude Haiku ou fallback) |
| `detected_stack`    | JSONB              | nullable             | `{ "languages": [...], "frameworks": [...], "infra": [...] }`   |
| `directory_map`     | JSONB              | nullable             | Árvore de diretórios com anotações semânticas                    |
| `created_at`        | TIMESTAMP WITH TZ  | default now()        | Data de criação do registro                                      |

**Relacionamentos:**
- `decisions` → lista de `ArchitecturalDecision` (via FK `repo_id`)
- `logs` → lista de `IndexingLog` (via FK `repo_id`)

**Notas:**
- A chave de busca para upsert é `github_full_name`
- `detected_stack` é populado pelo `repo_analyzer.detect_stack()`
- `directory_map` é a saída de `repo_analyzer.map_directory()` (árvore JSON recursiva)
- `summary` pode conter Markdown estruturado com até ~1024 tokens (limitado pelo Haiku)

---

### `architectural_decisions`

Registra decisões técnicas capturadas automaticamente de PRs mergeados via webhook GitHub.

| Coluna            | Tipo               | Constraints       | Descrição                                                           |
|-------------------|--------------------|-------------------|---------------------------------------------------------------------|
| `id`              | UUID               | PK, default uuid4 | Identificador interno                                               |
| `repo_id`         | UUID               | FK → indexed_repos.id | Repo ao qual a decisão pertence                                |
| `pr_number`       | INTEGER            | NOT NULL          | Número do PR no GitHub                                              |
| `pr_title`        | TEXT               | nullable          | Título do PR                                                        |
| `pr_author`       | VARCHAR(255)       | nullable          | Username GitHub do autor do PR                                      |
| `summary`         | TEXT               | NOT NULL          | Primeiros 1000 chars do documento de decisão gerado                 |
| `impact_areas`    | JSONB              | default `[]`      | Áreas impactadas: `["auth", "api", "database", "infra", "tests", "docs"]` |
| `breaking_changes`| BOOLEAN            | default false     | Se o PR contém breaking changes (detectado por palavras-chave)      |
| `qdrant_point_id` | VARCHAR(255)       | nullable          | UUID do ponto na coleção `architectural_decisions` do Qdrant        |
| `merged_at`       | TIMESTAMP WITH TZ  | nullable          | Data/hora do merge do PR                                            |
| `created_at`      | TIMESTAMP WITH TZ  | default now()     | Data de criação do registro no banco                                |

**Relacionamentos:**
- `repo` → `IndexedRepo` (via FK `repo_id`)

**Notas:**
- Criado pelo `reflection.process_pr()` quando o webhook recebe `pull_request.closed` + `merged=true`
- `impact_areas` é inferido dos paths dos arquivos alterados no PR (ex: arquivos em `auth/` → `"auth"`)
- `breaking_changes` detectado por palavras como: `breaking`, `break change`, `incompatible`, `remove`, `deprecated`, `major`
- O documento completo (com diff) fica no Qdrant; o banco armazena apenas os primeiros 1000 chars como `summary`
- `qdrant_point_id` permite recuperar o documento completo do Qdrant se necessário

---

### `indexing_log`

Histórico de cada execução do pipeline de indexação.

| Coluna            | Tipo               | Constraints       | Descrição                                                    |
|-------------------|--------------------|-------------------|--------------------------------------------------------------|
| `id`              | UUID               | PK, default uuid4 | Identificador do log                                         |
| `repo_id`         | UUID               | FK → indexed_repos.id | Repo indexado                                            |
| `trigger`         | VARCHAR(20)        | NOT NULL          | Origem: `"manual"`, `"push"`, `"webhook"`, `"scheduled"`     |
| `files_processed` | INTEGER            | default 0         | Quantidade de arquivos lidos e chunkados                     |
| `chunks_created`  | INTEGER            | default 0         | Quantidade de chunks inseridos no Qdrant                     |
| `duration_ms`     | INTEGER            | nullable          | Duração total do pipeline em milissegundos                   |
| `status`          | VARCHAR(20)        | default `"running"`| Estado: `"running"`, `"done"`, `"error"`                    |
| `error_message`   | TEXT               | nullable          | Mensagem de erro (quando `status="error"`)                   |
| `created_at`      | TIMESTAMP WITH TZ  | default now()     | Início da execução                                           |

**Relacionamentos:**
- `repo` → `IndexedRepo` (via FK `repo_id`)

**Notas:**
- Um log é criado no início do pipeline (`status="running"`) e atualizado ao final
- `chunks_created` soma todos os pontos inseridos no Qdrant naquela execução (usado pelo endpoint `/stats/overview` para calcular `chunks_total`)
- A consulta `SUM(chunks_created) WHERE status="done"` é cacheada por 20s no endpoint de stats

---

### `notifications`

Notificações proativas geradas pelo `heartbeat_check` (PRs parados, conflitos, etc.) ou por qualquer serviço interno.

| Coluna       | Tipo               | Constraints       | Descrição                                                             |
|--------------|--------------------|-------------------|-----------------------------------------------------------------------|
| `id`         | UUID               | PK, default uuid4 | Identificador da notificação                                          |
| `user_id`    | UUID               | nullable          | Usuário destinatário (`None` = broadcast para todos)                  |
| `type`       | VARCHAR(50)        | NOT NULL          | Tipo: `"stale_pr"`, `"dependency_conflict"`, `"outdated_docs"`        |
| `repo`       | VARCHAR(255)       | nullable          | Repo relacionado (ex: `"org/api"`)                                    |
| `message`    | TEXT               | NOT NULL          | Mensagem legível para o usuário                                       |
| `metadata`   | JSONB              | default `{}`      | Dados extras (ex: `{"pr_number": 12, "days_open": 5}`) — coluna SQL: `metadata` |
| `read`       | BOOLEAN            | default false     | Se a notificação foi marcada como lida                                |
| `created_at` | TIMESTAMP WITH TZ  | default now()     | Data de criação                                                       |

**Relacionamentos:** nenhum (tabela independente).

**Notas:**
- O campo Python se chama `extra_data`, mas o nome da coluna SQL é `metadata` (mapeamento via `mapped_column("metadata", ...)`)
- Deduplicação no `heartbeat_check`: antes de inserir uma notificação `stale_pr`, verifica se já existe uma não lida para aquele (`repo`, `pr_number`)
- A API retorna o campo como `"metadata"` no JSON da resposta

---

## Diagrama de relacionamentos

```
users
  │ (sem FK para outras tabelas)

indexed_repos ──────────────────────────────┐
  │ id (PK)                                 │
  │                                         │
  ├──< architectural_decisions              │
  │     id (PK)                             │
  │     repo_id (FK → indexed_repos.id)     │
  │                                         │
  └──< indexing_log                         │
        id (PK)                             │
        repo_id (FK → indexed_repos.id) ───┘

notifications (standalone)
  user_id → users.id (nullable, sem FK formal)
```

---

## Inicialização do schema

O schema é criado automaticamente no startup via:

```python
# app/db/session.py
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

Não há migrations Alembic configuradas na versão atual — todas as alterações de schema requerem `DROP TABLE` ou `ALTER TABLE` manual, ou a adição de Alembic ao projeto.
