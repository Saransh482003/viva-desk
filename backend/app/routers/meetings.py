from datetime import datetime, timezone
import hashlib
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_instructor
from app.models import AuditLog, Booking, BookingStatus, SlotStatus, User, VivaSlot
from app.schemas import LiveMeetingRowOut, ProvisionMeetingsRequest, SimulateTelemetryRequest

router = APIRouter(prefix="/api/v1/meetings", tags=["4. Google Meet Provisioning & Live Monitor"])


def compute_live_badge(slot: VivaSlot) -> str:
    if slot.conference_ended or slot.status == SlotStatus.COMPLETED:
        return "ENDED"
    if slot.student_joined and slot.examiner_joined and slot.recording_active:
        return "LIVE_AND_RECORDING"
    if slot.student_joined and slot.examiner_joined and not slot.recording_active:
        return "ALERT_BOTH_JOINED_NO_RECORDING"
    if slot.student_joined and not slot.examiner_joined:
        return "STUDENT_JOINED_ONLY"
    if slot.examiner_joined and not slot.student_joined:
        return "EXAMINER_JOINED_ONLY"
    return "WAITING_FOR_PARTICIPANTS"


@router.post("/provision", response_model=dict)
def provision_google_meets_and_invites(
    payload: ProvisionMeetingsRequest,
    instructor: User = Depends(require_instructor),
    db: Session = Depends(get_db),
) -> dict:
    """
    Instructor 1-Click Button: Provisions simulated Google Meet spaces under central organizer,
    grants Examiner COHOST recording rights, and dispatches Calendar invites to Student & Examiner.
    """
    stmt = select(VivaSlot).where(
        VivaSlot.cycle_id == payload.cycle_id,
        VivaSlot.status == SlotStatus.BOOKED,
        VivaSlot.meet_join_url.is_(None),
    )
    if payload.level:
        stmt = stmt.where(VivaSlot.level == payload.level)

    slots = list(db.scalars(stmt).all())
    provisioned_details: list[dict] = []
    now = datetime.now(timezone.utc)

    for slot in slots:
        digest = hashlib.sha1(f"slot-{slot.id}-{slot.start_time.isoformat()}".encode()).hexdigest()[:10]
        meet_code = f"{digest[:3]}-{digest[3:7]}-{digest[7:10]}"
        slot.meet_space_id = f"spaces/{digest}"
        slot.meet_join_url = f"https://meet.google.com/{meet_code}"
        slot.calendar_event_id = f"cal_evt_{slot.id}_{digest[:6]}"
        slot.examiner_cohost_granted = True
        slot.provisioned_at = now
        if payload.auto_recording_enabled:
            slot.recording_active = True

        active_booking = next(
            (b for b in slot.bookings if b.status == BookingStatus.BOOKED), None
        )
        provisioned_details.append(
            {
                "slot_id": slot.id,
                "level": slot.level,
                "window_start": slot.start_time.isoformat(),
                "meet_join_url": slot.meet_join_url,
                "examiner_cohost": slot.examiner.institute_email,
                "student_attendee": active_booking.student.institute_email if active_booking else None,
                "calendar_event_id": slot.calendar_event_id,
            }
        )

    db.add(
        AuditLog(
            actor_email=instructor.institute_email,
            action="PROVISIONED_MEET_SPACES",
            entity_type="VivaCycle",
            entity_id=payload.cycle_id,
            before_state=None,
            after_state={"provisioned_count": len(provisioned_details)},
        )
    )
    db.commit()
    return {
        "provisioned_count": len(provisioned_details),
        "central_organizer_account": "ml-viva-bot@iitm.ac.in",
        "meetings": provisioned_details,
    }


@router.get("/live-dashboard", response_model=dict)
def get_instructor_live_monitoring_dashboard(
    cycle_id: int = 1,
    _: User = Depends(require_instructor),
    db: Session = Depends(get_db),
) -> dict:
    """
    Real-time Instructor Command Center view showing who joined each viva and whether recording started.
    """
    bookings = db.scalars(
        select(Booking)
        .where(
            Booking.cycle_id == cycle_id,
            Booking.status.in_([BookingStatus.BOOKED, BookingStatus.COMPLETED]),
        )
        .order_by(Booking.id.asc())
    ).all()

    rows: list[LiveMeetingRowOut] = []
    summary_counts: dict[str, int] = {
        "WAITING_FOR_PARTICIPANTS": 0,
        "STUDENT_JOINED_ONLY": 0,
        "EXAMINER_JOINED_ONLY": 0,
        "ALERT_BOTH_JOINED_NO_RECORDING": 0,
        "LIVE_AND_RECORDING": 0,
        "ENDED": 0,
    }

    for b in bookings:
        slot = b.slot
        badge = compute_live_badge(slot)
        summary_counts[badge] = summary_counts.get(badge, 0) + 1
        rows.append(
            LiveMeetingRowOut(
                slot_id=slot.id,
                booking_id=b.id,
                level=b.level,
                window_start=slot.start_time,
                window_end=slot.end_time,
                student_name=b.student.full_name,
                student_email=b.student.institute_email,
                examiner_name=slot.examiner.full_name,
                examiner_email=slot.examiner.institute_email,
                meet_join_url=slot.meet_join_url,
                examiner_cohost_granted=slot.examiner_cohost_granted,
                student_joined=slot.student_joined,
                examiner_joined=slot.examiner_joined,
                recording_active=slot.recording_active,
                live_monitoring_badge=badge,
                recording_drive_url=slot.recording_drive_url,
            )
        )

    return {
        "summary_counts": summary_counts,
        "sessions": [r.model_dump() for r in rows],
    }


@router.post("/{slot_id}/simulate-telemetry", response_model=dict)
def simulate_workspace_meet_webhook(
    slot_id: int,
    payload: SimulateTelemetryRequest,
    _: User = Depends(require_instructor),
    db: Session = Depends(get_db),
) -> dict:
    """
    Demo/Postman helper simulating Google Workspace Events API Pub/Sub messages
    (participant.v2.joined / left, recording.v2.started / fileGenerated).
    """
    slot = db.get(VivaSlot, slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="VivaSlot not found.")

    if payload.student_joined is not None:
        slot.student_joined = payload.student_joined
    if payload.examiner_joined is not None:
        slot.examiner_joined = payload.examiner_joined
    if payload.recording_active is not None:
        slot.recording_active = payload.recording_active
    if payload.conference_ended is not None:
        slot.conference_ended = payload.conference_ended
    if payload.recording_drive_url is not None:
        slot.recording_drive_url = payload.recording_drive_url

    slot.last_telemetry_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "slot_id": slot.id,
        "live_monitoring_badge": compute_live_badge(slot),
        "student_joined": slot.student_joined,
        "examiner_joined": slot.examiner_joined,
        "recording_active": slot.recording_active,
        "recording_drive_url": slot.recording_drive_url,
    }
