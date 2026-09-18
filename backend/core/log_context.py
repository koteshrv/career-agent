"""Tags outgoing WebSocket log broadcasts with the user_id of whichever per-user background
job is currently running, so the live log tail (LiveLogsModal.tsx) only shows a user's own
activity instead of leaking every user's scrape logs to every connected browser tab.

Deliberately NOT used for DB query scoping (see the multi-user rollout plan) — this is
purely advisory, display-only routing set at a handful of background-job entry points
(scheduler.py, main.py's bg_scrape_task, etc.), each of which sets it as its own first
action before calling anything else synchronously in the same thread. It is never relied
on to cross an HTTP middleware boundary, so the propagation risk that ruled out contextvars
for authorization-critical DB filtering doesn't apply here — worst case of a stale/unset
value is a log line displayed to the wrong tab or routed to nobody, never a data leak
across the actual database.
"""
import contextvars

_current_user_id: contextvars.ContextVar[int] = contextvars.ContextVar("ws_log_user_id", default=None)


def set_current_user(user_id) -> None:
    _current_user_id.set(user_id)


def get_current_user():
    return _current_user_id.get()
