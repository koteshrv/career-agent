"""TaskManager tasks are now tagged with user_id so a live WS log tail (see
backend/main.py's ConnectionManager) can show one user their own scrape/generation
progress without leaking another user's activity."""
from backend.tasks import TaskManager

USER = 1
OTHER_USER = 2


def test_get_all_tasks_unfiltered_returns_everyone():
    tm = TaskManager()
    tm.start_task("Scraper Run", user_id=USER)
    tm.start_task("Crowdsource Push", user_id=OTHER_USER)
    assert len(tm.get_all_tasks()) == 2


def test_get_all_tasks_filters_active_tasks_by_user():
    tm = TaskManager()
    mine = tm.start_task("Scraper Run", user_id=USER)
    tm.start_task("Crowdsource Push", user_id=OTHER_USER)

    mine_tasks = tm.get_all_tasks(USER)
    assert [t["id"] for t in mine_tasks] == [mine]


def test_get_all_tasks_filters_completed_tasks_by_user():
    tm = TaskManager()
    mine = tm.start_task("Scraper Run", user_id=USER)
    theirs = tm.start_task("Crowdsource Push", user_id=OTHER_USER)
    tm.complete_task(mine, success=True)
    tm.complete_task(theirs, success=True)

    mine_tasks = tm.get_all_tasks(USER)
    assert [t["id"] for t in mine_tasks] == [mine]


def test_task_with_no_user_id_is_invisible_to_a_specific_user():
    tm = TaskManager()
    tm.start_task("System Task")  # user_id defaults to None
    assert tm.get_all_tasks(USER) == []
    assert len(tm.get_all_tasks()) == 1
