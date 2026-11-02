from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_instructor, require_student
from app.models import (
    AuditLog,
    Booking,
    BookingStatus,
    SlotStatus,
    StudentLifecycleState,
    User,
    VivaLevel,
    VivaSlot,
)
from app.schemas import BookingOut, ClearFeeRequestIn, ReserveSlotRequest, RescheduleRequestIn

router = APIRouter(prefix="/api/v1/bookings", tags=["3. Concurrency-Safe Booking & Reschedules"])


def _serialize_booking(booking: Booking) -> BookingOut:
    slot = booking.slot
    examiner = slot.examiner
    student = booking.student
    return BookingOut(
        id=booking.id,
        cycle_id=booking.cycle_id,
        slot_id=slot.id,
        student_id=student.id,
        student_email=student.institute_email,
        student_name=student.full_name,
        examiner_id=examiner.id,
        examiner_name=examiner.full_name,
        examiner_email=examiner.institute_email,
        level=booking.level,
        attempt_number=booking.attempt_number,
        status=booking.status,
        window_start=slot.start_time,
        window_end=slot.end_time,
        meet_join_url=slot.meet_join_url,
        notebook_gdrive_url=booking.notebook_gdrive_url,
        booked_at=booking.booked_at,
    )


@router.post("/reserve", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def reserve_pooled_slot(
    payload: ReserveSlotRequest,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> BookingOut:
    """
    Stampede-safe reservation using PostgreSQL `FOR UPDATE SKIP LOCKED`.
    Auto-assigns the least-loaded available examiner in the requested 30-min window.
    """
    # 1. Verify student lifecycle eligibility
    if payload.level == VivaLevel.L1 and student.lifecycle_state != StudentLifecycleState.ELIGIBLE_L1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Student is currently '{student.lifecycle_state}' and not eligible to book an L1 slot.",
        )
    if payload.level == VivaLevel.L2 and student.lifecycle_state != StudentLifecycleState.ELIGIBLE_L2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Student is currently '{student.lifecycle_state}'. You must PASS L1 before booking L2.",
        )

    # 2. Check existing active booking for this level
    active_existing = db.scalar(
        select(Booking).where(
            Booking.cycle_id == payload.cycle_id,
            Booking.student_id == student.id,
            Booking.level == payload.level,
            Booking.status == BookingStatus.BOOKED,
        )
    )
    if active_existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You already hold active {payload.level.value} booking #{active_existing.id}.",
        )

    # 3. Subquery computing each examiner's current booked load for even auto-balancing
    load_subq = (
        select(
            VivaSlot.examiner_id.label("ex_id"),
            func.count(VivaSlot.id).label("booked_count"),
        )
        .where(
            VivaSlot.cycle_id == payload.cycle_id,
            VivaSlot.status.in_([SlotStatus.BOOKED, SlotStatus.COMPLETED]),
        )
        .group_by(VivaSlot.examiner_id)
        .subquery()
    )

    # 4. Atomic row lock skipping any slot locked by a concurrent student transaction!
    candidate_slot = db.scalar(
        select(VivaSlot)
        .outerjoin(load_subq, VivaSlot.examiner_id == load_subq.c.ex_id)
        .where(
            VivaSlot.cycle_id == payload.cycle_id,
            VivaSlot.level == payload.level,
            VivaSlot.start_time == payload.window_start,
            VivaSlot.status == SlotStatus.OPEN,
        )
        .order_by(func.coalesce(load_subq.c.booked_count, 0).asc(), VivaSlot.id.asc())
        .with_for_update(of=VivaSlot, skip_locked=True)
        .limit(1)
    )

    if not candidate_slot:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="All seats in this 30-minute window were just taken. Please pick another window.",
        )

    prior_attempts = db.scalar(
        select(func.count(Booking.id)).where(
            Booking.cycle_id == payload.cycle_id,
            Booking.student_id == student.id,
            Booking.level == payload.level,
        )
    ) or 0

    candidate_slot.status = SlotStatus.BOOKED
    booking = Booking(
        cycle_id=payload.cycle_id,
        slot_id=candidate_slot.id,
        student_id=student.id,
        level=payload.level,
        attempt_number=int(prior_attempts) + 1,
        notebook_gdrive_url=payload.notebook_gdrive_url.strip(),
        status=BookingStatus.BOOKED,
    )
    student.lifecycle_state = (
        StudentLifecycleState.BOOKED_L1
        if payload.level == VivaLevel.L1
        else StudentLifecycleState.BOOKED_L2
    )

    db.add(booking)
    db.commit()
    db.refresh(booking)
    return _serialize_booking(booking)


@router.get("/me", response_model=list[BookingOut])
def list_my_bookings(
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> list[BookingOut]:
    """Student views all active and past L1/L2 bookings and exact Meet links."""
    rows = db.scalars(
        select(Booking).where(Booking.student_id == student.id).order_by(Booking.id.desc())
    ).all()
    return [_serialize_booking(b) for b in rows]


@router.post("/{booking_id}/request-reschedule", response_model=dict)
def request_reschedule(
    booking_id: int,
    payload: RescheduleRequestIn,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
) -> dict:
    """
    Student requests a reschedule: frees their examiner slot back to OPEN and routes student
    to AWAITING_IITM_FEE_CLEARANCE so instructors can send the official IITM invoice externally.
    """
    booking = db.get(Booking, booking_id)
    if not booking or booking.student_id != student.id:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.status != BookingStatus.BOOKED:
        raise HTTPException(status_code=400, detail=f"Cannot reschedule booking in status {booking.status}.")

    booking.status = BookingStatus.RESCHEDULE_REQUESTED
    booking.reschedule_reason = payload.reason
    booking.slot.status = SlotStatus.OPEN
    student.lifecycle_state = StudentLifecycleState.AWAITING_IITM_FEE_CLEARANCE
    student.pending_reattempt_level = booking.level

    db.add(
        AuditLog(
            actor_email=student.institute_email,
            action="STUDENT_REQUESTED_RESCHEDULE",
            entity_type="Booking",
            entity_id=booking.id,
            before_state={"status": "BOOKED"},
            after_state={
                "status": "RESCHEDULE_REQUESTED",
                "reason": payload.reason,
                "student_lifecycle": student.lifecycle_state.value,
            },
        )
    )
    db.commit()
    return {
        "message": "Reschedule requested. Slot released to pool; awaiting IITM fee invoice clearance by instructor.",
        "booking_id": booking.id,
        "student_lifecycle_state": student.lifecycle_state,
    }


@router.get("/awaiting-fee-clearance", response_model=list[dict])
def list_fee_clearance_queue(
    _: User = Depends(require_instructor),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Instructor queue of students needing an IITM reschedule/reattempt fee invoice or unlock."""
    students = db.scalars(
        select(User).where(User.lifecycle_state == StudentLifecycleState.AWAITING_IITM_FEE_CLEARANCE)
    ).all()
    return [
        {
            "student_id": s.id,
            "full_name": s.full_name,
            "institute_email": s.institute_email,
            "roll_number": s.roll_number,
            "pending_level": s.pending_reattempt_level,
        }
        for s in students
    ]


@router.post("/students/{student_id}/clear-fee", response_model=dict)
def unlock_student_after_fee_payment(
    student_id: int,
    payload: ClearFeeRequestIn,
    instructor: User = Depends(require_instructor),
    db: Session = Depends(get_db),
) -> dict:
    """Instructor marks external IITM reschedule/reattempt invoice paid, unlocking fresh slot booking."""
    student = db.get(User, student_id)
    if not student or student.lifecycle_state != StudentLifecycleState.AWAITING_IITM_FEE_CLEARANCE:
        raise HTTPException(
            status_code=400,
            detail="Student is not currently awaiting IITM fee clearance.",
        )

    target_level = student.pending_reattempt_level or VivaLevel.L1
    old_state = student.lifecycle_state.value
    student.lifecycle_state = (
        StudentLifecycleState.ELIGIBLE_L1
        if target_level == VivaLevel.L1
        else StudentLifecycleState.ELIGIBLE_L2
    )
    student.pending_reattempt_level = None

    latest_booking = db.scalar(
        select(Booking)
        .where(Booking.student_id == student.id, Booking.level == target_level)
        .order_by(Booking.id.desc())
        .limit(1)
    )
    if latest_booking:
        latest_booking.iitm_fee_invoice_ref = payload.iitm_fee_invoice_ref
        latest_booking.fee_cleared_by_id = instructor.id

    db.add(
        AuditLog(
            actor_email=instructor.institute_email,
            action="INSTRUCTOR_CLEARED_IITM_FEE",
            entity_type="User",
            entity_id=student.id,
            before_state={"lifecycle_state": old_state},
            after_state={
                "lifecycle_state": student.lifecycle_state.value,
                "iitm_fee_invoice_ref": payload.iitm_fee_invoice_ref,
            },
        )
    )
    db.commit()
    return {
        "message": f"Unlocked {student.institute_email} for {target_level.value} slot booking.",
        "new_lifecycle_state": student.lifecycle_state,
        "iitm_fee_invoice_ref": payload.iitm_fee_invoice_ref,
    }
