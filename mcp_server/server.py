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

def _notify_connection(client_ip: str, client_name: str, machine: str) -> None:
    """Notifica o hub sobre uma nova conexão MCP (best-effort)."""
    try:
        import urllib.request as urlreq
        hub_url = os.environ.get("HUB_API_URL", DEFAULT_HUB_URL).rstrip("/")
        payload = json.dumps({
            "client_ip": client_ip,
            "client_name": client_name,
            "machine": machine,
        }).encode()
        req = urlreq.Request(
            f"{hub_url}/api/cerebro/mcp/connect",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urlreq.urlopen(req, timeout=3)
    except Exception:
        pass


def run_http(port: int = 8020):
    import uvicorn
    from starlette.applications import Starlette
    from starlette.requests import Request
    from starlette.responses import Response
    from starlette.routing import Mount
    from mcp.server.streamable_http_manager import StreamableHTTPSessionManager

    session_manager = StreamableHTTPSessionManager(
        app=app,
        json_response=False,
        stateless=False,
    )

    async def handle_mcp(scope, receive, send):
        # ASGI callable — intercepta initialize para rastrear conexão
        if scope.get("type") == "http" and scope.get("method") == "POST":
            try:
                # Lê o body uma vez
                chunks = []
                while True:
                    msg = await receive()
                    chunks.append(msg.get("body", b""))
                    if not msg.get("more_body", False):
                        break
                body = b"".join(chunks)

                data = json.loads(body)
                if data.get("method") == "initialize":
                    headers_raw = dict(scope.get("headers", []))
                    fwd = headers_raw.get(b"x-forwarded-for", b"").decode()
                    client = scope.get("client") or ("unknown", 0)
                    client_ip = fwd.split(",")[0].strip() if fwd else client[0]
                    user_agent = headers_raw.get(b"user-agent", b"").decode()[:100]
                    machine = headers_raw.get(b"x-machine", b"").decode()
                    import threading
                    threading.Thread(
                        target=_notify_connection,
                        args=(client_ip, user_agent, machine),
                        daemon=True,
                    ).start()

                # Reconstrói receive com body já consumido
                async def patched_receive():
                    return {"type": "http.request", "body": body, "more_body": False}

                request = Request(scope, patched_receive)
            except Exception:
                request = Request(scope, receive)
        else:
            request = Request(scope, receive)

        response = await session_manager.handle_request(request)
        await response(scope, receive, send)

    async def lifespan(app_):
        async with session_manager.run():
            yield

    starlette_app = Starlette(
        routes=[Mount("/mcp", app=handle_mcp)],
        lifespan=lifespan,
    )

    print(f"MCP Server HTTP rodando em http://0.0.0.0:{port}/mcp", flush=True)
    uvicorn.run(starlette_app, host="0.0.0.0", port=port, log_level="warning")


# ── Entrypoint ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import asyncio

    if "--http" in sys.argv:
        port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8020
        run_http(port)
    else:
        asyncio.run(run_stdio())
