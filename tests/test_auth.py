import hmac
import hashlib
import json
import time
from types import SimpleNamespace

from backend import auth


def _user(id=1, username="admin", email=None, role="ADMIN"):
    return SimpleNamespace(id=id, username=username, email=email, role=role)


def test_create_and_decode_token_round_trip():
    token = auth.create_token(_user())
    payload = auth.decode_token(token)
    assert payload["uid"] == 1
    assert payload["u"] == "admin"
    assert payload["role"] == "ADMIN"


def test_decode_token_falls_back_to_email_when_no_username():
    token = auth.create_token(_user(username=None, email="a@b.com", role="USER"))
    payload = auth.decode_token(token)
    assert payload["u"] == "a@b.com"


def test_decode_token_rejects_tampered_signature():
    token = auth.create_token(_user())
    body, _sig = token.split(".")
    tampered = f"{body}.not-a-real-signature"
    assert auth.decode_token(tampered) is None


def test_decode_token_rejects_expired_token(monkeypatch):
    monkeypatch.setattr(auth, "TOKEN_TTL", -1)  # already expired the instant it's minted
    token = auth.create_token(_user())
    assert auth.decode_token(token) is None


def test_decode_token_rejects_malformed_input():
    assert auth.decode_token("not-a-token") is None
    assert auth.decode_token("") is None


def test_decode_token_rejects_pre_migration_token_without_crashing():
    """Regression test: create_token() used to sign {"u": username, "exp": ...} with no
    "uid" at all. That token is still HMAC-valid against the same secret and can sit in a
    browser's localStorage for up to TOKEN_TTL, so decode_token() must reject it cleanly
    (as if invalid) rather than returning a payload that then crashes every caller
    (AuthMiddleware, get_current_user, websocket_logs) with an unhandled KeyError on
    payload["uid"] — this is exactly what happened in practice."""
    legacy_payload = {"u": "admin", "exp": int(time.time()) + 3600}
    body = auth._b64e(json.dumps(legacy_payload).encode())
    sig = auth._b64e(hmac.new(auth._secret(), body.encode(), hashlib.sha256).digest())
    legacy_token = f"{body}.{sig}"

    assert auth.decode_token(legacy_token) is None
