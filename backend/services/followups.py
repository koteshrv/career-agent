"""Follow-up cadence: when a tracked application is due a nudge.

Adapted from career-ops's followup-cadence.mjs defaults (applied_first=7d,
applied_subsequent=7d, applied_max_followups=2) to this project's own status
vocabulary (NEW/APPLIED/INTERVIEWING/REJECTED/IGNORED — no separate
RESPONDED state). Purely computed from existing fields plus the two new
per-job counters (last_follow_up_at, follow_up_count) — nothing runs on a
schedule; a job's follow-up state is recomputed fresh every time it's read.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from backend.database import models

# Days after the anchor (applied_at, or the previous follow-up) before the
# next one is due. Only these two statuses ever need a follow-up nudge.
CADENCE_DAYS = {
    "APPLIED": 7,
    "INTERVIEWING": 3,
}
MAX_FOLLOW_UPS = {
    "APPLIED": 2,
    "INTERVIEWING": 3,
}
# How far past due before a follow-up is "overdue" rather than merely "due".
OVERDUE_AFTER_DAYS = 3
# How close to due counts as "upcoming" (surfaced but not actionable yet).
UPCOMING_WITHIN_DAYS = 3


@dataclass
class FollowUpState:
    urgency: str  # "overdue" | "due" | "upcoming" | "not_due"
    due_date: Optional[datetime]
    reason: str


def _anchor_date(job: models.Job) -> Optional[datetime]:
    if job.last_follow_up_at:
        return job.last_follow_up_at
    if job.status == "APPLIED":
        return job.applied_at
    # INTERVIEWING has no dedicated "became interviewing" timestamp; updated_at
    # is the closest proxy available without adding a status-transition log.
    return job.updated_at


def compute_follow_up_state(job: models.Job, now: Optional[datetime] = None) -> FollowUpState:
    now = now or datetime.now(timezone.utc)

    cadence_days = CADENCE_DAYS.get(job.status)
    if cadence_days is None:
        return FollowUpState("not_due", None, f"No follow-up cadence for status {job.status}")

    max_follow_ups = MAX_FOLLOW_UPS.get(job.status, 2)
    if (job.follow_up_count or 0) >= max_follow_ups:
        return FollowUpState("not_due", None, f"Already followed up {job.follow_up_count} times (max {max_follow_ups})")

    anchor = _anchor_date(job)
    if anchor is None:
        return FollowUpState("not_due", None, "No anchor date to compute a due date from")
    if anchor.tzinfo is None:
        anchor = anchor.replace(tzinfo=timezone.utc)

    due_date = anchor + timedelta(days=cadence_days)

    if job.follow_up_snoozed_until:
        snoozed_until = job.follow_up_snoozed_until
        if snoozed_until.tzinfo is None:
            snoozed_until = snoozed_until.replace(tzinfo=timezone.utc)
        if snoozed_until > now:
            due_date = max(due_date, snoozed_until)

    days_overdue = (now - due_date).days
    if days_overdue >= OVERDUE_AFTER_DAYS:
        urgency = "overdue"
    elif now >= due_date:
        urgency = "due"
    elif (due_date - now).days <= UPCOMING_WITHIN_DAYS:
        urgency = "upcoming"
    else:
        urgency = "not_due"

    n = (job.follow_up_count or 0) + 1
    reason = f"{'First' if n == 1 else f'{n}th'} follow-up since {'applying' if job.status == 'APPLIED' else 'last activity'}"
    return FollowUpState(urgency, due_date, reason)


def is_follow_up_eligible(job: models.Job) -> bool:
    return job.status in CADENCE_DAYS
