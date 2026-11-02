from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole


def get_current_user(
    x_user_email: str = Header(
        default="instructor@iitm.ac.in",
        alias="X-User-Email",
        description="Mocked institutional auth header for Postman MVP testing (e.g. instructor@iitm.ac.in, saransh.l1@iitm.ac.in, rohan.l2@iitm.ac.in, student1@ds.study.iitm.ac.in).",
    ),
    db: Session = Depends(get_db),
) -> User:
    user = db.scalar(select(User).where(User.institute_email == x_user_email.strip().lower()))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                f"Unknown mock user '{x_user_email}'. Call GET /api/v1/auth/personas "
                "to see pre-seeded Instructor, L1/L2 Examiner, and Student emails."
            ),
        )
    return user


def require_instructor(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.INSTRUCTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only INSTRUCTOR accounts can perform this action.",
        )
    return current_user


def require_examiner(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.EXAMINER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only EXAMINER (L1/L2) accounts can perform this action.",
        )
    return current_user


def require_student(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only STUDENT accounts can perform this action.",
        )
    return current_user
