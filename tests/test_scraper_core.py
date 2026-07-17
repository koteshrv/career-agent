from backend import models
from backend.scraper_core import (
    is_valid_candidate,
    check_keywords_and_location,
    record_job,
    has_been_notified,
)


# ── is_valid_candidate ──────────────────────────────────────────────────────

def test_rejects_missing_href_or_title():
    assert not is_valid_candidate("", "Software Engineer")
    assert not is_valid_candidate("https://example.com/jobs/123", "")

def test_rejects_title_too_short_or_too_long():
    assert not is_valid_candidate("https://example.com/jobs/123", "Go")
    assert not is_valid_candidate("https://example.com/jobs/123", "X" * 201)

def test_rejects_known_nav_and_policy_links():
    assert not is_valid_candidate("https://example.com/login", "Sign In")
    assert not is_valid_candidate("https://example.com/privacy", "Privacy Policy")
    assert not is_valid_candidate("https://example.com/about", "About Us")

def test_rejects_by_title_pattern_even_with_job_like_url():
    # A URL that looks job-ish but a title that's clearly chrome, not a posting.
    assert not is_valid_candidate("https://example.com/jobs/apply", "Apply Now")

def test_accepts_plain_job_link_without_strict_hints():
    assert is_valid_candidate("https://example.com/careers/software-engineer", "Software Engineer")

def test_strict_hints_requires_a_hint_digit_or_deep_path():
    # No hint keyword, no digits, shallow path -> rejected under strict_hints.
    assert not is_valid_candidate("https://example.com/careers", "Software Engineer", strict_hints=True)
    # Hint keyword present ("/jobs/") -> accepted.
    assert is_valid_candidate("https://example.com/jobs/backend-dev", "Backend Developer", strict_hints=True)
    # No hint keyword, but a trailing job-ID number -> accepted.
    assert is_valid_candidate("https://example.com/careers/12345", "Backend Developer", strict_hints=True)
    # No hint keyword, no digits, but deeply nested path -> accepted.
    assert is_valid_candidate("https://example.com/a/b/c/d/backend-developer", "Backend Developer", strict_hints=True)


# ── check_keywords_and_location ─────────────────────────────────────────────

def test_rejects_seniority_titles_regardless_of_keywords():
    kws, locs = ["engineer"], ["india"]
    for title in ["Engineering Manager", "Senior Director", "VP Engineering", "Principal Engineer", "Team Lead"]:
        assert not check_keywords_and_location(title, "Bangalore, India", kws, locs)

def test_accepts_matching_location():
    assert check_keywords_and_location("Software Engineer", "Bangalore, India", ["engineer"], ["india", "bangalore"])

def test_rejects_non_matching_location():
    assert not check_keywords_and_location("Software Engineer", "New York, USA", ["engineer"], ["india", "bangalore"])

def test_empty_location_is_treated_as_a_match():
    # No location string on the posting shouldn't disqualify it — let the AI decide.
    assert check_keywords_and_location("Software Engineer", "", ["engineer"], ["india"])


# ── record_job / has_been_notified (DB-backed) ──────────────────────────────

def test_record_job_creates_new_job(db_session):
    job = record_job(db_session, "Acme", "Backend Engineer", "https://acme.com/jobs/1", "Remote")
    db_session.commit()
    assert job.company == "Acme"
    assert job.status == "NEW"

def test_record_job_is_idempotent_for_active_jobs(db_session):
    first = record_job(db_session, "Acme", "Backend Engineer", "https://acme.com/jobs/1", "Remote")
    db_session.commit()
    first.status = "APPLIED"
    db_session.commit()

    second = record_job(db_session, "Acme", "Backend Engineer", "https://acme.com/jobs/1", "Remote")
    assert second.id == first.id
    assert second.status == "APPLIED"  # untouched — must not reset an active application

def test_record_job_resurfaces_trashed_jobs(db_session):
    job = record_job(db_session, "Acme", "Backend Engineer", "https://acme.com/jobs/2", "Remote")
    db_session.commit()
    job.status = "TRASH"
    db_session.commit()

    resurfaced = record_job(db_session, "Acme", "Backend Engineer", "https://acme.com/jobs/2", "Remote")
    assert resurfaced.id == job.id
    assert resurfaced.status == "NEW"
    assert resurfaced.match_score is None

def test_record_job_resurfaces_rejected_and_ignored_jobs(db_session):
    for status in ("REJECTED", "IGNORED"):
        job = record_job(db_session, "Acme", "Backend Engineer", f"https://acme.com/jobs/{status}", "Remote")
        db_session.commit()
        job.status = status
        db_session.commit()

        resurfaced = record_job(db_session, "Acme", "Backend Engineer", f"https://acme.com/jobs/{status}", "Remote")
        assert resurfaced.status == "NEW"

def test_has_been_notified_true_for_recent_active_job(db_session):
    record_job(db_session, "Acme", "Backend Engineer", "https://acme.com/jobs/3", "Remote")
    db_session.commit()
    assert has_been_notified(db_session, "https://acme.com/jobs/3") is True

def test_has_been_notified_false_for_unseen_url(db_session):
    assert has_been_notified(db_session, "https://acme.com/jobs/never-seen") is False

def test_has_been_notified_false_for_trashed_job(db_session):
    job = record_job(db_session, "Acme", "Backend Engineer", "https://acme.com/jobs/4", "Remote")
    db_session.commit()
    job.status = "TRASH"
    db_session.commit()
    # A trashed job should be treated as "not notified" so it can resurface on rescrape.
    assert has_been_notified(db_session, "https://acme.com/jobs/4") is False
