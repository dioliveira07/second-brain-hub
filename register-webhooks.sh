#!/usr/bin/env bash
# register-webhooks.sh — Registra webhooks do Second Brain Hub em todos os repos GitHub
# Uso: ./register-webhooks.sh [HUB_URL] [GITHUB_PAT] [WEBHOOK_SECRET]
# Exemplo: ./register-webhooks.sh https://hub.fluxiom.com.br

set -e

# Carrega .env se existir
if [ -f "$(dirname "$0")/.env" ]; then
    export $(grep -v '^#' "$(dirname "$0")/.env" | grep -v '^$' | xargs)
fi

HUB_URL="${1:-https://hub.fluxiom.com.br}"
GITHUB_PAT="${2:-$GITHUB_PAT}"
WEBHOOK_SECRET="${3:-$GITHUB_WEBHOOK_SECRET}"
WEBHOOK_URL="${HUB_URL}/api/v1/webhooks/github"

if [ -z "$GITHUB_PAT" ]; then
    echo "ERRO: GITHUB_PAT não definido. Passe como argumento ou defina no .env"
    exit 1
fi

if [ -z "$WEBHOOK_SECRET" ]; then
    echo "ERRO: GITHUB_WEBHOOK_SECRET não definido. Passe como argumento ou defina no .env"
    exit 1
fi

echo "=== Second Brain Hub — Registro de Webhooks ==="
echo "Hub URL:     $HUB_URL"
echo "Webhook URL: $WEBHOOK_URL"
echo ""

# Busca todos os repos do usuário
REPOS=$(curl -s "https://api.github.com/user/repos?per_page=100&type=all" \
    -H "Authorization: Bearer $GITHUB_PAT" \
    -H "Accept: application/vnd.github+json" | \
    python3 -c "import sys,json; [print(r['full_name']) for r in json.load(sys.stdin)]")

TOTAL=$(echo "$REPOS" | wc -l | tr -d ' ')
echo "Repos encontrados: $TOTAL"
echo ""

REGISTERED=0
SKIPPED=0
ERRORS=0

for REPO in $REPOS; do
    # Verifica se já existe webhook para este hub
    EXISTING=$(curl -s "https://api.github.com/repos/$REPO/hooks" \
        -H "Authorization: Bearer $GITHUB_PAT" \
        -H "Accept: application/vnd.github+json" | \
        python3 -c "
import sys, json
hooks = json.load(sys.stdin)
url = '$WEBHOOK_URL'
for h in hooks:
    if h.get('config', {}).get('url') == url:
        print(h['id'])
        break
" 2>/dev/null)

    if [ -n "$EXISTING" ]; then
        echo "  SKIP  $REPO (webhook já existe, id=$EXISTING)"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    # Cria webhook
    RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "https://api.github.com/repos/$REPO/hooks" \
        -H "Authorization: Bearer $GITHUB_PAT" \
        -H "Accept: application/vnd.github+json" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"web\",
            \"active\": true,
            \"events\": [\"push\", \"pull_request\"],
            \"config\": {
                \"url\": \"$WEBHOOK_URL\",
                \"content_type\": \"json\",
                \"secret\": \"$WEBHOOK_SECRET\",
                \"insecure_ssl\": \"0\"
            }
        }")

    if [ "$RESULT" = "201" ]; then
        echo "  OK    $REPO"
        REGISTERED=$((REGISTERED + 1))
    else
        echo "  ERRO  $REPO (HTTP $RESULT)"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
echo "=== Resultado ==="
echo "Registrados: $REGISTERED"
echo "Já existiam: $SKIPPED"
echo "Erros:       $ERRORS"
