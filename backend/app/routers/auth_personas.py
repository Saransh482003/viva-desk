from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import UserOut

router = APIRouter(prefix="/api/v1/auth", tags=["1. Mock Auth & Personas"])


@router.get("/personas", response_model=list[UserOut])
def list_seeded_personas(db: Session = Depends(get_db)) -> list[User]:
    """Returns all seeded mock accounts so you can copy any email into the X-User-Email header in Postman."""
    return list(db.scalars(select(User).order_by(User.id)).all())


@router.get("/me", response_model=UserOut)
def get_active_persona(current_user: User = Depends(get_current_user)) -> User:
    """Inspects whichever account is currently active via the X-User-Email header."""
    return current_user
