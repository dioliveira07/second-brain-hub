# MCP Server — Second Brain Hub

O MCP Server roda **na máquina local do desenvolvedor** e expõe o contexto do Hub como tools nativas do Claude Code. O Claude consegue chamar as tools diretamente durante uma sessão de código sem sair do editor.

---

## Modo de operação

O servidor usa **stdio** (Model Context Protocol padrão): o Claude Code inicia o processo Python como subprocesso e se comunica via stdin/stdout usando o protocolo MCP. Não há porta TCP envolvida na máquina do dev.

O `mcp_server/server.py` se conecta ao hub-api via HTTP (usando `httpx`) para buscar os dados reais. A URL e o token são configurados em `~/.second-brain/config.json`.

```
Claude Code
    │ (stdio / MCP protocol)
    ▼
mcp_server/server.py  (Python, local)
    │ (HTTP/HTTPS)
    ▼
hub-api :8010  (remoto ou local)
    │
    ├── Qdrant (busca vetorial)
    └── PostgreSQL (repos, decisões, notificações)
```

---

## Instalação e configuração

### Automática (recomendado)

```bash
# Clona o repo e roda o script de setup
cd second-brain-hub
./setup-mcp.sh https://hub.fluxiom.com.br [JWT_TOKEN]
```

O script:
1. Instala as dependências `mcp` e `httpx` via pip
2. Cria `~/.second-brain/config.json` com a URL do hub e o token
3. Adiciona (ou cria) a entrada `second-brain-hub` em `~/.claude/settings.json`
4. Reinicie o Claude Code para ativar

### Manual

**1. Instalar dependências:**
```bash
pip install mcp httpx
```

**2. Criar o arquivo de configuração:**
```bash
mkdir -p ~/.second-brain
cat > ~/.second-brain/config.json <<EOF
{
  "hub_url": "https://hub.fluxiom.com.br",
  "token": "seu-jwt-aqui"
}
EOF
```

**3. Adicionar ao `~/.claude/settings.json`:**
```json
{
  "mcpServers": {
    "second-brain-hub": {
      "command": "python3",
      "args": ["/caminho/para/second-brain-hub/mcp_server/server.py"]
    }
  }
}
```

**4. Reiniciar o Claude Code.**

---

## Tools disponíveis

### `search_company_code`

Busca semântica no código e documentação de todos os repos indexados. Combina similaridade vetorial com keyword boost.

**Parâmetros:**

| Nome    | Tipo            | Obrigatório | Descrição                                              |
|---------|-----------------|-------------|--------------------------------------------------------|
| `query` | string          | sim         | Texto livre descrevendo o que buscar                   |
| `repos` | array de strings| não         | Filtrar por repos específicos, ex: `["org/api"]`       |
| `limit` | integer         | não (padrão: 10) | Número máximo de resultados                       |

**O que retorna:**

Texto formatado em Markdown com N resultados, cada um contendo:
- Nome do repo e caminho do arquivo
- Score de relevância (0-1+, maior = mais relevante)
- Papel semântico (`routes`, `models`, `config`, `entrypoint`, etc.)
- Linguagem e nome do símbolo (função ou classe)
- Snippet dos primeiros 500 caracteres do chunk

**Exemplo de uso no Claude Code:**
> "Busca como o JWT é criado e validado no projeto `org/api`"

---

### `get_repo_architecture`

Retorna o resumo arquitetural completo de um repositório: stack detectada, padrão arquitetural, autenticação, deploy e pontos de entrada.

**Parâmetros:**

| Nome  | Tipo   | Obrigatório | Descrição                                       |
|-------|--------|-------------|--------------------------------------------------|
| `repo`| string | sim         | Nome completo do repo, ex: `"org/api"`           |

**O que retorna:**

Texto em Markdown com:
- Cabeçalho `# Arquitetura: org/api`
- Conteúdo do `summary` gerado pelo Claude Haiku durante a indexação (stack, padrão arquitetural, autenticação, deploy, entrypoints, dependências externas)
- JSON da `detected_stack` com campos `languages`, `frameworks` e `infra`

Se o repo não estiver indexado, retorna mensagem orientando a indexar via API.

---

### `get_recent_decisions`

Lista as decisões arquiteturais capturadas automaticamente de PRs mergeados no repositório.

**Parâmetros:**

| Nome    | Tipo    | Obrigatório | Descrição                               |
|---------|---------|-------------|-----------------------------------------|
| `repo`  | string  | sim         | Nome completo do repo                   |
| `limit` | integer | não (padrão: 10) | Quantas decisões retornar          |

**O que retorna:**

Lista formatada com cada decisão contendo:
- Número e título do PR
- Autor e data de merge
- Áreas de impacto (`auth`, `database`, `api`, `infra`, `tests`, `docs`)
- Se tem breaking changes (`true`/`false`)

---

### `list_indexed_repos`

Lista todos os repositórios atualmente indexados no Hub com status e data de última indexação.

**Parâmetros:** nenhum

**O que retorna:**

Lista de repos no formato:
```
**5 repos indexados:**

- `org/api` — status: done | indexado: 2026-04-20T14:30:00Z
- `org/frontend` — status: done | indexado: 2026-04-19T10:00:00Z
- `org/worker` — status: indexing | indexado: nunca
```

---

### `get_notifications`

Retorna notificações proativas geradas pelo heartbeat do Hub: PRs parados sem review, conflitos de dependências, documentação desatualizada.

**Parâmetros:**

| Nome          | Tipo    | Padrão | Descrição                            |
|---------------|---------|--------|--------------------------------------|
| `unread_only` | boolean | true   | Se true, retorna apenas não lidas    |

**O que retorna:**

Lista de notificações no formato:
```
**2 notificações:**

- [stale_pr] PR #12 'fix: timeout' aberto ha 5 dias sem review (repo: org/api)
- [stale_pr] PR #8 'feat: cache' aberto ha 4 dias sem review (repo: org/worker)
```

---

## Arquivo de configuração

`~/.second-brain/config.json`:

```json
{
  "hub_url": "https://hub.fluxiom.com.br",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

- `hub_url`: URL base do hub-api (sem barra final). Padrão: `http://localhost:8010`
- `token`: JWT obtido via `GET /api/v1/auth/callback`. Pode ser vazio para ambientes sem auth.

---

## Troubleshooting

**MCP não aparece no Claude Code:**
- Verifique se o processo `mcp_server/server.py` está sendo encontrado (caminho absoluto no settings.json)
- Rode manualmente para ver erros: `python3 mcp_server/server.py`
- Se `mcp package not installed` aparecer no stderr: `pip install mcp httpx`

**Erro de conexão com o hub:**
- Confirme que `hub_url` em `~/.second-brain/config.json` está acessível da sua máquina
- Teste: `curl http://localhost:8010/health`

**Tool retorna "Repo não está indexado":**
- Indexe o repo via `POST /api/v1/index/repo` com o `github_full_name`
- Aguarde o worker concluir (verifique `docker compose logs celery-worker`)
