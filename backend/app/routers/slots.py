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


@router.get("/full-state", response_model=dict)
def get_workspace_snapshot(
    cycle_id: int = Query(default=1),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Single-request state hydration endpoint for the Next.js VivaFlow frontend."""
    from app.models import AuditLog, BookingStatus, Evaluation, RubricVersion

    personas = [
        {
            "id": u.id,
            "full_name": u.full_name,
            "institute_email": u.institute_email,
            "role": u.role.value,
            "examiner_level": u.examiner_level.value if u.examiner_level else None,
            "roll_number": u.roll_number,
            "project_repo_url": u.project_repo_url,
            "lifecycle_state": u.lifecycle_state.value if u.lifecycle_state else None,
            "pending_reattempt_level": (
                u.pending_reattempt_level.value if u.pending_reattempt_level else None
            ),
            "final_project_grade": u.final_project_grade,
        }
        for u in db.scalars(select(User).order_by(User.id.asc())).all()
    ]

    rubrics = [
        {
            "rubric_version_id": rv.id,
            "cycle_id": rv.cycle_id,
            "level": rv.level.value,
            "version_number": rv.version_number,
            "title": rv.title,
            "pass_percentage": rv.pass_percentage,
            "is_active": rv.is_active,
            "questions": [
                {
                    "question_id": q.id,
                    "display_order": q.display_order,
                    "prompt": q.prompt,
                    "max_marks": q.max_marks,
                    "weight_pct": q.weight_pct,
                }
                for q in rv.questions
            ],
        }
        for rv in db.scalars(
            select(RubricVersion)
            .where(RubricVersion.cycle_id == cycle_id)
            .order_by(RubricVersion.id.asc())
        ).all()
    ]

    slots_out = []
    for s in db.scalars(
        select(VivaSlot)
        .where(VivaSlot.cycle_id == cycle_id)
        .order_by(VivaSlot.start_time.asc(), VivaSlot.id.asc())
    ).all():
        active_b = next(
            (
                b
                for b in s.bookings
                if b.status in (BookingStatus.BOOKED, BookingStatus.COMPLETED)
            ),
            None,
        )
        slots_out.append(
            {
                "id": s.id,
                "cycle_id": s.cycle_id,
                "examiner_id": s.examiner_id,
                "examiner_name": s.examiner.full_name,
                "examiner_email": s.examiner.institute_email,
                "level": s.level.value,
                "start_time": s.start_time.isoformat(),
                "end_time": s.end_time.isoformat(),
                "status": s.status.value,
                "meet_join_url": s.meet_join_url,
                "examiner_cohost_granted": s.examiner_cohost_granted,
                "student_joined": s.student_joined,
                "examiner_joined": s.examiner_joined,
                "recording_active": s.recording_active,
                "conference_ended": s.conference_ended,
                "recording_drive_url": s.recording_drive_url,
                "booking": (
                    {
                        "booking_id": active_b.id,
                        "student_id": active_b.student.id,
                        "student_name": active_b.student.full_name,
                        "student_email": active_b.student.institute_email,
                        "roll_number": active_b.student.roll_number or "",
                        "notebook_gdrive_url": active_b.notebook_gdrive_url or active_b.student.project_repo_url or "",
                        "project_repo_url": active_b.student.project_repo_url or "",
                        "attempt_number": active_b.attempt_number,
                        "status": active_b.status.value,
                        "reschedule_reason": active_b.reschedule_reason,
                    }
                    if active_b
                    else None
                ),
            }
        )

    evals_out = [
        {
            "evaluation_id": ev.id,
            "booking_id": ev.booking_id,
            "rubric_version_id": ev.rubric_version_id,
            "rubric_version_number": ev.rubric_version.version_number,
            "examiner_email": ev.booking.slot.examiner.institute_email,
            "pre_approved_score": ev.pre_approved_score,
            "recommended_outcome": ev.recommended_outcome.value,
            "examiner_overall_remarks": ev.examiner_overall_remarks or "",
            "is_approved": ev.is_approved,
            "approved_score": ev.approved_score,
            "final_outcome": ev.final_outcome.value if ev.final_outcome else None,
            "assigned_letter_grade": ev.assigned_letter_grade,
            "scores": [
                {
                    "question_id": sc.question_id,
                    "raw_marks": sc.raw_marks,
                    "comment": sc.comment,
                }
                for sc in ev.scores
            ],
        }
        for ev in db.scalars(select(Evaluation).order_by(Evaluation.id.asc())).all()
    ]

    logs_out = [
        {
            "id": lg.id,
            "actor_email": lg.actor_email,
            "action": lg.action,
            "entity_type": lg.entity_type,
            "entity_id": lg.entity_id,
            "summary": f"{lg.action} on {lg.entity_type} #{lg.entity_id} by {lg.actor_email}",
            "created_at": lg.created_at.isoformat(),
        }
        for lg in db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(40)).all()
    ]

    return {
        "personas": personas,
        "rubrics": rubrics,
        "slots": slots_out,
        "evaluations": evals_out,
        "audit_logs": logs_out,
    }
