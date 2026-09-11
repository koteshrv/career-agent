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
