"""
MCP Server — Fase 5
Roda localmente na máquina do dev. Expõe tools para o Claude Code.

Instalação: pip install mcp httpx
Uso: adicionar ao claude_desktop_config.json ou ~/.claude/settings.json
"""
import json
import os
import sys
from pathlib import Path

import httpx

try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp import types
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False


CONFIG_PATH = Path.home() / ".second-brain" / "config.json"
DEFAULT_HUB_URL = "http://localhost:8010"


def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {"hub_url": DEFAULT_HUB_URL, "token": ""}


def get_headers(config: dict) -> dict:
    headers = {"Content-Type": "application/json"}
    if config.get("token"):
        headers["Authorization"] = f"Bearer {config['token']}"
    return headers


if MCP_AVAILABLE:
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
                        json={"query": arguments["query"], "repos": arguments.get("repos"), "limit": arguments.get("limit", 10)},
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
                        text = f"Repo `{arguments['repo']}` não está indexado. Use a API para indexar primeiro."
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
                else:
                    text = f"Tool desconhecida: {name}"

            except Exception as e:
                text = f"Erro ao chamar o Hub: {str(e)}"

        return [types.TextContent(type="text", text=text)]


    async def main():
        async with stdio_server() as (read_stream, write_stream):
            await app.run(read_stream, write_stream, app.create_initialization_options())


    if __name__ == "__main__":
        import asyncio
        asyncio.run(main())

else:
    print("mcp package not installed. Run: pip install mcp", file=sys.stderr)
