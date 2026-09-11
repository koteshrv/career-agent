"""Tests for backend.crowdsourcing — the career-agent-api push/pull sync."""
from unittest.mock import patch, MagicMock

from backend import crud, schemas, crowdsourcing

USER = 1
OTHER_USER = 2


def _connect(db, user_id=USER, token="fake-cloud-token"):
    crud.update_settings(db, user_id, schemas.SettingsBase(career_agent_cloud_token=token))


def _make_job(db, url, user_id=USER, company="Acme", title="Engineer"):
    from backend import models
    job = models.Job(user_id=user_id, company=company, title=title, url=url, location="Remote")
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


# ── Not connected ────────────────────────────────────────────────────────────

def test_push_skips_when_not_connected(db_session):
    with patch("backend.crowdsourcing.requests.post") as mock_post:
        result = crowdsourcing.push_jobs(db_session, USER)
    assert result["skipped"] is True
    mock_post.assert_not_called()


def test_pull_skips_when_not_connected(db_session):
    with patch("backend.crowdsourcing.requests.get") as mock_get:
        result = crowdsourcing.pull_jobs(db_session, USER)
    assert result["skipped"] is True
    mock_get.assert_not_called()


# ── Push ─────────────────────────────────────────────────────────────────────

def test_push_sends_only_unpushed_jobs_with_real_token(db_session):
    _connect(db_session, token="real-token-123")
    _make_job(db_session, "https://acme.com/jobs/1")
    _make_job(db_session, "https://acme.com/jobs/2")

    with patch("backend.crowdsourcing.requests.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=200, json=lambda: {
            "success": True, "jobs_accepted": 2, "credits_earned": 2,
        })
        result = crowdsourcing.push_jobs(db_session, USER)

    assert result["success"] is True
    assert result["jobs_sent"] == 2

    _, kwargs = mock_post.call_args
    assert kwargs["headers"]["Authorization"] == "Bearer real-token-123"
    assert len(kwargs["json"]["jobs"]) == 2


def test_push_marks_jobs_pushed_only_on_success(db_session):
    _connect(db_session)
    job = _make_job(db_session, "https://acme.com/jobs/1")

    with patch("backend.crowdsourcing.requests.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=200, json=lambda: {"success": True})
        crowdsourcing.push_jobs(db_session, USER)

    db_session.refresh(job)
    assert job.crowdsource_pushed_at is not None


def test_push_leaves_jobs_unpushed_on_failure(db_session):
    """A network failure or non-200 must not mark jobs as pushed — they need to be
    retried on the next cycle, not silently dropped from the backlog forever."""
    _connect(db_session)
    job = _make_job(db_session, "https://acme.com/jobs/1")

    with patch("backend.crowdsourcing.requests.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=401, text="expired")
        result = crowdsourcing.push_jobs(db_session, USER)

    assert result["success"] is False
    db_session.refresh(job)
    assert job.crowdsource_pushed_at is None
    # And it must still be picked up next cycle.
    assert job.id in [j.id for j in crud.get_unpushed_jobs(db_session, USER)]


def test_push_does_not_resend_already_pushed_jobs(db_session):
    _connect(db_session)
    _make_job(db_session, "https://acme.com/jobs/1")

    with patch("backend.crowdsourcing.requests.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=200, json=lambda: {"success": True})
        crowdsourcing.push_jobs(db_session, USER)  # first cycle: pushes it
        result = crowdsourcing.push_jobs(db_session, USER)  # second cycle: nothing new

    assert result["jobs_sent"] == 0
    assert mock_post.call_count == 1


def test_push_network_error_does_not_raise(db_session):
    _connect(db_session)
    _make_job(db_session, "https://acme.com/jobs/1")

    with patch("backend.crowdsourcing.requests.post", side_effect=ConnectionError("no route")):
        result = crowdsourcing.push_jobs(db_session, USER)

    assert result["success"] is False
    assert result["skipped"] is False


def test_push_is_isolated_per_user(db_session):
    _connect(db_session, user_id=USER, token="user-token")
    _make_job(db_session, "https://acme.com/jobs/1", user_id=USER)
    _make_job(db_session, "https://acme.com/jobs/other", user_id=OTHER_USER)

    with patch("backend.crowdsourcing.requests.post") as mock_post:
        mock_post.return_value = MagicMock(status_code=200, json=lambda: {"success": True})
        result = crowdsourcing.push_jobs(db_session, USER)

    assert result["jobs_sent"] == 1
    _, kwargs = mock_post.call_args
    assert kwargs["json"]["jobs"][0]["url"] == "https://acme.com/jobs/1"


# ── Pull ─────────────────────────────────────────────────────────────────────

def test_pull_inserts_new_jobs(db_session):
    _connect(db_session)
    with patch("backend.crowdsourcing.requests.get") as mock_get:
        mock_get.return_value = MagicMock(status_code=200, json=lambda: {
            "success": True,
            "jobs": [
                {"id": "1", "company": "Globex", "title": "Backend Engineer",
                 "location": "Remote", "url": "https://globex.com/jobs/1"},
            ],
        })
        result = crowdsourcing.pull_jobs(db_session, USER)

    assert result["jobs_added"] == 1
    from backend import models
    assert db_session.query(models.Job).filter_by(user_id=USER, url="https://globex.com/jobs/1").first() is not None


def test_pull_does_not_duplicate_existing_jobs(db_session):
    """A job already known locally (scraped, extension-saved, or previously pulled) must
    be counted correctly, not double-counted as newly added."""
    _connect(db_session)
    _make_job(db_session, "https://globex.com/jobs/1", company="Globex", title="Backend Engineer")

    with patch("backend.crowdsourcing.requests.get") as mock_get:
        mock_get.return_value = MagicMock(status_code=200, json=lambda: {
            "success": True,
            "jobs": [
                {"id": "1", "company": "Globex", "title": "Backend Engineer",
                 "location": "Remote", "url": "https://globex.com/jobs/1"},
            ],
        })
        result = crowdsourcing.pull_jobs(db_session, USER)

    assert result["jobs_received"] == 1
    assert result["jobs_added"] == 0
    from backend import models
    assert db_session.query(models.Job).filter_by(user_id=USER, url="https://globex.com/jobs/1").count() == 1


def test_pull_skips_malformed_entries(db_session):
    _connect(db_session)
    with patch("backend.crowdsourcing.requests.get") as mock_get:
        mock_get.return_value = MagicMock(status_code=200, json=lambda: {
            "success": True,
            "jobs": [{"id": "1", "url": "https://globex.com/jobs/1"}],  # missing company/title
        })
        result = crowdsourcing.pull_jobs(db_session, USER)

    assert result["jobs_added"] == 0
    from backend import models
    assert db_session.query(models.Job).count() == 0


def test_pull_403_quota_exhausted_does_not_raise(db_session):
    _connect(db_session)
    with patch("backend.crowdsourcing.requests.get") as mock_get:
        mock_get.return_value = MagicMock(status_code=403, text="Daily quota exceeded")
        result = crowdsourcing.pull_jobs(db_session, USER)

    assert result["success"] is False
    assert result["status_code"] == 403


def test_pull_lands_in_the_correct_users_pool_even_if_another_user_pulled_the_same_url(db_session):
    """Two users can independently pull the same shared-pool posting — must not collide on
    the (user_id, url) uniqueness or leak into each other's Job rows."""
    _connect(db_session, user_id=USER)
    _connect(db_session, user_id=OTHER_USER)
    payload = {
        "success": True,
        "jobs": [
            {"id": "1", "company": "Globex", "title": "Backend Engineer",
             "location": "Remote", "url": "https://globex.com/jobs/shared"},
        ],
    }
    with patch("backend.crowdsourcing.requests.get") as mock_get:
        mock_get.return_value = MagicMock(status_code=200, json=lambda: payload)
        result_a = crowdsourcing.pull_jobs(db_session, USER)
        result_b = crowdsourcing.pull_jobs(db_session, OTHER_USER)

    assert result_a["jobs_added"] == 1
    assert result_b["jobs_added"] == 1
    from backend import models
    assert db_session.query(models.Job).filter_by(url="https://globex.com/jobs/shared").count() == 2
