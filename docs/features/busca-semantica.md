# Busca Semântica

O sistema de busca combina similaridade vetorial (Qdrant) com um keyword boost simples para retornar trechos de código e documentação relevantes para perguntas em linguagem natural.

---

## Como funciona

```
Query do usuário: "como funciona autenticação JWT"
        │
        ▼
embed_query(query)
  → fastembed BAAI/bge-small-en-v1.5
  → vetor de 384 dimensões
        │
        ▼
qdrant.search(
  collection="company_knowledge",
  query_vector=vetor,
  query_filter=Filter(must=[FieldCondition(key="repo", match=MatchAny(any=[...]))]),
  limit=10,
  with_payload=True
)
  → hits com score cosine + payload completo
        │
        ▼
Reranking (keyword boost)
  → Para cada hit:
      query_words = {"como", "funciona", "autenticação", "jwt"}
      keyword_matches = palavras presentes no chunk
      keyword_boost = keyword_matches / len(query_words) * 0.1
      final_score = hit.score + keyword_boost
        │
        ▼
Ordena por final_score desc
        │
        ▼
Retorna resultados com snippet[:500]
```

---

## Modelo de embeddings

| Atributo          | Valor                      |
|-------------------|---------------------------|
| Modelo            | `BAAI/bge-small-en-v1.5`  |
| Biblioteca        | `fastembed`               |
| Dimensões         | 384                       |
| Métrica Qdrant    | COSINE                    |
| Carregamento      | Lazy (na primeira busca)  |

O modelo é carregado uma vez por processo e reutilizado (singleton `_model`). Queries usam `model.query_embed()` (otimizado para busca assimétrica), textos de indexação usam `model.embed()`.

---

## Parâmetros da busca

Chamada via `POST /api/v1/search`:

| Parâmetro | Tipo            | Obrigatório | Padrão | Descrição                                           |
|-----------|-----------------|-------------|--------|-----------------------------------------------------|
| `query`   | string          | sim         | —      | Texto livre (suporta linguagem natural e código)    |
| `repos`   | array de strings| não         | null   | Filtra resultados por repos específicos              |
| `limit`   | integer         | não         | 10     | Número máximo de resultados retornados              |

---

## Filtros disponíveis

### Filtro por repositório

Quando `repos` é fornecido, o Qdrant aplica um filtro `FieldCondition` na busca vetorial (antes do reranking):

```python
Filter(
    must=[
        FieldCondition(
            key="repo",
            match=MatchAny(any=["org/api", "org/worker"])
        )
    ]
)
```

Isso garante que apenas chunks desses repos específicos entrem no pool de busca, reduzindo ruído e melhorando relevância.

### Outros campos disponíveis no payload (para filtros futuros)

| Campo           | Valores possíveis                                                   |
|-----------------|---------------------------------------------------------------------|
| `repo`          | `"org/api"`, `"org/worker"`, etc.                                   |
| `language`      | `"python"`, `"typescript"`, `"javascript"`, `"markdown"`, `"yaml"` |
| `semantic_role` | `"routes"`, `"models"`, `"entrypoint"`, `"middleware"`, `"config"`, `"docs"`, `"tests"`, `"other"` |
| `file_type`     | Igual ao `language` para código; `"json"`, `"toml"`, `"env"` para configs |

---

## Campos do resultado

Cada item do array `results` contém:

| Campo           | Tipo    | Descrição                                                  |
|-----------------|---------|------------------------------------------------------------|
| `score`         | float   | Score final = cosine Qdrant + keyword boost (0 a 1.1+)    |
| `repo`          | string  | Nome completo do repo (`org/repo`)                         |
| `file_path`     | string  | Caminho relativo do arquivo no repo                        |
| `language`      | string  | Linguagem de programação                                   |
| `semantic_role` | string  | Papel semântico do arquivo no projeto                      |
| `symbol_name`   | string  | Nome da função/classe (vazio para configs e docs)          |
| `chunk_index`   | integer | Índice do chunk dentro do arquivo (0-based)                |
| `snippet`       | string  | Primeiros 500 caracteres do conteúdo do chunk              |

---

## Keyword boost

O boost de keywords é uma heurística simples somada ao score vetorial:

```python
query_words = set(query.lower().split())
content_lower = content.lower()
keyword_matches = sum(1 for w in query_words if w in content_lower)
keyword_boost = keyword_matches / max(len(query_words), 1) * 0.1
final_score = hit.score + keyword_boost
```

Efeito máximo: `+0.1` (quando todas as palavras da query estão no chunk). O boost é cumulativo com o score cosine, então um chunk semanticamente muito relevante com muitas palavras-chave pode ultrapassar 1.0.

---

## Coleções Qdrant

### `company_knowledge`

Contém todos os chunks de código e documentação indexados dos repos.

**Campos do payload:**
- `repo`, `file_path`, `file_type`, `language`, `semantic_role`, `symbol_name`, `chunk_index`, `stack_context`, `content`

### `architectural_decisions`

Contém documentos de PRs mergeados (diff + detalhes + comments).

**Campos do payload:**
- `repo`, `pr_number`, `pr_title`, `pr_author`, `impact_areas`, `breaking_changes`, `merged_at`, `content`

Esta coleção não é consultada diretamente pela API de busca (que usa apenas `company_knowledge`), mas é usada pelo endpoint `GET /api/v1/repos/{owner}/{repo}/decisions` via PostgreSQL.

---

## Exemplo completo

**Busca:**
```bash
curl -X POST http://localhost:8010/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "validação de webhook HMAC SHA256",
    "repos": ["dioliveira07/second-brain-hub"],
    "limit": 5
  }'
```

**Resposta esperada:**
```json
{
  "query": "validação de webhook HMAC SHA256",
  "results": [
    {
      "score": 0.9341,
      "repo": "dioliveira07/second-brain-hub",
      "file_path": "app/services/github_client.py",
      "language": "python",
      "semantic_role": "other",
      "symbol_name": "verify_webhook_signature",
      "chunk_index": 3,
      "snippet": "def verify_webhook_signature(payload_bytes: bytes, signature_header: str, secret: str) -> bool:\n    \"\"\"Verify GitHub webhook HMAC signature.\"\"\"\n    if not secret:\n        return True..."
    }
  ],
  "total": 1
}
```
