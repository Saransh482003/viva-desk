from datetime import datetime, timezone
import enum
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, enum.Enum):
    INSTRUCTOR = "INSTRUCTOR"
    EXAMINER = "EXAMINER"
    STUDENT = "STUDENT"


class VivaLevel(str, enum.Enum):
    L1 = "L1"
    L2 = "L2"


class StudentLifecycleState(str, enum.Enum):
    ELIGIBLE_L1 = "ELIGIBLE_L1"
    BOOKED_L1 = "BOOKED_L1"
    AWAITING_IITM_FEE_CLEARANCE = "AWAITING_IITM_FEE_CLEARANCE"
    ELIGIBLE_L2 = "ELIGIBLE_L2"
    BOOKED_L2 = "BOOKED_L2"
    PROJECT_PASSED = "PROJECT_PASSED"
    PROJECT_FAILED_D = "PROJECT_FAILED_D"
    PROJECT_FAILED_E = "PROJECT_FAILED_E"


class SlotStatus(str, enum.Enum):
    OPEN = "OPEN"
    BOOKED = "BOOKED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class BookingStatus(str, enum.Enum):
    BOOKED = "BOOKED"
    COMPLETED = "COMPLETED"
    RESCHEDULE_REQUESTED = "RESCHEDULE_REQUESTED"
    CANCELLED = "CANCELLED"


class EvaluationOutcome(str, enum.Enum):
    PASS = "PASS"
    FAIL = "FAIL"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    institute_email: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    examiner_level: Mapped[Optional[VivaLevel]] = mapped_column(Enum(VivaLevel), nullable=True)

    # Student-specific fields
    roll_number: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    project_repo_url: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    lifecycle_state: Mapped[Optional[StudentLifecycleState]] = mapped_column(
        Enum(StudentLifecycleState), nullable=True
    )
    pending_reattempt_level: Mapped[Optional[VivaLevel]] = mapped_column(Enum(VivaLevel), nullable=True)
    final_project_grade: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class VivaCycle(Base):
    __tablename__ = "viva_cycles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(140), unique=True, nullable=False)
    term_code: Mapped[str] = mapped_column(String(40), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class VivaSlot(Base):
    __tablename__ = "viva_slots"
    __table_args__ = (
        UniqueConstraint("examiner_id", "start_time", name="uq_examiner_start_time"),
        Index("ix_slots_pool_lookup", "cycle_id", "level", "start_time", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("viva_cycles.id"), nullable=False)
    examiner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    level: Mapped[VivaLevel] = mapped_column(Enum(VivaLevel), nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[SlotStatus] = mapped_column(Enum(SlotStatus), default=SlotStatus.OPEN, nullable=False)

    # Provisioned Google Meet + Calendar metadata (mocked for MVP, 1:1 with Meet REST API v2 fields)
    meet_space_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    meet_join_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    calendar_event_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    examiner_cohost_granted: Mapped[bool] = mapped_column(Boolean, default=False)
    provisioned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Live Telemetry flags (updated via Workspace Events webhook or simulation endpoint)
    student_joined: Mapped[bool] = mapped_column(Boolean, default=False)
    examiner_joined: Mapped[bool] = mapped_column(Boolean, default=False)
    recording_active: Mapped[bool] = mapped_column(Boolean, default=False)
    conference_ended: Mapped[bool] = mapped_column(Boolean, default=False)
    recording_drive_url: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    last_telemetry_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    examiner: Mapped["User"] = relationship("User", foreign_keys=[examiner_id])
    bookings: Mapped[list["Booking"]] = relationship("Booking", back_populates="slot")


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        # Prevents double-clicks or concurrent tabs from creating two active bookings for the same level!
        Index(
            "uq_active_student_level_booking",
            "cycle_id",
            "student_id",
            "level",
            unique=True,
            postgresql_where=text("status = 'BOOKED'"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("viva_cycles.id"), nullable=False)
    slot_id: Mapped[int] = mapped_column(ForeignKey("viva_slots.id"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    level: Mapped[VivaLevel] = mapped_column(Enum(VivaLevel), nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus), default=BookingStatus.BOOKED, nullable=False
    )
    reschedule_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notebook_gdrive_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    iitm_fee_invoice_ref: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    fee_cleared_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    booked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    slot: Mapped["VivaSlot"] = relationship("VivaSlot", back_populates="bookings")
    student: Mapped["User"] = relationship("User", foreign_keys=[student_id])
    evaluation: Mapped[Optional["Evaluation"]] = relationship(
        "Evaluation", back_populates="booking", uselist=False
    )


class RubricVersion(Base):
    __tablename__ = "rubric_versions"
    __table_args__ = (
        UniqueConstraint("cycle_id", "level", "version_number", name="uq_cycle_level_version"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("viva_cycles.id"), nullable=False)
    level: Mapped[VivaLevel] = mapped_column(Enum(VivaLevel), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    pass_percentage: Mapped[float] = mapped_column(Float, default=50.0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    questions: Mapped[list["RubricQuestion"]] = relationship(
        "RubricQuestion", back_populates="rubric_version", order_by="RubricQuestion.display_order"
    )


class RubricQuestion(Base):
    __tablename__ = "rubric_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    rubric_version_id: Mapped[int] = mapped_column(
        ForeignKey("rubric_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    max_marks: Mapped[float] = mapped_column(Float, default=10.0, nullable=False)
    weight_pct: Mapped[float] = mapped_column(Float, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    rubric_version: Mapped["RubricVersion"] = relationship("RubricVersion", back_populates="questions")


class Evaluation(Base):
    __tablename__ = "evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), unique=True, nullable=False)
    rubric_version_id: Mapped[int] = mapped_column(ForeignKey("rubric_versions.id"), nullable=False)
    examiner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    pre_approved_score: Mapped[float] = mapped_column(Float, nullable=False)
    recommended_outcome: Mapped[EvaluationOutcome] = mapped_column(
        Enum(EvaluationOutcome), nullable=False
    )
    examiner_overall_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Instructor Approval & 1-Click Result Dispatch lock
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    approved_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    final_outcome: Mapped[Optional[EvaluationOutcome]] = mapped_column(
        Enum(EvaluationOutcome), nullable=True
    )
    assigned_letter_grade: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    approved_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    result_email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    booking: Mapped["Booking"] = relationship("Booking", back_populates="evaluation")
    rubric_version: Mapped["RubricVersion"] = relationship("RubricVersion")
    scores: Mapped[list["EvaluationScore"]] = relationship(
        "EvaluationScore", back_populates="evaluation", cascade="all, delete-orphan"
    )


class EvaluationScore(Base):
    __tablename__ = "evaluation_scores"
    __table_args__ = (
        UniqueConstraint("evaluation_id", "question_id", name="uq_eval_question_score"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    evaluation_id: Mapped[int] = mapped_column(
        ForeignKey("evaluations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(ForeignKey("rubric_questions.id"), nullable=False)
    raw_marks: Mapped[float] = mapped_column(Float, nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    evaluation: Mapped["Evaluation"] = relationship("Evaluation", back_populates="scores")
    question: Mapped["RubricQuestion"] = relationship("RubricQuestion")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    actor_email: Mapped[str] = mapped_column(String(160), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    before_state: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    after_state: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
