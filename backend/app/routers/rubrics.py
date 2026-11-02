from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_instructor
from app.models import (
    AuditLog,
    Evaluation,
    EvaluationOutcome,
    RubricQuestion,
    RubricVersion,
    User,
    VivaLevel,
)
from app.schemas import CreateRubricVersionRequest, ReweightRubricRequest

router = APIRouter(prefix="/api/v1/rubrics", tags=["5. Versioned Rubrics & Safe Re-Weighting"])


def _serialize_rubric(rv: RubricVersion) -> dict:
    return {
        "rubric_version_id": rv.id,
        "cycle_id": rv.cycle_id,
        "level": rv.level,
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


@router.get("", response_model=list[dict])
def get_rubrics(
    cycle_id: int = Query(default=1),
    level: VivaLevel | None = Query(default=None),
    active_only: bool = Query(default=True),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Lists active (or historical) versioned rubrics and question weights."""
    stmt = select(RubricVersion).where(RubricVersion.cycle_id == cycle_id)
    if level:
        stmt = stmt.where(RubricVersion.level == level)
    if active_only:
        stmt = stmt.where(RubricVersion.is_active.is_(True))
    stmt = stmt.order_by(RubricVersion.level.asc(), RubricVersion.version_number.desc())
    versions = db.scalars(stmt).all()
    return [_serialize_rubric(v) for v in versions]


@router.post("/new-version", response_model=dict, status_code=status.HTTP_201_CREATED)
def publish_new_rubric_version(
    payload: CreateRubricVersionRequest,
    instructor: User = Depends(require_instructor),
    db: Session = Depends(get_db),
) -> dict:
    """
    Prospective Question Edit: Creates version `v+1` and marks it active for future vivas,
    leaving all earlier evaluations safely bound to `v1` without breaking foreign keys or scores!
    """
    max_ver = db.scalar(
        select(func.max(RubricVersion.version_number)).where(
            RubricVersion.cycle_id == payload.cycle_id,
            RubricVersion.level == payload.level,
        )
    ) or 0

    # Deactivate prior versions for this level
    prior_versions = db.scalars(
        select(RubricVersion).where(
            RubricVersion.cycle_id == payload.cycle_id,
            RubricVersion.level == payload.level,
            RubricVersion.is_active.is_(True),
        )
    ).all()
    for pv in prior_versions:
        pv.is_active = False

    new_rv = RubricVersion(
        cycle_id=payload.cycle_id,
        level=payload.level,
        version_number=int(max_ver) + 1,
        title=payload.title,
        pass_percentage=payload.pass_percentage,
        is_active=True,
        created_by_id=instructor.id,
    )
    db.add(new_rv)
    db.flush()

    for q in payload.questions:
        db.add(
            RubricQuestion(
                rubric_version_id=new_rv.id,
                prompt=q.prompt,
                max_marks=q.max_marks,
                weight_pct=q.weight_pct,
                display_order=q.display_order,
            )
        )

    db.add(
        AuditLog(
            actor_email=instructor.institute_email,
            action="PUBLISHED_NEW_RUBRIC_VERSION",
            entity_type="RubricVersion",
            entity_id=new_rv.id,
            before_state={"previous_latest_version": int(max_ver)},
            after_state={"new_version_number": new_rv.version_number, "level": payload.level.value},
        )
    )
    db.commit()
    db.refresh(new_rv)
    return _serialize_rubric(new_rv)


@router.patch("/{rubric_version_id}/reweight", response_model=dict)
def reweight_existing_rubric_questions(
    rubric_version_id: int,
    payload: ReweightRubricRequest,
    instructor: User = Depends(require_instructor),
    db: Session = Depends(get_db),
) -> dict:
    """
    Retroactive Weight Adjustment: Updates question `weight_pct` values and dynamically recomputes
    `pre_approved_score` across all unapproved evaluations WITHOUT altering any examiner `raw_marks`!
    """
    rv = db.get(RubricVersion, rubric_version_id)
    if not rv:
        raise HTTPException(status_code=404, detail="RubricVersion not found.")

    q_map = {q.id: q for q in rv.questions}
    if set(w.question_id for w in payload.weights) != set(q_map.keys()):
        raise HTTPException(
            status_code=400,
            detail=f"Provide weights for all question IDs in this rubric version: {sorted(q_map.keys())}",
        )

    before_weights = {str(q.id): q.weight_pct for q in rv.questions}
    for patch in payload.weights:
        q_map[patch.question_id].weight_pct = patch.weight_pct

    if payload.pass_percentage is not None:
        rv.pass_percentage = payload.pass_percentage

    # Recompute pre_approved_score on all unapproved evaluations tied to this rubric version
    unapproved_evals = db.scalars(
        select(Evaluation).where(
            Evaluation.rubric_version_id == rv.id,
            Evaluation.is_approved.is_(False),
        )
    ).all()

    recalculated_count = 0
    for ev in unapproved_evals:
        weighted_sum = 0.0
        for sc in ev.scores:
            q = q_map[sc.question_id]
            weighted_sum += (sc.raw_marks / q.max_marks) * q.weight_pct
        ev.pre_approved_score = round(weighted_sum, 2)
        ev.recommended_outcome = (
            EvaluationOutcome.PASS
            if ev.pre_approved_score >= rv.pass_percentage
            else EvaluationOutcome.FAIL
        )
        recalculated_count += 1

    db.add(
        AuditLog(
            actor_email=instructor.institute_email,
            action="REWEIGHTED_RUBRIC_VERSION",
            entity_type="RubricVersion",
            entity_id=rv.id,
            before_state={"weights": before_weights},
            after_state={
                "weights": {str(w.question_id): w.weight_pct for w in payload.weights},
                "recalculated_unapproved_evaluations": recalculated_count,
            },
        )
    )
    db.commit()
    return {
        "message": "Weights updated safely; raw examiner marks preserved.",
        "recalculated_unapproved_evaluations": recalculated_count,
        "rubric": _serialize_rubric(rv),
    }
