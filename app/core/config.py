from pydantic_settings import BaseSettings
from pydantic import model_validator


class Settings(BaseSettings):
    # Hub
    hub_env: str = "development"
    secret_key: str = "change-me-in-production"

    # PostgreSQL
    database_url: str = "postgresql+asyncpg://sbuser:sbpass@postgres:5432/secondbrain"

    # Qdrant
    qdrant_host: str = "qdrant"
    qdrant_port: int = 6333
    qdrant_api_key: str = ""

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # GitHub
    github_app_client_id: str = ""
    github_app_client_secret: str = ""
    github_webhook_secret: str = ""
    github_pat: str = ""

    # Claude API
    anthropic_api_key: str = ""

    # Embedding
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dimensions: int = 384

    hub_base_url: str = "http://localhost:8010"
    admin_token: str = ""  # X-Admin-Token para endpoints administrativos
    hub_api_key: str = ""  # X-Hub-Key — obrigatório para requests externos
    hub_auth_audit: bool = True  # True=loga sem bloquear, False=enforce
    current_hb_version: str = "20260427.6"  # bump ao deployar novo HB
    hub_signing_key_path: str = "/root/.hub-signing-key"

    model_config = {"env_file": ".env", "extra": "ignore"}

    @model_validator(mode="after")
    def validate_production_secrets(self):
        if self.hub_env == "production":
            if self.secret_key == "change-me-in-production":
                raise ValueError("SECRET_KEY deve ser configurado em produção (openssl rand -hex 32)")
            if len(self.secret_key) < 32:
                raise ValueError("SECRET_KEY deve ter pelo menos 32 caracteres")
            if not self.hub_api_key:
                raise ValueError("HUB_API_KEY obrigatório em produção")
            if not self.admin_token:
                raise ValueError("ADMIN_TOKEN obrigatório em produção")
        return self


settings = Settings()
