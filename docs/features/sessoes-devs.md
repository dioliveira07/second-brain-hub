# Sessões de Desenvolvedores

O Second Brain Hub rastreia a identidade do desenvolvedor ativo em cada sessão de Claude Code por meio de dois mecanismos complementares: o sistema de autenticação via GitHub OAuth e a identificação por sessão via comando `/eu` no Claude Code.

---

## Contexto

O Hub não possui um daemon de monitoramento de processos SSH rodando em background. O rastreamento de sessões é feito de forma leve e sob demanda:

1. **GitHub OAuth** — identifica o dev ao fazer login no hub-api, armazena o perfil GitHub e a lista de repos permitidos
2. **`/eu` no Claude Code** — o dev se identifica manualmente na sessão atual; o hook do Claude Code pode reportar essa identificação ao Hub via MCP
3. **MCP Server** — serve como ponte entre a sessão do Claude Code e o hub-api, carregando contexto personalizado

---

## Autenticação e identidade via GitHub OAuth

### Fluxo de identificação

```
Dev abre o dashboard ou chama /api/v1/auth/login
        │
        ▼
Redirect para GitHub OAuth
  (escopos: read:user, repo)
        │
        ▼ (GitHub redireciona para callback)
GET /api/v1/auth/callback?code=...
        │
        ├─ Troca code por access_token (GitHub API)
        ├─ GET https://api.github.com/user → github_id, github_login
        ├─ GET https://api.github.com/user/repos → lista de repos permitidos
        ├─ Cria/atualiza User no PostgreSQL
        │     access_token criptografado com Fernet (derivado do SECRET_KEY)
        └─ Retorna JWT HS256 (7 dias de validade)
```

### Dados armazenados por dev

O modelo `User` armazena:

| Campo                      | Tipo    | Descrição                                                    |
|----------------------------|---------|--------------------------------------------------------------|
| `id`                       | UUID    | Identificador interno                                        |
| `github_id`                | integer | ID numérico do GitHub (imutável, usado como chave única)     |
| `github_login`             | string  | Username GitHub (`dioliveira07`)                             |
| `access_token_encrypted`   | text    | Access token GitHub criptografado com Fernet                 |
| `repos_allowed`            | JSONB   | Lista de `full_name` dos repos que o dev tem acesso          |
| `proactivity_level`        | string  | Nível de proatividade do assistente (padrão: `"advisor"`)    |

### Permissões por repo

O campo `repos_allowed` é uma lista de strings como `["org/api", "org/frontend"]`. Ele é atualizado:
- No login (sincroniza com GitHub API)
- No `POST /api/v1/auth/refresh-permissions`
- Automaticamente a cada hora pela task `refresh_all_permissions` do Celery Beat

---

## Identificação de sessão no Claude Code

### Comando `/eu`

O Claude Code possui uma skill `/eu` que permite ao dev se identificar na sessão atual:

```
/eu alison
```

Isso registra o nome do dev em memória de sessão, permitindo que hooks e skills personalizem o comportamento do assistente para aquele dev.

### Como o hub recebe o contexto da sessão

O MCP Server atua como intermediário: quando o Claude Code chama uma tool MCP, o `config.json` em `~/.second-brain/` já contém o JWT do dev autenticado. Assim, qualquer chamada ao hub-api via MCP carrega a identidade do dev autenticado no header `Authorization`.

---

## Nível de proatividade

O campo `proactivity_level` no modelo `User` controla o comportamento proativo do assistente:

| Valor      | Comportamento esperado                                        |
|------------|---------------------------------------------------------------|
| `advisor`  | Padrão — sugere, mas espera confirmação                       |
| `passive`  | Apenas responde quando perguntado                             |
| `proactive`| Notifica ativamente sobre problemas detectados                |

O campo é armazenado mas a lógica de uso fica nas skills do Claude Code (não há endpoint de update por enquanto — é editável diretamente no banco ou via painel de admin futuro).

---

## Notificações proativas por dev

O `heartbeat_check` (Celery Beat, a cada 30 min) gera notificações no banco:

```python
Notification(
    user_id=None,      # None = broadcast para todos os devs
    type="stale_pr",
    repo="org/api",
    message="PR #12 'fix: timeout' aberto ha 5 dias sem review",
    extra_data={"pr_number": 12, "days_open": 5}
)
```

Por ora, todas as notificações são `broadcast` (`user_id=None`). A infraestrutura para notificações direcionadas por dev já está no schema (campo `user_id` nullable na tabela `notifications`).

O dev consulta as notificações via:
- Dashboard → seção de notificações
- MCP tool `get_notifications` no Claude Code
- `GET /api/v1/notifications?unread_only=true`

---

## Segurança do token de acesso

O `access_token` GitHub é criptografado com **Fernet** antes de armazenar no PostgreSQL:

```python
# Derivação da chave Fernet a partir do SECRET_KEY
_fernet_key = base64.urlsafe_b64encode(
    hashlib.sha256(settings.secret_key.encode()).digest()
)
_fernet = Fernet(_fernet_key)

# Criptografia
encrypted = _fernet.encrypt(token.encode()).decode()

# Descriptografia (para uso no refresh e clone)
plain = _fernet.decrypt(encrypted.encode()).decode()
```

O token descriptografado é usado apenas em memória, durante operações de refresh de permissões ou chamadas à API GitHub. Nunca é exposto em endpoints.

---

## Fluxo típico de um dev novo

```
1. Dev roda: ./setup-mcp.sh https://hub.fluxiom.com.br
   → ~/.second-brain/config.json criado (sem token ainda)
   → ~/.claude/settings.json atualizado com entrada second-brain-hub

2. Dev abre o dashboard e faz login via GitHub OAuth
   → Recebe JWT no response de /api/v1/auth/callback

3. Dev atualiza ~/.second-brain/config.json com o token recebido

4. Dev reinicia Claude Code
   → MCP tools passam a enviar Authorization: Bearer <jwt>
   → Hub sabe quem é o dev em cada chamada MCP

5. Dev roda /eu alison no Claude Code
   → Sessão identificada localmente no Claude Code também
```
