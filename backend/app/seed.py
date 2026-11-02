from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    RubricQuestion,
    RubricVersion,
    SlotStatus,
    StudentLifecycleState,
    User,
    UserRole,
    VivaCycle,
    VivaLevel,
    VivaSlot,
)


def seed_initial_data(db: Session) -> None:
    existing_cycle = db.scalar(select(VivaCycle).limit(1))
    if existing_cycle:
        return

    cycle = VivaCycle(
        name="MLP Project Viva — Nov 2026 Term",
        term_code="2026-T3",
        is_active=True,
    )
    db.add(cycle)
    db.flush()

    instructor = User(
        full_name="Prof. Arun Rajkumar (Course Instructor)",
        institute_email="instructor@iitm.ac.in",
        role=UserRole.INSTRUCTOR,
    )
    examiner_l1_a = User(
        full_name="Saransh Saini (L1 Examiner)",
        institute_email="saransh.l1@iitm.ac.in",
        role=UserRole.EXAMINER,
        examiner_level=VivaLevel.L1,
    )
    examiner_l1_b = User(
        full_name="Priya Nair (L1 Examiner)",
        institute_email="priya.l1@iitm.ac.in",
        role=UserRole.EXAMINER,
        examiner_level=VivaLevel.L1,
    )
    examiner_l2 = User(
        full_name="Rohan Mehta (L2 Senior Examiner)",
        institute_email="rohan.l2@iitm.ac.in",
        role=UserRole.EXAMINER,
        examiner_level=VivaLevel.L2,
    )

    students = [
        User(
            full_name="Aarav Sharma",
            institute_email="student1@ds.study.iitm.ac.in",
            role=UserRole.STUDENT,
            roll_number="23F2001045",
            project_repo_url="https://github.com/iitm-bs/23f2001045-mlp-capstone",
            lifecycle_state=StudentLifecycleState.ELIGIBLE_L1,
        ),
        User(
            full_name="Diya Verma",
            institute_email="student2@ds.study.iitm.ac.in",
            role=UserRole.STUDENT,
            roll_number="23F2001892",
            project_repo_url="https://github.com/iitm-bs/23f2001892-mlp-capstone",
            lifecycle_state=StudentLifecycleState.ELIGIBLE_L1,
        ),
        User(
            full_name="Kabir Iyer",
            institute_email="student3@ds.study.iitm.ac.in",
            role=UserRole.STUDENT,
            roll_number="23F3000411",
            project_repo_url="https://github.com/iitm-bs/23f3000411-mlp-capstone",
            lifecycle_state=StudentLifecycleState.ELIGIBLE_L2,
        ),
    ]

    db.add_all([instructor, examiner_l1_a, examiner_l1_b, examiner_l2, *students])
    db.flush()

    # Seed Version 1 Rubrics for L1 and L2
    rubric_l1 = RubricVersion(
        cycle_id=cycle.id,
        level=VivaLevel.L1,
        version_number=1,
        title="L1 Core ML Pipeline & Code Ownership Rubric (v1)",
        pass_percentage=50.0,
        is_active=True,
        created_by_id=instructor.id,
    )
    rubric_l2 = RubricVersion(
        cycle_id=cycle.id,
        level=VivaLevel.L2,
        version_number=1,
        title="L2 Deep-Dive Theory, Hyperparameters & Live Modification Rubric (v1)",
        pass_percentage=60.0,
        is_active=True,
        created_by_id=instructor.id,
    )
    db.add_all([rubric_l1, rubric_l2])
    db.flush()

    db.add_all(
        [
            RubricQuestion(
                rubric_version_id=rubric_l1.id,
                prompt="Exploratory Data Analysis, Leakage Prevention & Preprocessing Pipeline",
                max_marks=10.0,
                weight_pct=30.0,
                display_order=1,
            ),
            RubricQuestion(
                rubric_version_id=rubric_l1.id,
                prompt="Baseline vs. Final Model Selection & Evaluation Metrics Justification",
                max_marks=10.0,
                weight_pct=40.0,
                display_order=2,
            ),
            RubricQuestion(
                rubric_version_id=rubric_l1.id,
                prompt="Code Walkthrough & Live Notebook Verification",
                max_marks=10.0,
                weight_pct=30.0,
                display_order=3,
            ),
            RubricQuestion(
                rubric_version_id=rubric_l2.id,
                prompt="Mathematical Intuition Behind Chosen Estimators & Regularization",
                max_marks=10.0,
                weight_pct=40.0,
                display_order=1,
            ),
            RubricQuestion(
                rubric_version_id=rubric_l2.id,
                prompt="Error Analysis, Bias-Variance Diagnostics & Live Feature Tweak",
                max_marks=10.0,
                weight_pct=60.0,
                display_order=2,
            ),
        ]
    )

    # Pre-seed pooled slots on 2026-11-10 (IST +05:30 -> stored UTC) so Postman reservation works immediately
    ist = timezone(timedelta(hours=5, minutes=30))
    slot_10am = datetime(2026, 11, 10, 10, 0, tzinfo=ist)
    slot_1030am = datetime(2026, 11, 10, 10, 30, tzinfo=ist)
    slot_11am = datetime(2026, 11, 10, 11, 0, tzinfo=ist)

    seeded_slots = [
        # Two L1 examiners available at 10:00 AM IST -> Pooled window shows 2 open seats!
        VivaSlot(
            cycle_id=cycle.id,
            examiner_id=examiner_l1_a.id,
            level=VivaLevel.L1,
            start_time=slot_10am,
            end_time=slot_10am + timedelta(minutes=30),
            status=SlotStatus.OPEN,
        ),
        VivaSlot(
            cycle_id=cycle.id,
            examiner_id=examiner_l1_b.id,
            level=VivaLevel.L1,
            start_time=slot_10am,
            end_time=slot_10am + timedelta(minutes=30),
            status=SlotStatus.OPEN,
        ),
        VivaSlot(
            cycle_id=cycle.id,
            examiner_id=examiner_l1_a.id,
            level=VivaLevel.L1,
            start_time=slot_1030am,
            end_time=slot_1030am + timedelta(minutes=30),
            status=SlotStatus.OPEN,
        ),
        # L2 slot at 11:00 AM IST
        VivaSlot(
            cycle_id=cycle.id,
            examiner_id=examiner_l2.id,
            level=VivaLevel.L2,
            start_time=slot_11am,
            end_time=slot_11am + timedelta(minutes=30),
            status=SlotStatus.OPEN,
        ),
    ]
    db.add_all(seeded_slots)
    db.commit()
