"""crud.py's Job-table functions had no test coverage before multi-user isolation. These
are the highest-stakes ones: get_job() previously had no ownership check at all, so any
authenticated user could read/update/delete any job by guessing its id."""
from backend import crud, schemas

USER = 1
OTHER_USER = 2


def _job(db, user_id=USER, url="https://acme.com/jobs/1", company="Acme", title="Engineer"):
    from backend import models
    job = models.Job(user_id=user_id, company=company, title=title, url=url)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def test_get_job_returns_none_for_another_users_job(db_session):
    job = _job(db_session, user_id=OTHER_USER)
    assert crud.get_job(db_session, USER, job.id) is None
    assert crud.get_job(db_session, OTHER_USER, job.id) is not None


def test_get_jobs_only_returns_the_requesting_users_jobs(db_session):
    _job(db_session, user_id=USER, url="https://acme.com/jobs/mine")
    _job(db_session, user_id=OTHER_USER, url="https://acme.com/jobs/theirs")

    mine = crud.get_jobs(db_session, USER)
    assert len(mine) == 1
    assert mine[0].url == "https://acme.com/jobs/mine"


def test_update_job_status_cannot_touch_another_users_job(db_session):
    job = _job(db_session, user_id=OTHER_USER)
    result = crud.update_job_status(db_session, USER, job.id, schemas.JobUpdate(status="APPLIED"))
    assert result is None

    db_session.refresh(job)
    assert job.status != "APPLIED"


def test_delete_job_cannot_delete_another_users_job(db_session):
    job = _job(db_session, user_id=OTHER_USER)
    assert crud.delete_job(db_session, USER, job.id) is False
    assert crud.get_job(db_session, OTHER_USER, job.id) is not None


def test_bulk_update_status_only_affects_own_jobs(db_session):
    mine = _job(db_session, user_id=USER, url="https://acme.com/jobs/mine")
    theirs = _job(db_session, user_id=OTHER_USER, url="https://acme.com/jobs/theirs")

    count = crud.bulk_update_status(db_session, USER, [mine.id, theirs.id], "TRASH")
    assert count == 1

    db_session.refresh(mine)
    db_session.refresh(theirs)
    assert mine.status == "TRASH"
    assert theirs.status != "TRASH"


def test_bulk_delete_jobs_only_affects_own_jobs(db_session):
    mine = _job(db_session, user_id=USER, url="https://acme.com/jobs/mine")
    theirs = _job(db_session, user_id=OTHER_USER, url="https://acme.com/jobs/theirs")
    mine_id, theirs_id = mine.id, theirs.id  # capture before delete — the bulk delete's
    # commit expires these ORM objects, and re-reading .id off a since-deleted row raises.

    count = crud.bulk_delete_jobs(db_session, USER, [mine_id, theirs_id])
    assert count == 1
    assert crud.get_job(db_session, USER, mine_id) is None
    assert crud.get_job(db_session, OTHER_USER, theirs_id) is not None


def test_delete_all_jobs_only_clears_own_jobs(db_session):
    _job(db_session, user_id=USER, url="https://acme.com/jobs/mine")
    _job(db_session, user_id=OTHER_USER, url="https://acme.com/jobs/theirs")

    count = crud.delete_all_jobs(db_session, USER)
    assert count == 1
    assert len(crud.get_jobs(db_session, OTHER_USER)) == 1


def test_empty_trash_only_empties_own_trash(db_session):
    mine = _job(db_session, user_id=USER, url="https://acme.com/jobs/mine")
    theirs = _job(db_session, user_id=OTHER_USER, url="https://acme.com/jobs/theirs")
    mine.status = "TRASH"
    theirs.status = "TRASH"
    db_session.commit()

    count = crud.empty_trash(db_session, USER)
    assert count == 1
    assert crud.get_job(db_session, OTHER_USER, theirs.id) is not None


def test_two_users_can_have_a_job_with_the_same_url(db_session):
    """Confirms the (user_id, url) composite uniqueness — the old global-unique url
    constraint would have raised an IntegrityError on the second insert."""
    a = _job(db_session, user_id=USER, url="https://acme.com/jobs/shared")
    b = _job(db_session, user_id=OTHER_USER, url="https://acme.com/jobs/shared")
    assert a.id != b.id
