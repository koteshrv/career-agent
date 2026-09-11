"""A fresh install has no way to self-approve via SSO otherwise: the only admin would be
the local config.json account, which the person setting up the instance may never use if
they go straight for "Sign in with Google". The very first SSO signup becomes an admin,
active immediately; every SSO signup after that goes through the normal pending queue."""
from unittest.mock import patch

from backend import models
from backend.routers.users import sso_login, SsoLoginRequest, _is_first_sso_signup


def test_is_first_sso_signup_true_when_no_sso_users_exist(db_session):
    assert _is_first_sso_signup(db_session) is True


def test_is_first_sso_signup_false_once_one_exists(db_session):
    db_session.add(models.User(email="a@example.com", auth_method="sso", role="ADMIN", status="ACTIVE"))
    db_session.commit()
    assert _is_first_sso_signup(db_session) is False


def test_is_first_sso_signup_ignores_the_local_admin_account(db_session):
    # The bootstrap local admin (auth_method="local") doesn't count as an SSO signup.
    db_session.add(models.User(username="admin", auth_method="local", role="ADMIN", status="ACTIVE"))
    db_session.commit()
    assert _is_first_sso_signup(db_session) is True


def test_first_ever_sso_signup_becomes_active_admin(db_session):
    req = SsoLoginRequest(cloud_token="fake", provider="google")
    with patch("backend.routers.users.crowdsourcing.verify_cloud_identity", return_value="owner@example.com"):
        result = sso_login(req, db_session)

    assert result["status"] == "active"
    assert "token" in result

    user = db_session.query(models.User).filter_by(email="owner@example.com").first()
    assert user.role == "ADMIN"
    assert user.status == "ACTIVE"
    assert user.approved_at is not None


def test_second_sso_signup_is_pending_not_admin(db_session):
    db_session.add(models.User(email="owner@example.com", auth_method="sso", role="ADMIN", status="ACTIVE"))
    db_session.commit()

    req = SsoLoginRequest(cloud_token="fake", provider="google")
    with patch("backend.routers.users.crowdsourcing.verify_cloud_identity", return_value="second@example.com"):
        result = sso_login(req, db_session)

    assert result == {"status": "pending", "email": "second@example.com"}
    user = db_session.query(models.User).filter_by(email="second@example.com").first()
    assert user.role == "USER"
    assert user.status == "PENDING"


def test_repeat_signin_by_the_bootstrap_admin_does_not_recreate_or_demote_them(db_session):
    req = SsoLoginRequest(cloud_token="fake", provider="google")
    with patch("backend.routers.users.crowdsourcing.verify_cloud_identity", return_value="owner@example.com"):
        sso_login(req, db_session)
        result = sso_login(req, db_session)

    assert result["status"] == "active"
    assert db_session.query(models.User).filter_by(email="owner@example.com").count() == 1
