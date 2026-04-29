"""
MCP Server — Second Brain Hub
Dois modos:
  - stdio (padrão): lançado pelo Claude Code localmente
  - http  (--http): servidor centralizado, múltiplos clientes via HTTP

Uso:
  stdio: python3 server.py
  HTTP:  python3 server.py --http [--port 8020]
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import httpx

PROJETOS_DIR = {
    "fluxionai":   "/opt/fluxionai",
    "garimpo":     "/root/garimpo",
    "autoconect":  "/opt/supabase",
    "backend":     "/root/backend",
    "bug-tracker": "/opt/bug-tracker",
    "cotacao":     "/opt/cotacao-inteligente-crm",
}

try:
    from mcp.server import Server
    from mcp import types
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False


CONFIG_PATH = Path.home() / ".second-brain" / "config.json"
DEFAULT_HUB_URL = "http://localhost:8010"
PUBLIC_HUB_URL  = "https://hub.fluxiom.com.br"


def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    # Em modo HTTP centralizado, o hub está na mesma VPS
    hub_url = os.environ.get("HUB_API_URL", DEFAULT_HUB_URL)
    return {"hub_url": hub_url, "token": ""}


def get_headers(config: dict) -> dict:
    headers = {"Content-Type": "application/json"}
    if config.get("token"):
        headers["Authorization"] = f"Bearer {config['token']}"
    hub_key = os.environ.get("HUB_API_KEY", "").strip()
    if not hub_key:
        key_file = Path.home() / ".claude" / "hub_api_key"
        try:
            hub_key = key_file.read_text().strip()
        except Exception:
            pass
    if hub_key:
        headers["X-Hub-Key"] = hub_key
    return headers


def _run(cmd, cwd=None):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=3, cwd=cwd)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def _get_alerts_local() -> str:
    alertas = []
    for nome, proj_dir in PROJETOS_DIR.items():
        if not os.path.exists(os.path.join(proj_dir, ".git")):
            continue
        status = _run(["git", "status", "--porcelain"], cwd=proj_dir)
        if status:
            n = len([l for l in status.splitlines() if l.strip()])
            alertas.append(f"[{nome}] {n} arquivo(s) não commitado(s)")
    try:
        jlist = _run(["pm2", "jlist"])
        if jlist:
            for p in json.loads(jlist):
                s = p.get("pm2_env", {}).get("status", "online")
                if s != "online":
                    alertas.append(f"[pm2] {p.get('name','?')} está {s}")
    except Exception:
        pass
    if not alertas:
        return "Nenhum alerta. Todos os projetos estão limpos."
    return "**Alertas:**\n" + "\n".join(f"- {a}" for a in alertas)


if not MCP_AVAILABLE:
    print("mcp package not installed. Run: pip install mcp", file=sys.stderr)
    sys.exit(1)


# ── Definição do servidor MCP ──────────────────────────────────────────────────

app = Server("second-brain-hub")


@app.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="search_company_code",
            description="Busca semântica no código e documentação dos repositórios da empresa",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "O que você quer buscar"},
                    "repos": {"type": "array", "items": {"type": "string"}, "description": "Filtrar por repos específicos (ex: ['org/repo'])"},
                    "limit": {"type": "integer", "default": 10, "description": "Número máximo de resultados"},
                },
                "required": ["query"],
            },
        ),
        types.Tool(
            name="get_repo_architecture",
            description="Retorna o resumo arquitetural de um repositório (stack, estrutura, entrypoints)",
            inputSchema={
                "type": "object",
                "properties": {
                    "repo": {"type": "string", "description": "Nome completo do repo (ex: 'org/repo-name')"},
                },
                "required": ["repo"],
            },
        ),
        types.Tool(
            name="get_recent_decisions",
            description="Lista decisões arquiteturais extraídas de PRs mergeados",
            inputSchema={
                "type": "object",
                "properties": {
                    "repo": {"type": "string", "description": "Nome completo do repo"},
                    "limit": {"type": "integer", "default": 10},
                },
                "required": ["repo"],
            },
        ),
        types.Tool(
            name="list_indexed_repos",
            description="Lista todos os repositórios indexados no Hub",
            inputSchema={"type": "object", "properties": {}},
        ),
        types.Tool(
            name="get_notifications",
            description="Retorna notificações proativas do Hub (PRs sem review, docs desatualizados, etc.)",
            inputSchema={
                "type": "object",
                "properties": {
                    "unread_only": {"type": "boolean", "default": True},
                },
            },
        ),
        types.Tool(
            name="get_alerts",
            description="Retorna alertas locais: projetos com mudanças não commitadas, serviços pm2 com erro",
            inputSchema={"type": "object", "properties": {}},
        ),
        types.Tool(
            name="get_session_context",
            description="Retorna contexto da sessão atual de um projeto: branch, commits recentes, arquivos modificados",
            inputSchema={
                "type": "object",
                "properties": {
                    "projeto": {"type": "string", "description": "Nome do projeto (ex: cotacao, garimpo)"},
                },
                "required": ["projeto"],
            },
        ),
        types.Tool(
            name="get_project_status",
            description="Snapshot consolidado de um projeto: git status, pm2, afinidade de devs",
            inputSchema={
                "type": "object",
                "properties": {
                    "projeto": {"type": "string", "description": "Nome do projeto"},
                },
                "required": ["projeto"],
            },
        ),
        types.Tool(
            name="get_repo_file",
            description="Retorna o conteúdo de um arquivo de um repo indexado. Para imagens retorna a URL de download.",
            inputSchema={
                "type": "object",
                "properties": {
                    "owner": {"type": "string", "description": "Dono do repo (ex: dioliveira07)"},
                    "repo":  {"type": "string", "description": "Nome do repo (ex: cotacao-inteligente-crm)"},
                    "path":  {"type": "string", "description": "Caminho do arquivo dentro do repo (ex: src/index.ts)"},
                },
                "required": ["owner", "repo", "path"],
            },
        ),
        types.Tool(
            name="download_repo_path",
            description="Gera URL de download ZIP de uma pasta ou arquivo de um repo indexado. path vazio = repo inteiro.",
            inputSchema={
                "type": "object",
                "properties": {
                    "owner": {"type": "string", "description": "Dono do repo (ex: dioliveira07)"},
                    "repo":  {"type": "string", "description": "Nome do repo (ex: bugs-repo)"},
                    "path":  {"type": "string", "description": "Subpath da pasta/arquivo (vazio = repo inteiro)", "default": ""},
                },
                "required": ["owner", "repo"],
            },
        ),
        types.Tool(
            name="create_task_progress",
            description="Cria uma notificação de progresso no Hub com lista de tarefas. Retorna o ID para usar em update_task_progress. Use ao iniciar uma sequência de tarefas para o usuário acompanhar em tempo real.",
            inputSchema={
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Título geral da operação (ex: 'Implementando feature X')"},
                    "tasks": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Lista de tarefas a executar (em ordem)",
                    },
                    "projeto": {"type": "string", "description": "Nome do projeto (ex: cotacao-inteligente-crm)", "default": ""},
                },
                "required": ["title", "tasks"],
            },
        ),
        types.Tool(
            name="update_task_progress",
            description="Marca uma tarefa como concluída (ou com erro) em uma notificação de progresso existente. Chame a cada tarefa concluída para o usuário ver o progresso em tempo real no Hub.",
            inputSchema={
                "type": "object",
                "properties": {
                    "notification_id": {"type": "string", "description": "ID retornado por create_task_progress"},
                    "task_index": {"type": "integer", "description": "Índice da tarefa concluída (0-based)"},
                    "status": {
                        "type": "string",
                        "enum": ["done", "error", "running"],
                        "description": "Novo status da tarefa",
                        "default": "done",
                    },
                    "close": {"type": "boolean", "description": "Se true, marca a notificação como lida (encerrada)", "default": False},
                },
                "required": ["notification_id", "task_index"],
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    config = load_config()
    hub_url = config.get("hub_url", DEFAULT_HUB_URL)
    headers = get_headers(config)

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            if name == "search_company_code":
                resp = await client.post(
                    f"{hub_url}/api/v1/search",
                    json={"query": arguments["query"], "repos": arguments.get("repos"), "limit": int(arguments.get("limit", 10))},
                    headers=headers,
                )
                data = resp.json()
                results = data.get("results", [])
                if not results:
                    text = "Nenhum resultado encontrado."
                else:
                    lines = [f"**{len(results)} resultados** para: `{arguments['query']}`\n"]
                    for r in results:
                        lines.append(f"### [{r['repo']}] {r['file_path']} (score: {r['score']})")
                        lines.append(f"- Role: {r['semantic_role']} | Lang: {r['language']}" + (f" | Symbol: {r['symbol_name']}" if r['symbol_name'] else ""))
                        lines.append(f"```\n{r['snippet']}\n```\n")
                    text = "\n".join(lines)

            elif name == "get_repo_architecture":
                owner, repo = arguments["repo"].split("/", 1)
                resp = await client.get(f"{hub_url}/api/v1/repos/{owner}/{repo}/architecture", headers=headers)
                if resp.status_code == 404:
                    text = f"Repo `{arguments['repo']}` não está indexado."
                else:
                    data = resp.json()
                    text = f"# Arquitetura: {data['repo']}\n\n{data.get('summary', 'Sem resumo disponível.')}\n\n**Stack:** {json.dumps(data.get('detected_stack', {}), indent=2)}"

            elif name == "get_recent_decisions":
                owner, repo = arguments["repo"].split("/", 1)
                resp = await client.get(f"{hub_url}/api/v1/repos/{owner}/{repo}/decisions", headers=headers)
                data = resp.json()
                decisions = data.get("decisions", [])
                if not decisions:
                    text = f"Nenhuma decisão arquitetural registrada para `{arguments['repo']}`."
                else:
                    limit = arguments.get("limit", 10)
                    lines = [f"**{len(decisions)} decisões** para `{arguments['repo']}`:\n"]
                    for d in decisions[:limit]:
                        lines.append(f"### PR #{d['pr_number']}: {d['pr_title']}")
                        lines.append(f"- Autor: {d['pr_author']} | Merged: {d.get('merged_at', 'unknown')}")
                        lines.append(f"- Áreas: {', '.join(d.get('impact_areas', []))} | Breaking: {d.get('breaking_changes', False)}\n")
                    text = "\n".join(lines)

            elif name == "list_indexed_repos":
                resp = await client.get(f"{hub_url}/api/v1/repos", headers=headers)
                repos = resp.json()
                if not repos:
                    text = "Nenhum repositório indexado."
                else:
                    lines = [f"**{len(repos)} repos indexados:**\n"]
                    for r in repos:
                        lines.append(f"- `{r['repo']}` — status: {r['status']} | indexado: {r.get('last_indexed_at', 'nunca')}")
                    text = "\n".join(lines)

            elif name == "get_notifications":
                resp = await client.get(f"{hub_url}/api/v1/notifications", headers=headers)
                notifications = resp.json() if resp.status_code == 200 else []
                unread_only = arguments.get("unread_only", True)
                if unread_only:
                    notifications = [n for n in notifications if not n.get("read")]
                if not notifications:
                    text = "Nenhuma notificação pendente."
                else:
                    lines = [f"**{len(notifications)} notificações:**\n"]
                    for n in notifications:
                        lines.append(f"- [{n['type']}] {n['message']} (repo: {n.get('repo', 'geral')})")
                    text = "\n".join(lines)

            elif name == "get_alerts":
                text = _get_alerts_local()

            elif name == "get_session_context":
                projeto = arguments.get("projeto", "")
                resp = await client.get(f"{hub_url}/api/cerebro/projeto/{projeto}/sessoes", headers=headers)
                if resp.status_code == 200:
                    sessoes = resp.json()
                    if sessoes:
                        lines = [f"# Sessões recentes: {projeto}\n"]
                        for s in sessoes:
                            hrs = s.get('minutos_atras', 0) // 60
                            lines.append(f"**{s['dev']}** — {hrs}h atrás | branch: {s['branch']} | commit: {s['ultimo_commit']}")
                            lines.append(f"  Arquivos: {', '.join(s.get('arquivos', [])[:3]) or 'nenhum'}")
                        text = "\n".join(lines)
                    else:
                        text = f"Nenhuma sessão registrada para `{projeto}`."
                else:
                    text = f"Projeto `{projeto}` sem sessões no hub."

            elif name == "get_project_status":
                projeto = arguments.get("projeto", "")
                proj_dir = PROJETOS_DIR.get(projeto)
                git_info = ""
                if proj_dir and os.path.exists(proj_dir):
                    branch = _run(["git", "branch", "--show-current"], cwd=proj_dir)
                    status = _run(["git", "status", "--porcelain"], cwd=proj_dir)
                    ultimo = _run(["git", "log", "-1", "--format=%h %s"], cwd=proj_dir)
                    n = len([l for l in status.splitlines() if l.strip()]) if status else 0
                    git_info = f"\n**Git:** branch={branch} | modificados={n} | último={ultimo}"
                af_resp = await client.get(f"{hub_url}/api/cerebro/projeto/{projeto}/afinidade", headers=headers)
                af_text = ""
                if af_resp.status_code == 200:
                    ranking = af_resp.json().get("ranking", [])
                    if ranking:
                        r = " > ".join(f"{x['dev']} ({x['score']}pts)" for x in ranking[:3])
                        af_text = f"\n**Afinidade:** {r}"
                text = f"# Status: {projeto}{git_info}{af_text}"

            elif name == "get_repo_file":
                owner = arguments["owner"]
                repo  = arguments["repo"]
                path  = arguments["path"]
                resp  = await client.get(
                    f"{hub_url}/api/v1/repos/{owner}/{repo}/file",
                    params={"path": path}, headers=headers
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("language") == "image":
                        public_url = load_config().get("public_url", PUBLIC_HUB_URL)
                        text = f"**Imagem:** `{path}`\n**Tamanho:** {data['size']} bytes\n**Download:** {public_url}/api/v1/repos/{owner}/{repo}/image?path={path}"
                    else:
                        trunc = " *(truncado)*" if data.get("truncated") else ""
                        text = f"**Arquivo:** `{path}` ({data['language']}){trunc}\n\n```{data['language']}\n{data['content']}\n```"
                else:
                    text = f"Erro {resp.status_code}: {resp.text[:200]}"

            elif name == "download_repo_path":
                owner      = arguments["owner"]
                repo       = arguments["repo"]
                path       = arguments.get("path", "")
                # Sempre usa URL pública — hub_url pode ser localhost em alguns clientes
                public_url = load_config().get("public_url", PUBLIC_HUB_URL)
                base       = f"{public_url}/api/v1/repos/{owner}/{repo}/download"
                url        = f"{base}?path={path}" if path else base
                label      = path or repo
                filename   = label.replace("/", "_") + ".zip"
                text       = (
                    f"**Download ZIP:** `{label}`\n\n"
                    f"URL pública:\n```\n{url}\n```\n"
                    f"Baixar agora:\n```bash\ncurl -L '{url}' -o /tmp/{filename} && unzip -o /tmp/{filename} -d /tmp/{label.replace('/', '_')}/\n```"
                )

            elif name == "create_task_progress":
                title   = arguments["title"]
                tasks   = arguments["tasks"]
                projeto = arguments.get("projeto", "")
                metadata = {
                    "tasks": [{"title": t, "status": "pending"} for t in tasks],
                    "projeto": projeto,
                }
                resp = await client.post(
                    f"{hub_url}/api/v1/notifications",
                    json={"type": "task_progress", "message": title, "repo": projeto or None, "metadata": metadata},
                    headers=headers,
                )
                data = resp.json()
                task_lines = "\n".join(f"  - [ ] {t}" for t in tasks)
                text = f"✅ Progresso criado no Hub (id: `{data['id']}`)\n\n**{title}**\n{task_lines}"

            elif name == "update_task_progress":
                nid        = arguments["notification_id"]
                task_index = int(arguments["task_index"])
                status     = arguments.get("status", "done")
                close      = arguments.get("close", False)

                get_resp = await client.get(f"{hub_url}/api/v1/notifications", headers=headers)
                notifs   = get_resp.json() if get_resp.status_code == 200 else []
                notif    = next((n for n in notifs if n["id"] == nid), None)
                if not notif:
                    text = f"Notificação `{nid}` não encontrada."
                else:
                    metadata = notif.get("metadata") or {}
                    tasks    = metadata.get("tasks", [])
                    if 0 <= task_index < len(tasks):
                        tasks[task_index]["status"] = status
                    metadata["tasks"] = tasks

                    done_count = sum(1 for t in tasks if t["status"] == "done")
                    error_count = sum(1 for t in tasks if t["status"] == "error")
                    summary = f"{done_count}/{len(tasks)} concluídas"
                    if error_count:
                        summary += f" ({error_count} com erro)"

                    patch_body: dict = {"metadata": metadata, "message": notif["message"]}
                    if close:
                        patch_body["read"] = True

                    await client.patch(f"{hub_url}/api/v1/notifications/{nid}", json=patch_body, headers=headers)

                    icon = {"done": "✅", "error": "❌", "running": "⏳"}.get(status, "•")
                    task_name = tasks[task_index]["title"] if 0 <= task_index < len(tasks) else f"#{task_index}"
                    text = f"{icon} `{task_name}` → {status} | {summary}"

            else:
                text = f"Tool desconhecida: {name}"

        except Exception as e:
            text = f"Erro ao chamar o Hub: {str(e)}"

    return [types.TextContent(type="text", text=text)]


# ── Modo stdio (padrão) ────────────────────────────────────────────────────────

async def run_stdio():
    from mcp.server.stdio import stdio_server
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


# ── Modo HTTP centralizado ─────────────────────────────────────────────────────

def run_http(port: int = 8020):
    import secrets
    import urllib.parse
    import uvicorn
    from starlette.applications import Starlette
    from starlette.requests import Request
    from starlette.responses import JSONResponse, RedirectResponse, HTMLResponse
    from starlette.routing import Mount, Route
    from mcp.server.streamable_http_manager import StreamableHTTPSessionManager

    # Token store em memória — persiste enquanto o container estiver vivo
    _issued_tokens: set[str] = set()
    _auth_codes: dict[str, str] = {}      # code → redirect_uri (completo)
    _client_ips: dict[str, str] = {}      # client_id → IP do Claude Code
    _client_devs: dict[str, dict] = {}    # client_id → {dev, dev_token}

    BASE_URL = f"http://hub.fluxiom.com.br:{port}"

    session_manager = StreamableHTTPSessionManager(
        app=app,
        json_response=True,
        stateless=True,
    )

    # ── OAuth 2.1 mínimo ─────────────────────────────────────────────────────────

    async def oauth_protected_resource(request: Request) -> JSONResponse:
        return JSONResponse({
            "resource": BASE_URL,
            "authorization_servers": [BASE_URL],
            "bearer_methods_supported": ["header"],
        })

    async def oauth_authorization_server(request: Request) -> JSONResponse:
        return JSONResponse({
            "issuer": BASE_URL,
            "authorization_endpoint": f"{BASE_URL}/sbh-auth/authorize",
            "token_endpoint": f"{BASE_URL}/sbh-auth/token",
            "registration_endpoint": f"{BASE_URL}/sbh-auth/register",
            "response_types_supported": ["code"],
            "grant_types_supported": ["authorization_code"],
            "code_challenge_methods_supported": ["S256", "plain"],
        })

    async def oauth_register(request: Request) -> JSONResponse:
        """Dynamic client registration — armazena IP e opcionalmente vincula dev local."""
        try:
            body = await request.json()
        except Exception:
            body = {}
        client_id = secrets.token_urlsafe(16)
        # IP real do processo Claude Code (não do browser)
        client_ip = request.headers.get("x-forwarded-for", "")
        client_ip = client_ip.split(",")[0].strip() if client_ip else (request.client.host if request.client else "")
        _client_ips[client_id] = client_ip

        # Vinculação opcional a LocalDev: headers X-SBH-Dev + X-SBH-Token
        sbh_dev = request.headers.get("x-sbh-dev", "").strip()
        sbh_token = request.headers.get("x-sbh-token", "").strip()
        if sbh_dev and sbh_token:
            _client_devs[client_id] = {"dev": sbh_dev, "dev_token": sbh_token}

        return JSONResponse({
            "client_id": client_id,
            "client_secret": "",
            "token_endpoint_auth_method": "none",
            "redirect_uris": body.get("redirect_uris", []),
            "grant_types": body.get("grant_types", ["authorization_code"]),
            "response_types": body.get("response_types", ["code"]),
        }, status_code=201)

    async def oauth_authorize(request: Request) -> HTMLResponse:
        """Auto-aprova: faz relay server-side para o callback do Claude Code."""
        redirect_uri = request.query_params.get("redirect_uri", "")
        state = request.query_params.get("state", "")
        client_id = request.query_params.get("client_id", "")

        if not redirect_uri:
            return HTMLResponse("<h1>Missing redirect_uri</h1>", status_code=400)

        code = secrets.token_urlsafe(24)
        _auth_codes[code] = redirect_uri

        # Monta URL de callback
        sep = "&" if "?" in redirect_uri else "?"
        callback_url = f"{redirect_uri}{sep}code={code}"
        if state:
            callback_url += f"&state={urllib.parse.quote(state)}"

        # Relay: substitui localhost pelo IP real do Claude Code (que registrou o client_id)
        claude_ip = _client_ips.get(client_id, "")
        relay_ok = False
        if claude_ip and "localhost" in redirect_uri:
            relay_url = callback_url.replace("localhost", claude_ip)
            try:
                import urllib.request as urlreq
                urlreq.urlopen(relay_url, timeout=5)
                relay_ok = True
            except Exception:
                pass

        if relay_ok:
            return HTMLResponse("""<!DOCTYPE html>
<html><head><title>Second Brain Hub</title></head>
<body style="font-family:monospace;text-align:center;padding:3rem">
<h2>✓ Autenticado com Second Brain Hub</h2>
<p>Pode fechar esta janela.</p>
</body></html>""")

        # Fallback: redireciona o browser (funciona só se browser estiver na mesma máquina)
        return HTMLResponse(f"""<!DOCTYPE html>
<html><head>
<meta http-equiv="refresh" content="0;url={callback_url}">
<title>Second Brain Hub</title>
</head><body>
<p>Redirecionando...</p>
<script>window.location.href = "{callback_url}";</script>
</body></html>""")

    async def oauth_token(request: Request) -> JSONResponse:
        """Troca code por token. Se client_id tiver dev vinculado, valida e registra no hub."""
        form = await request.form()
        code = form.get("code", "")
        client_id = form.get("client_id", "")
        if code not in _auth_codes:
            return JSONResponse({"error": "invalid_grant"}, status_code=400)
        del _auth_codes[code]
        token = secrets.token_urlsafe(32)
        _issued_tokens.add(token)

        # Se client_id tem dev vinculado, valida token do dev no hub
        dev_info = _client_devs.pop(client_id, None)
        if dev_info:
            hub_url = os.environ.get("HUB_API_URL", "http://localhost:8010")
            try:
                import urllib.parse as _up
                params = _up.urlencode({"dev": dev_info["dev"], "token": dev_info["dev_token"]})
                import urllib.request as _ur
                req = _ur.Request(f"{hub_url}/api/cerebro/devs/auth?{params}")
                resp = _ur.urlopen(req, timeout=5)
                auth_data = json.loads(resp.read())
                # Token válido — associa token sbh ao dev para whoami
                _issued_tokens.discard(token)
                _issued_tokens.add(token)
                # Armazena binding em memória para /sbh-auth/whoami
                if not hasattr(oauth_token, "_token_devs"):
                    oauth_token._token_devs = {}
                oauth_token._token_devs[token] = auth_data.get("dev", dev_info["dev"])
            except Exception:
                pass  # auth falhou ou hub indisponível — token válido mas sem binding

        return JSONResponse({
            "access_token": token,
            "token_type": "bearer",
            "expires_in": 86400 * 365,  # 1 ano
        })

    async def oauth_whoami(request: Request) -> JSONResponse:
        """Retorna o dev vinculado ao bearer token atual (se houver)."""
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse({"dev": None, "error": "no token"}, status_code=401)
        token = auth_header.split(" ", 1)[1].strip()
        if token not in _issued_tokens:
            return JSONResponse({"dev": None, "error": "unknown token"}, status_code=401)
        token_devs = getattr(oauth_token, "_token_devs", {})
        dev = token_devs.get(token)
        return JSONResponse({"dev": dev, "authenticated": True})

    # ── Handler MCP ──────────────────────────────────────────────────────────────

    async def handle_mcp(scope, receive, send):
        """ASGI callable — passa requests direto para o session manager."""
        await session_manager.handle_request(scope, receive, send)

    # ── SSE transport (sem OAuth) ─────────────────────────────────────────────────
    from mcp.server.sse import SseServerTransport

    sse_transport = SseServerTransport("/sse/messages")

    async def handle_sse(request: Request):
        async with sse_transport.connect_sse(request.scope, request.receive, request._send) as streams:
            await app.run(streams[0], streams[1], app.create_initialization_options())

    async def lifespan(app_):
        async with session_manager.run():
            yield

    starlette_app = Starlette(
        routes=[
            # OAuth (para --transport http)
            Route("/.well-known/oauth-protected-resource", oauth_protected_resource),
            Route("/.well-known/oauth-authorization-server", oauth_authorization_server),
            Route("/sbh-auth/register", oauth_register, methods=["POST"]),
            Route("/sbh-auth/authorize", oauth_authorize, methods=["GET"]),
            Route("/sbh-auth/token", oauth_token, methods=["POST"]),
            Route("/sbh-auth/whoami", oauth_whoami, methods=["GET"]),
            # SSE transport (sem OAuth — para --transport sse)
            Route("/sse", handle_sse),
            Mount("/sse/messages", app=sse_transport.handle_post_message),
            # Streamable HTTP (para --transport http)
            Mount("/mcp", app=handle_mcp),
        ],
        lifespan=lifespan,
    )

    print(f"MCP Server HTTP rodando em http://0.0.0.0:{port}/mcp", flush=True)
    print(f"MCP Server SSE rodando em http://0.0.0.0:{port}/sse", flush=True)
    uvicorn.run(starlette_app, host="0.0.0.0", port=port, log_level="info")


# ── Entrypoint ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import asyncio

    if "--http" in sys.argv:
        port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8020
        run_http(port)
    else:
        asyncio.run(run_stdio())
