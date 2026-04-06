#!/usr/bin/env bash
# setup-mcp.sh — Configura o MCP Server do Second Brain Hub no Claude Code

set -e

HUB_URL="${1:-http://localhost:8010}"
TOKEN="${2:-}"

echo "=== Second Brain Hub — MCP Setup ==="
echo "Hub URL: $HUB_URL"

# Instala dependências do MCP server
pip install mcp httpx --quiet

# Cria diretório de config
mkdir -p ~/.second-brain

# Salva config
cat > ~/.second-brain/config.json <<EOF
{
  "hub_url": "$HUB_URL",
  "token": "$TOKEN"
}
EOF
echo "Config salva em ~/.second-brain/config.json"

# Detecta path do server.py
MCP_SERVER_PATH="$(cd "$(dirname "$0")" && pwd)/mcp_server/server.py"

# Adiciona ao Claude Code settings
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
if [ -f "$CLAUDE_SETTINGS" ]; then
    echo "Adicione manualmente ao $CLAUDE_SETTINGS:"
else
    mkdir -p ~/.claude
    echo "Criando $CLAUDE_SETTINGS..."
fi

cat <<EOF

Adicione ao ~/.claude/settings.json:
{
  "mcpServers": {
    "second-brain-hub": {
      "command": "python",
      "args": ["$MCP_SERVER_PATH"]
    }
  }
}

EOF
echo "Setup concluído!"
