"""Reflection pipeline — processa PRs mergeados e armazena dados brutos no Qdrant."""
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.db.models import IndexedRepo, ArchitecturalDecision
from app.services import github_client, embeddings
from app.services.qdrant import client as qdrant_client
from qdrant_client.models import PointStruct


async def process_pr(full_name: str, pr_number: int, merged_at: str | None, db: AsyncSession) -> dict:
    """
    Processa um PR mergeado:
    1. Busca diff + detalhes via GitHub API
    2. Armazena dados brutos no Qdrant (architectural_decisions)
    3. Persiste no PostgreSQL
    4. Retorna stats
    """
    token = settings.github_pat

    # 1. Busca dados do PR
    diff = await github_client.get_pr_diff(full_name, pr_number, token)
    details = await github_client.get_pr_details(full_name, pr_number, token)

    # 2. Monta documento de decisão (dados brutos)
    raw_document = f"""# PR #{pr_number}: {details['title']}

**Repositório:** {full_name}
**Autor:** {details['author']}
**Merged at:** {merged_at or 'unknown'}

## Descrição
{details['body']}

## Arquivos alterados
{chr(10).join('- ' + f for f in details.get('changed_files', []))}

## Review Comments
{chr(10).join(f"**{c['user']}:** {c['body']}" for c in details.get('comments', []))}

## Diff
```diff
{diff}
```
"""

    merged_at_iso = merged_at or datetime.now(timezone.utc).isoformat()

    # 4. Persiste no PostgreSQL (dedup: skip if already exists)
    result = await db.execute(select(IndexedRepo).where(IndexedRepo.github_full_name == full_name))
    indexed_repo = result.scalar_one_or_none()

    if indexed_repo:
        existing = await db.execute(
            select(ArchitecturalDecision).where(
                ArchitecturalDecision.repo_id == indexed_repo.id,
                ArchitecturalDecision.pr_number == pr_number,
            )
        )
        if existing.scalar_one_or_none() is not None:
            return {"pr_number": pr_number, "repo": full_name, "skipped": True}

    # 3. Embed e insere no Qdrant (ID determinístico para evitar duplicatas)
    vectors = embeddings.embed_texts([raw_document])
    point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{full_name}#{pr_number}"))

    vector = vectors[0]
    if not isinstance(vector, list):
        vector = vector.tolist()

    qdrant_client.upsert(
        collection_name="architectural_decisions",
        points=[PointStruct(
            id=point_id,
            vector=vector,
            payload={
                "repo": full_name,
                "pr_number": pr_number,
                "pr_title": details["title"],
                "pr_author": details["author"],
                "impact_areas": _infer_impact_areas(details.get("changed_files", [])),
                "breaking_changes": _detect_breaking_changes(details["title"], details["body"]),
                "merged_at": merged_at_iso,
                "content": raw_document,
            }
        )]
    )

    if indexed_repo:
        decision = ArchitecturalDecision(
            repo_id=indexed_repo.id,
            pr_number=pr_number,
            pr_title=details["title"],
            pr_author=details["author"],
            summary=raw_document[:1000],  # primeiros 1000 chars como summary
            impact_areas=_infer_impact_areas(details.get("changed_files", [])),
            breaking_changes=_detect_breaking_changes(details["title"], details["body"]),
            qdrant_point_id=point_id,
            merged_at=datetime.fromisoformat(merged_at_iso.replace("Z", "+00:00")) if merged_at else None,
        )
        db.add(decision)
        await db.commit()

    return {"pr_number": pr_number, "point_id": point_id, "repo": full_name}


def _infer_impact_areas(changed_files: list[str]) -> list[str]:
    areas = set()
    for f in changed_files:
        fl = f.lower()
        if any(x in fl for x in ("auth", "login", "token", "oauth", "jwt")):
            areas.add("auth")
        if any(x in fl for x in ("model", "schema", "migration", "db/", "database")):
            areas.add("database")
        if any(x in fl for x in ("route", "api/", "endpoint", "controller")):
            areas.add("api")
        if any(x in fl for x in ("docker", "compose", "deploy", "infra", "k8s", "terraform")):
            areas.add("infra")
        if any(x in fl for x in ("test", "spec", "__test__")):
            areas.add("tests")
        if any(x in fl for x in ("readme", "docs/", ".md")):
            areas.add("docs")
    return list(areas) if areas else ["general"]


def _detect_breaking_changes(title: str, body: str) -> bool:
    text = (title + " " + (body or "")).lower()
    return any(x in text for x in ("breaking", "break change", "incompatible", "remove", "deprecated", "major"))
