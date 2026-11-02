import csv
import io
from typing import Literal
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import require_examiner, require_instructor
from app.models import AuditLog, Booking, User
from app.schemas import AuditLogOut

router = APIRouter(prefix="/api/v1/exports", tags=["7. CSV/Excel Exports & Audit Logs"])


def _build_export_response(
    headers: list[str],
    rows: list[list],
    summary_rows: list[list],
    filename_stem: str,
    fmt: Literal["csv", "xlsx"],
) -> StreamingResponse:
    if fmt == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(headers)
        writer.writerows(rows)
        if summary_rows:
            writer.writerow([])
            writer.writerows(summary_rows)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename_stem}.csv"'},
        )

    wb = Workbook()
    ws = wb.active
    ws.title = "Report"

    header_fill = PatternFill(start_color="0F2942", end_color="0F2942", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)

    ws.append(headers)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font

    for r in rows:
        ws.append(r)

    if summary_rows:
        ws.append([])
        for sr in summary_rows:
            ws.append(sr)
            for cell in ws[ws.max_row]:
                cell.font = Font(bold=True)

    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename_stem}.xlsx"'},
    )


@router.get("/examiner-vivas")
def export_examiner_vivas(
    format: Literal["csv", "xlsx"] = Query(default="csv"),
    examiner: User = Depends(require_examiner),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Examiner downloads their personal viva log and completed payout summary in CSV or Excel."""
    bookings = db.scalars(
        select(Booking)
        .join(Booking.slot)
        .where(Booking.slot.has(examiner_id=examiner.id))
        .order_by(Booking.id.asc())
    ).all()

    headers = [
        "Booking ID",
        "Level",
        "Window Start (UTC)",
        "Student Name",
        "Roll Number",
        "Booking Status",
        "Pre-Approved Score",
        "Recommended Outcome",
        "Instructor Approved",
    ]
    rows = []
    completed_count = 0
    for b in bookings:
        ev = b.evaluation
        if ev is not None:
            completed_count += 1
        rows.append(
            [
                b.id,
                b.level.value,
                b.slot.start_time.isoformat(),
                b.student.full_name,
                b.student.roll_number or "",
                b.status.value,
                ev.pre_approved_score if ev else "",
                ev.recommended_outcome.value if ev else "",
                "YES" if (ev and ev.is_approved) else "NO",
            ]
        )

    payout_total = completed_count * settings.viva_payout_per_slot_inr
    summary_rows = [
        ["Examiner Email", examiner.institute_email],
        ["Completed Vivas Evaluated", completed_count],
        ["Rate per 30-Min Viva (INR)", settings.viva_payout_per_slot_inr],
        ["Estimated Total Payout (INR)", payout_total],
    ]
    return _build_export_response(headers, rows, summary_rows, "examiner_viva_ledger", format)


@router.get("/instructor-gradebook")
def export_instructor_master_gradebook(
    cycle_id: int = Query(default=1),
    format: Literal["csv", "xlsx"] = Query(default="csv"),
    _: User = Depends(require_instructor),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Instructor exports master cohort bookings, Meet recording URLs, scores, and final grades."""
    bookings = db.scalars(
        select(Booking).where(Booking.cycle_id == cycle_id).order_by(Booking.id.asc())
    ).all()

    headers = [
        "Booking ID",
        "Roll Number",
        "Student Name",
        "Student Email",
        "Level",
        "Attempt #",
        "Examiner Email",
        "Window Start (UTC)",
        "Booking Status",
        "Recording Active",
        "Recording Drive URL",
        "Rubric Version",
        "Score (%)",
        "Final Outcome",
        "Assigned Grade",
        "Student Lifecycle State",
    ]
    rows = []
    for b in bookings:
        ev = b.evaluation
        rows.append(
            [
                b.id,
                b.student.roll_number or "",
                b.student.full_name,
                b.student.institute_email,
                b.level.value,
                b.attempt_number,
                b.slot.examiner.institute_email,
                b.slot.start_time.isoformat(),
                b.status.value,
                "YES" if b.slot.recording_active else "NO",
                b.slot.recording_drive_url or "",
                f"v{ev.rubric_version.version_number}" if ev else "",
                (ev.approved_score if ev.is_approved else ev.pre_approved_score) if ev else "",
                (ev.final_outcome.value if ev and ev.final_outcome else ""),
                b.student.final_project_grade or "",
                b.student.lifecycle_state.value if b.student.lifecycle_state else "",
            ]
        )

    summary_rows = [["Total Booking Records", len(rows)]]
    return _build_export_response(headers, rows, summary_rows, "iitm_ml_viva_master_gradebook", format)


@router.get("/audit-logs", response_model=list[AuditLogOut])
def list_immutable_audit_logs(
    limit: int = Query(default=50, ge=1, le=500),
    _: User = Depends(require_instructor),
    db: Session = Depends(get_db),
) -> list[AuditLog]:
    """Instructor views tamper-evident audit trail of rubric edits, approvals, and fee clearances."""
    return list(
        db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)).all()
    )
