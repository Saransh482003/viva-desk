from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "IITM ML Viva Management Platform API (MVP)"
    database_url: str = "postgresql+psycopg://viva_admin:viva_secret@localhost:5432/viva_desk_db"
    auto_seed: bool = True
    viva_payout_per_slot_inr: int = 400

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
