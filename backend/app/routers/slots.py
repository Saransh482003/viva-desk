from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_examiner
from app.models import SlotStatus, User, VivaLevel, VivaSlot
from app.schemas import CheckMatrixCreateRequest, PooledWindowOut, SlotOut

router = APIRouter(prefix="/api/v1/slots", tags=["2. Examiner Check-Matrix & Pooled Slots"])


@router.post("/check-matrix", response_model=dict, status_code=status.HTTP_201_CREATED)
def publish_examiner_availability(
    payload: CheckMatrixCreateRequest,
    examiner: User = Depends(require_examiner),
    db: Session = Depends(get_db),
) -> dict:
    """Examiner selects 30-min availability checkboxes; creates idempotent OPEN VivaSlot rows."""
    if not examiner.examiner_level:
        raise HTTPException(status_code=400, detail="Examiner does not have an assigned L1/L2 level.")

    created_ids: list[int] = []
    skipped_existing = 0

    for start_ts in payload.slot_starts:
        exists = db.scalar(
            select(VivaSlot).where(
                VivaSlot.examiner_id == examiner.id,
                VivaSlot.start_time == start_ts,
            )
        )
        if exists:
            skipped_existing += 1
            continue

        slot = VivaSlot(
            cycle_id=payload.cycle_id,
            examiner_id=examiner.id,
            level=examiner.examiner_level,
            start_time=start_ts,
            end_time=start_ts + timedelta(minutes=payload.duration_minutes),
            status=SlotStatus.OPEN,
        )
        db.add(slot)
        db.flush()
        created_ids.append(slot.id)

    db.commit()
    return {
        "examiner": examiner.institute_email,
        "level": examiner.examiner_level,
        "created_count": len(created_ids),
        "skipped_existing_count": skipped_existing,
        "created_slot_ids": created_ids,
    }


@router.get("/my-slots", response_model=list[SlotOut])
def list_my_examiner_slots(
    examiner: User = Depends(require_examiner),
    db: Session = Depends(get_db),
) -> list[VivaSlot]:
    """Examiner views their personal check-matrix slots, Meet URLs, and booking statuses."""
    stmt = (
        select(VivaSlot)
        .where(VivaSlot.examiner_id == examiner.id)
        .order_by(VivaSlot.start_time.asc())
    )
    return list(db.scalars(stmt).all())


@router.get("/pooled-windows", response_model=list[PooledWindowOut])
def list_pooled_student_windows(
    cycle_id: int = Query(default=1),
    level: Optional[VivaLevel] = Query(default=None),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PooledWindowOut]:
    """Returns aggregated 30-min booking windows with remaining capacity (hiding individual examiner names)."""
    stmt = (
        select(
            VivaSlot.cycle_id,
            VivaSlot.level,
            VivaSlot.start_time.label("window_start"),
            VivaSlot.end_time.label("window_end"),
            func.sum(case((VivaSlot.status == SlotStatus.OPEN, 1), else_=0)).label("open_seats"),
            func.count(VivaSlot.id).label("total_seats"),
        )
        .where(VivaSlot.cycle_id == cycle_id, VivaSlot.status != SlotStatus.CANCELLED)
        .group_by(VivaSlot.cycle_id, VivaSlot.level, VivaSlot.start_time, VivaSlot.end_time)
        .order_by(VivaSlot.level.asc(), VivaSlot.start_time.asc())
    )
    if level:
        stmt = stmt.where(VivaSlot.level == level)

    rows = db.execute(stmt).all()
    return [
        PooledWindowOut(
            cycle_id=r.cycle_id,
            level=r.level,
            window_start=r.window_start,
            window_end=r.window_end,
            open_seats=int(r.open_seats or 0),
            total_seats=int(r.total_seats or 0),
        )
        for r in rows
    ]
