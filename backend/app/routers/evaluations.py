from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_examiner, require_instructor
from app.models import (
    AuditLog,
    Booking,
    BookingStatus,
    Evaluation,
    EvaluationOutcome,
    EvaluationScore,
    RubricVersion,
    SlotStatus,
    StudentLifecycleState,
    User,
    VivaLevel,
)
from app.schemas import BatchApproveRequest, SubmitEvaluationRequest

router = APIRouter(prefix="/api/v1/evaluations", tags=["6. Examiner Grading & 1-Click Approval"])


@router.post("/submit", response_model=dict)
def submit_or_autosave_viva_marks(
    payload: SubmitEvaluationRequest,
    examiner: User = Depends(require_examiner),
    db: Session = Depends(get_db),
) -> dict:
    """
    Examiner Cockpit Grading: Saves raw per-question marks (idempotent for offline/debounced auto-save
    until instructor locks approval) and calculates weighted `pre_approved_score`.
    """
    booking = db.get(Booking, payload.booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.slot.examiner_id != examiner.id:
        raise HTTPException(
            status_code=403,
            detail="You can only evaluate bookings assigned to your own examiner slots.",
        )

    existing_eval = booking.evaluation
    if existing_eval and existing_eval.is_approved:
        raise HTTPException(
            status_code=409,
            detail="This evaluation has already been approved and locked by an instructor.",
        )

    # Bind to existing rubric version if updating, else current active rubric version for this level
    if existing_eval:
        rv = existing_eval.rubric_version
    else:
        rv = db.scalar(
            select(RubricVersion).where(
                RubricVersion.cycle_id == booking.cycle_id,
                RubricVersion.level == booking.level,
                RubricVersion.is_active.is_(True),
            )
        )
        if not rv:
            raise HTTPException(status_code=400, detail=f"No active rubric found for {booking.level}.")

    q_map = {q.id: q for q in rv.questions}
    submitted_q_ids = {s.question_id for s in payload.scores}
    if submitted_q_ids != set(q_map.keys()):
        raise HTTPException(
            status_code=400,
            detail=f"Must provide scores for exact rubric question IDs: {sorted(q_map.keys())}",
        )

    weighted_total = 0.0
    for item in payload.scores:
        q = q_map[item.question_id]
        if item.raw_marks > q.max_marks:
            raise HTTPException(
                status_code=400,
                detail=f"Question {q.id} max_marks is {q.max_marks}, got {item.raw_marks}.",
            )
        weighted_total += (item.raw_marks / q.max_marks) * q.weight_pct

    pre_score = round(weighted_total, 2)
    recommended = (
        EvaluationOutcome.PASS if pre_score >= rv.pass_percentage else EvaluationOutcome.FAIL
    )

    if not existing_eval:
        ev = Evaluation(
            booking_id=booking.id,
            rubric_version_id=rv.id,
            examiner_id=examiner.id,
            pre_approved_score=pre_score,
            recommended_outcome=recommended,
            examiner_overall_remarks=payload.examiner_overall_remarks,
        )
        db.add(ev)
        db.flush()
    else:
        ev = existing_eval
        ev.pre_approved_score = pre_score
        ev.recommended_outcome = recommended
        ev.examiner_overall_remarks = payload.examiner_overall_remarks
        ev.scores.clear()
        db.flush()

    for item in payload.scores:
        db.add(
            EvaluationScore(
                evaluation_id=ev.id,
                question_id=item.question_id,
                raw_marks=item.raw_marks,
                comment=item.comment,
            )
        )

    booking.status = BookingStatus.COMPLETED
    booking.slot.status = SlotStatus.COMPLETED
    booking.slot.conference_ended = True

    db.commit()
    return {
        "evaluation_id": ev.id,
        "booking_id": booking.id,
        "level": booking.level,
        "rubric_version_used": rv.version_number,
        "pre_approved_score": ev.pre_approved_score,
        "pass_threshold": rv.pass_percentage,
        "recommended_outcome": ev.recommended_outcome,
        "status": "AWAITING_INSTRUCTOR_APPROVAL",
    }


@router.get("/pending-approvals", response_model=list[dict])
def list_pending_instructor_approvals(
    cycle_id: int = 1,
    _: User = Depends(require_instructor),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Instructor queue displaying pre-approved weighted scores before 1-click approval & email dispatch."""
    evals = db.scalars(
        select(Evaluation)
        .join(Booking, Evaluation.booking_id == Booking.id)
        .where(Booking.cycle_id == cycle_id, Evaluation.is_approved.is_(False))
        .order_by(Evaluation.id.asc())
    ).all()

    return [
        {
            "evaluation_id": ev.id,
            "booking_id": ev.booking_id,
            "level": ev.booking.level,
            "student_name": ev.booking.student.full_name,
            "student_email": ev.booking.student.institute_email,
            "examiner_email": ev.booking.slot.examiner.institute_email,
            "rubric_version": ev.rubric_version.version_number,
            "pre_approved_score": ev.pre_approved_score,
            "recommended_outcome": ev.recommended_outcome,
            "examiner_overall_remarks": ev.examiner_overall_remarks,
            "question_breakdown": [
                {
                    "question_id": s.question_id,
                    "prompt": s.question.prompt,
                    "raw_marks": s.raw_marks,
                    "max_marks": s.question.max_marks,
                    "weight_pct": s.question.weight_pct,
                }
                for s in ev.scores
            ],
        }
        for ev in evals
    ]


@router.post("/approve-and-notify", response_model=dict)
def approve_scores_and_dispatch_emails(
    payload: BatchApproveRequest,
    instructor: User = Depends(require_instructor),
    db: Session = Depends(get_db),
) -> dict:
    """
    Instructor 1-Click Approval & Email Dispatch:
    - Locks final score
    - L1 PASS -> unlocks ELIGIBLE_L2
    - L1 FAIL -> moves student to AWAITING_IITM_FEE_CLEARANCE for paid reattempt
    - L2 PASS -> marks PROJECT_PASSED
    - L2 FAIL -> assigns final D or E grade in the project
    """
    dispatched_results: list[dict] = []
    now = datetime.now(timezone.utc)

    for item in payload.approvals:
        ev = db.get(Evaluation, item.evaluation_id)
        if not ev:
            raise HTTPException(status_code=404, detail=f"Evaluation {item.evaluation_id} not found.")
        if ev.is_approved:
            continue

        outcome = item.override_outcome or ev.recommended_outcome
        booking = ev.booking
        student = booking.student

        if booking.level == VivaLevel.L2 and outcome == EvaluationOutcome.FAIL:
            if item.assigned_letter_grade not in ("D", "E"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Evaluation {ev.id} is an L2 FAIL: please specify assigned_letter_grade as 'D' or 'E'.",
                )

        ev.is_approved = True
        ev.approved_score = ev.pre_approved_score
        ev.final_outcome = outcome
        ev.approved_by_id = instructor.id
        ev.approved_at = now
        ev.result_email_sent = payload.send_result_emails

        # Execute L1 -> L2 State Machine transitions
        if booking.level == VivaLevel.L1:
            if outcome == EvaluationOutcome.PASS:
                student.lifecycle_state = StudentLifecycleState.ELIGIBLE_L2
                email_summary = "CONGRATS: Passed L1 Viva! Your L2 Viva slot booking portal is now unlocked."
            else:
                student.lifecycle_state = StudentLifecycleState.AWAITING_IITM_FEE_CLEARANCE
                student.pending_reattempt_level = VivaLevel.L1
                email_summary = "L1 Viva Result: FAIL. Please complete the IITM reattempt fee invoice to book another L1 slot."
        else:
            if outcome == EvaluationOutcome.PASS:
                student.lifecycle_state = StudentLifecycleState.PROJECT_PASSED
                student.final_project_grade = "PASS"
                email_summary = "CONGRATS: Passed L2 Viva! You have successfully cleared the ML Project."
            else:
                ev.assigned_letter_grade = item.assigned_letter_grade
                student.final_project_grade = item.assigned_letter_grade
                student.lifecycle_state = (
                    StudentLifecycleState.PROJECT_FAILED_D
                    if item.assigned_letter_grade == "D"
                    else StudentLifecycleState.PROJECT_FAILED_E
                )
                email_summary = f"L2 Viva Result: FAIL. Final Project Grade Assigned: {item.assigned_letter_grade}."

        db.add(
            AuditLog(
                actor_email=instructor.institute_email,
                action="APPROVED_EVALUATION_AND_EMAILED",
                entity_type="Evaluation",
                entity_id=ev.id,
                before_state={"is_approved": False, "pre_approved_score": ev.pre_approved_score},
                after_state={
                    "is_approved": True,
                    "final_outcome": outcome.value,
                    "assigned_letter_grade": ev.assigned_letter_grade,
                    "student_new_lifecycle": student.lifecycle_state.value,
                },
            )
        )

        dispatched_results.append(
            {
                "evaluation_id": ev.id,
                "student_email": student.institute_email,
                "level": booking.level,
                "approved_score": ev.approved_score,
                "final_outcome": outcome,
                "assigned_letter_grade": ev.assigned_letter_grade,
                "new_student_lifecycle_state": student.lifecycle_state,
                "email_dispatched": payload.send_result_emails,
                "simulated_email_body": email_summary,
            }
        )

    db.commit()
    return {
        "approved_count": len(dispatched_results),
        "results": dispatched_results,
    }
