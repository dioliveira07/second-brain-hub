#!/usr/bin/env bash
# setup-mcp.sh — Configura o MCP Server do Second Brain Hub no Claude Code
# Uso: ./setup-mcp.sh [HUB_URL] [JWT_TOKEN]
# Exemplo (outra máquina): ./setup-mcp.sh https://hub.fluxiom.com.br

set -e

HUB_URL="${1:-https://hub.fluxiom.com.br}"
TOKEN="${2:-}"

echo "=== Second Brain Hub — MCP Setup ==="
echo "Hub URL: $HUB_URL"

# Instala dependências do MCP server
pip install mcp httpx --quiet 2>/dev/null || \
pip install mcp httpx --quiet --break-system-packages 2>/dev/null || \
pipx install mcp 2>/dev/null || true

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

# Detecta python disponível
PYTHON_CMD="python3"
if ! command -v python3 &>/dev/null; then
    PYTHON_CMD="python"
fi

# Atualiza ou cria ~/.claude/settings.json
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
mkdir -p ~/.claude

if [ -f "$CLAUDE_SETTINGS" ]; then
    # Verifica se já tem o MCP configurado
    if python3 -c "import json; d=json.load(open('$CLAUDE_SETTINGS')); exit(0 if 'second-brain-hub' in d.get('mcpServers',{}) else 1)" 2>/dev/null; then
        echo "MCP 'second-brain-hub' já configurado em $CLAUDE_SETTINGS"
    else
        # Adiciona ao settings existente via python
        python3 -c "
import json
path = '$CLAUDE_SETTINGS'
with open(path) as f:
    d = json.load(f)
d.setdefault('mcpServers', {})['second-brain-hub'] = {
    'command': '$PYTHON_CMD',
    'args': ['$MCP_SERVER_PATH']
}
with open(path, 'w') as f:
    json.dump(d, f, indent=2)
print('MCP adicionado ao', path)
"
    fi
else
    # Cria settings.json novo
    cat > "$CLAUDE_SETTINGS" <<EOF2
{
  "mcpServers": {
    "second-brain-hub": {
      "command": "$PYTHON_CMD",
      "args": ["$MCP_SERVER_PATH"]
    }
  }
}
EOF2
    echo "Criado $CLAUDE_SETTINGS"
fi

echo ""
echo "=== Setup concluído! ==="
echo "Hub: $HUB_URL"
echo "MCP server: $MCP_SERVER_PATH"
echo ""
echo "Reinicie o Claude Code para ativar o MCP."
