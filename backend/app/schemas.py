from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import (
    BookingStatus,
    EvaluationOutcome,
    SlotStatus,
    StudentLifecycleState,
    UserRole,
    VivaLevel,
)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    institute_email: str
    role: UserRole
    examiner_level: Optional[VivaLevel] = None
    roll_number: Optional[str] = None
    project_repo_url: Optional[str] = None
    lifecycle_state: Optional[StudentLifecycleState] = None
    pending_reattempt_level: Optional[VivaLevel] = None
    final_project_grade: Optional[str] = None


class CheckMatrixCreateRequest(BaseModel):
    cycle_id: int = 1
    slot_starts: list[datetime] = Field(
        ...,
        min_length=1,
        description="List of ISO-8601 start timestamps; each creates a 30-minute viva slot.",
    )
    duration_minutes: int = Field(default=30, ge=15, le=90)


class SlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cycle_id: int
    examiner_id: int
    level: VivaLevel
    start_time: datetime
    end_time: datetime
    status: SlotStatus
    meet_join_url: Optional[str] = None
    examiner_cohost_granted: bool
    student_joined: bool
    examiner_joined: bool
    recording_active: bool


class PooledWindowOut(BaseModel):
    cycle_id: int
    level: VivaLevel
    window_start: datetime
    window_end: datetime
    open_seats: int
    total_seats: int


class ReserveSlotRequest(BaseModel):
    cycle_id: int = 1
    level: VivaLevel
    window_start: datetime


class BookingOut(BaseModel):
    id: int
    cycle_id: int
    slot_id: int
    student_id: int
    student_email: str
    student_name: str
    examiner_id: int
    examiner_name: str
    examiner_email: str
    level: VivaLevel
    attempt_number: int
    status: BookingStatus
    window_start: datetime
    window_end: datetime
    meet_join_url: Optional[str] = None
    booked_at: datetime


class RescheduleRequestIn(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500)


class ClearFeeRequestIn(BaseModel):
    iitm_fee_invoice_ref: str = Field(..., min_length=3, max_length=100)


class ProvisionMeetingsRequest(BaseModel):
    cycle_id: int = 1
    level: Optional[VivaLevel] = None
    auto_recording_enabled: bool = False


class SimulateTelemetryRequest(BaseModel):
    student_joined: Optional[bool] = None
    examiner_joined: Optional[bool] = None
    recording_active: Optional[bool] = None
    conference_ended: Optional[bool] = None
    recording_drive_url: Optional[str] = None


class LiveMeetingRowOut(BaseModel):
    slot_id: int
    booking_id: int
    level: VivaLevel
    window_start: datetime
    window_end: datetime
    student_name: str
    student_email: str
    examiner_name: str
    examiner_email: str
    meet_join_url: Optional[str]
    examiner_cohost_granted: bool
    student_joined: bool
    examiner_joined: bool
    recording_active: bool
    live_monitoring_badge: str
    recording_drive_url: Optional[str] = None


class QuestionInput(BaseModel):
    prompt: str = Field(..., min_length=3)
    max_marks: float = Field(default=10.0, gt=0)
    weight_pct: float = Field(..., gt=0, le=100)
    display_order: int = 1


class CreateRubricVersionRequest(BaseModel):
    cycle_id: int = 1
    level: VivaLevel
    title: str
    pass_percentage: float = Field(default=50.0, gt=0, le=100)
    questions: list[QuestionInput] = Field(..., min_length=1)

    @model_validator(mode="after")
    def check_weights_sum(self) -> "CreateRubricVersionRequest":
        total = round(sum(q.weight_pct for q in self.questions), 2)
        if abs(total - 100.0) > 0.05:
            raise ValueError(f"Question weights must sum to 100.0% (got {total}%)")
        return self


class QuestionWeightPatch(BaseModel):
    question_id: int
    weight_pct: float = Field(..., gt=0, le=100)


class ReweightRubricRequest(BaseModel):
    weights: list[QuestionWeightPatch] = Field(..., min_length=1)
    pass_percentage: Optional[float] = Field(default=None, gt=0, le=100)

    @model_validator(mode="after")
    def check_weights_sum(self) -> "ReweightRubricRequest":
        total = round(sum(w.weight_pct for w in self.weights), 2)
        if abs(total - 100.0) > 0.05:
            raise ValueError(f"Updated question weights must sum to 100.0% (got {total}%)")
        return self


class QuestionScoreInput(BaseModel):
    question_id: int
    raw_marks: float = Field(..., ge=0)
    comment: Optional[str] = None


class SubmitEvaluationRequest(BaseModel):
    booking_id: int
    scores: list[QuestionScoreInput] = Field(..., min_length=1)
    examiner_overall_remarks: Optional[str] = None


class ApproveEvaluationItem(BaseModel):
    evaluation_id: int
    override_outcome: Optional[EvaluationOutcome] = None
    assigned_letter_grade: Optional[Literal["D", "E"]] = Field(
        default=None,
        description="Required when approving an L2 FAIL outcome (assigns D or E in the project).",
    )


class BatchApproveRequest(BaseModel):
    approvals: list[ApproveEvaluationItem] = Field(..., min_length=1)
    send_result_emails: bool = True


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_email: str
    action: str
    entity_type: str
    entity_id: int
    before_state: Optional[dict[str, Any]] = None
    after_state: Optional[dict[str, Any]] = None
    created_at: datetime
