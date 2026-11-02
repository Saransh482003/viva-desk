from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import SessionLocal, wait_for_db_and_create_tables
from app.routers import (
    auth_personas,
    bookings,
    evaluations,
    exports,
    meetings,
    rubrics,
    slots,
)
from app.seed import seed_initial_data


@asynccontextmanager
async def lifespan(_: FastAPI):
    wait_for_db_and_create_tables()
    if settings.auto_seed:
        with SessionLocal() as db:
            seed_initial_data(db)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0-mvp",
    description=(
        "Backend MVP for IITM ML Project Vivas (L1 & L2). "
        "Switch personas anytime in Postman or Swagger using the `X-User-Email` header."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(auth_personas.router)
app.include_router(slots.router)
app.include_router(bookings.router)
app.include_router(meetings.router)
app.include_router(rubrics.router)
app.include_router(evaluations.router)
app.include_router(exports.router)


@app.get("/health", tags=["0. Health"])
def health_check() -> dict:
    return {
        "status": "ok",
        "service": settings.app_name,
        "docs_url": "http://localhost:8000/docs",
    }
