from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AuditLog,
    Booking,
    BookingStatus,
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
        full_name="Aniruddha Sir",
        institute_email="instructor@iitm.ac.in",
        role=UserRole.INSTRUCTOR,
    )
    examiner_l1_a = User(
        full_name="Saransh Saini",
        institute_email="saransh.l1@iitm.ac.in",
        role=UserRole.EXAMINER,
        examiner_level=VivaLevel.L1,
    )
    examiner_l1_b = User(
        full_name="Priya Nair",
        institute_email="priya.l1@iitm.ac.in",
        role=UserRole.EXAMINER,
        examiner_level=VivaLevel.L1,
    )
    examiner_l2 = User(
        full_name="Rohan Mehta",
        institute_email="rohan.l2@iitm.ac.in",
        role=UserRole.EXAMINER,
        examiner_level=VivaLevel.L2,
    )

    student1 = User(
        full_name="Aarav Sharma",
        institute_email="student1@ds.study.iitm.ac.in",
        role=UserRole.STUDENT,
        roll_number="23F2001045",
        project_repo_url="https://github.com/iitm-bs/23f2001045-mlp-capstone",
        lifecycle_state=StudentLifecycleState.BOOKED_L1,
    )
    student2 = User(
        full_name="Diya Verma",
        institute_email="student2@ds.study.iitm.ac.in",
        role=UserRole.STUDENT,
        roll_number="23F2001892",
        project_repo_url="https://github.com/iitm-bs/23f2001892-mlp-capstone",
        lifecycle_state=StudentLifecycleState.BOOKED_L1,
    )
    student3 = User(
        full_name="Kabir Iyer",
        institute_email="student3@ds.study.iitm.ac.in",
        role=UserRole.STUDENT,
        roll_number="23F3000411",
        project_repo_url="https://github.com/iitm-bs/23f3000411-mlp-capstone",
        lifecycle_state=StudentLifecycleState.ELIGIBLE_L2,
    )
    student4 = User(
        full_name="Meera Krishnan",
        institute_email="student4@ds.study.iitm.ac.in",
        role=UserRole.STUDENT,
        roll_number="23F2002310",
        project_repo_url="https://github.com/iitm-bs/23f2002310-mlp-capstone",
        lifecycle_state=StudentLifecycleState.ELIGIBLE_L1,
    )

    db.add_all(
        [instructor, examiner_l1_a, examiner_l1_b, examiner_l2, student1, student2, student3, student4]
    )
    db.flush()

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
        title="L2 Deep-Dive Theory, Regularization & Error Diagnostics (v1)",
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
                prompt="EDA, Data Leakage Prevention & Preprocessing Pipeline",
                max_marks=10.0,
                weight_pct=30.0,
                display_order=1,
            ),
            RubricQuestion(
                rubric_version_id=rubric_l1.id,
                prompt="Baseline vs. Final Model Selection & Metric Justification",
                max_marks=10.0,
                weight_pct=40.0,
                display_order=2,
            ),
            RubricQuestion(
                rubric_version_id=rubric_l1.id,
                prompt="Live Notebook Walkthrough & On-Spot Code Tweak",
                max_marks=10.0,
                weight_pct=30.0,
                display_order=3,
            ),
            RubricQuestion(
                rubric_version_id=rubric_l2.id,
                prompt="Mathematical Formulation of Chosen Estimators & Loss Functions",
                max_marks=10.0,
                weight_pct=40.0,
                display_order=1,
            ),
            RubricQuestion(
                rubric_version_id=rubric_l2.id,
                prompt="Bias-Variance Diagnostics, Failure Modes & Live Feature Engineering",
                max_marks=10.0,
                weight_pct=60.0,
                display_order=2,
            ),
        ]
    )

    ist = timezone(timedelta(hours=5, minutes=30))
    t_1000 = datetime(2026, 11, 10, 10, 0, tzinfo=ist)
    t_1030 = datetime(2026, 11, 10, 10, 30, tzinfo=ist)
    t_1100 = datetime(2026, 11, 10, 11, 0, tzinfo=ist)
    t_1130 = datetime(2026, 11, 10, 11, 30, tzinfo=ist)

    slot1 = VivaSlot(
        cycle_id=cycle.id,
        examiner_id=examiner_l1_a.id,
        level=VivaLevel.L1,
        start_time=t_1000,
        end_time=t_1030,
        status=SlotStatus.BOOKED,
        meet_space_id="spaces/mlp2026s1",
        meet_join_url="https://meet.google.com/iitm-mlp-slot1",
        calendar_event_id="cal_evt_1",
        examiner_cohost_granted=True,
        student_joined=True,
        examiner_joined=True,
        recording_active=True,
        recording_drive_url="https://drive.google.com/file/d/mlp_2026_slot1_rec/view",
    )
    slot2 = VivaSlot(
        cycle_id=cycle.id,
        examiner_id=examiner_l1_a.id,
        level=VivaLevel.L1,
        start_time=t_1030,
        end_time=t_1100,
        status=SlotStatus.BOOKED,
        meet_space_id="spaces/mlp2026s2",
        meet_join_url="https://meet.google.com/iitm-mlp-slot2",
        calendar_event_id="cal_evt_2",
        examiner_cohost_granted=True,
        student_joined=True,
        examiner_joined=True,
        recording_active=False,  # Deliberately unstarted to showcase the No-Recording Alert!
    )
    slot3 = VivaSlot(
        cycle_id=cycle.id,
        examiner_id=examiner_l1_a.id,
        level=VivaLevel.L1,
        start_time=t_1100,
        end_time=t_1130,
        status=SlotStatus.OPEN,
    )
    slot4 = VivaSlot(
        cycle_id=cycle.id,
        examiner_id=examiner_l1_b.id,
        level=VivaLevel.L1,
        start_time=t_1100,
        end_time=t_1130,
        status=SlotStatus.OPEN,
    )
    slot5 = VivaSlot(
        cycle_id=cycle.id,
        examiner_id=examiner_l2.id,
        level=VivaLevel.L2,
        start_time=t_1130,
        end_time=t_1130 + timedelta(minutes=30),
        status=SlotStatus.OPEN,
    )

    db.add_all([slot1, slot2, slot3, slot4, slot5])
    db.flush()

    db.add_all(
        [
            Booking(
                cycle_id=cycle.id,
                slot_id=slot1.id,
                student_id=student1.id,
                level=VivaLevel.L1,
                attempt_number=1,
                status=BookingStatus.BOOKED,
            ),
            Booking(
                cycle_id=cycle.id,
                slot_id=slot2.id,
                student_id=student2.id,
                level=VivaLevel.L1,
                attempt_number=2,
                status=BookingStatus.BOOKED,
            ),
            AuditLog(
                actor_email=instructor.institute_email,
                action="PROVISIONED_MEET_SPACES",
                entity_type="VivaCycle",
                entity_id=cycle.id,
                before_state=None,
                after_state={"provisioned_count": 2},
            ),
        ]
    )
    db.commit()
