from datetime import datetime, timedelta, timezone

from backend import models, crud
from backend.followups import compute_follow_up_state, is_follow_up_eligible

USER = 1
NOW = datetime(2026, 9, 18, tzinfo=timezone.utc)


_url_counter = [0]


def make_job(db_session, **overrides):
    _url_counter[0] += 1
    defaults = dict(user_id=USER, company="Acme", title="Backend Engineer", url=f"https://acme.com/jobs/{_url_counter[0]}", status="APPLIED")
    defaults.update(overrides)
    job = models.Job(**defaults)
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    return job


def test_new_and_rejected_are_never_eligible(db_session):
    assert not is_follow_up_eligible(make_job(db_session, status="NEW"))
    assert not is_follow_up_eligible(make_job(db_session, status="REJECTED"))
    assert not is_follow_up_eligible(make_job(db_session, status="IGNORED"))


def test_applied_not_due_before_cadence_window(db_session):
    job = make_job(db_session, applied_at=NOW - timedelta(days=3))
    state = compute_follow_up_state(job, now=NOW)
    assert state.urgency == "not_due"


def test_applied_due_at_seven_days(db_session):
    job = make_job(db_session, applied_at=NOW - timedelta(days=7))
    state = compute_follow_up_state(job, now=NOW)
    assert state.urgency == "due"


def test_applied_overdue_past_grace_window(db_session):
    job = make_job(db_session, applied_at=NOW - timedelta(days=11))
    state = compute_follow_up_state(job, now=NOW)
    assert state.urgency == "overdue"


def test_applied_upcoming_within_window(db_session):
    job = make_job(db_session, applied_at=NOW - timedelta(days=5))
    state = compute_follow_up_state(job, now=NOW)
    assert state.urgency == "upcoming"


def test_no_applied_at_is_not_due_not_a_crash(db_session):
    job = make_job(db_session, applied_at=None)
    state = compute_follow_up_state(job, now=NOW)
    assert state.urgency == "not_due"


def test_max_follow_ups_caps_further_nudges(db_session):
    job = make_job(db_session, applied_at=NOW - timedelta(days=30), follow_up_count=2)
    state = compute_follow_up_state(job, now=NOW)
    assert state.urgency == "not_due"
    assert "max" in state.reason.lower()


def test_snooze_pushes_due_date_out(db_session):
    job = make_job(db_session, applied_at=NOW - timedelta(days=7), follow_up_snoozed_until=NOW + timedelta(days=4))
    state = compute_follow_up_state(job, now=NOW)
    assert state.urgency == "not_due"
    assert state.due_date == NOW + timedelta(days=4)


def test_expired_snooze_is_ignored(db_session):
    job = make_job(db_session, applied_at=NOW - timedelta(days=7), follow_up_snoozed_until=NOW - timedelta(days=1))
    state = compute_follow_up_state(job, now=NOW)
    assert state.urgency == "due"


def test_log_follow_up_advances_anchor_and_clears_snooze(db_session):
    job = make_job(db_session, applied_at=NOW - timedelta(days=7), follow_up_snoozed_until=NOW + timedelta(days=2))
    updated = crud.log_follow_up(db_session, USER, job.id)
    assert updated.follow_up_count == 1
    assert updated.follow_up_snoozed_until is None
    assert updated.last_follow_up_at is not None

    # Anchor is now last_follow_up_at (just now), so the next one isn't due for 7 more days.
    state = compute_follow_up_state(updated, now=NOW)
    assert state.urgency in ("not_due", "upcoming")


def test_snooze_follow_up_sets_override(db_session):
    job = make_job(db_session, applied_at=NOW - timedelta(days=7))
    until = NOW + timedelta(days=5)
    updated = crud.snooze_follow_up(db_session, USER, job.id, until)
    # SQLite has no native timezone-aware storage — the round-tripped value
    # comes back naive even though an aware datetime was written; the app
    # itself normalizes this (see followups.py), only the test needs to here.
    assert updated.follow_up_snoozed_until.replace(tzinfo=timezone.utc) == until
