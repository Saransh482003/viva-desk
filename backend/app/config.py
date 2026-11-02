from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "IITM VivaFlow Platform API"
    database_url: str = "postgresql+psycopg://viva_admin:viva_secret@localhost:5432/ml_viva_db"
    auto_seed: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
