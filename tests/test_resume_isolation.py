"""Resumes moved from one flat shared directory to backend/uploads/resumes/<user_id>/ in
the multi-user rollout. Uses tmp_path so tests never touch the real uploads directory."""
import pytest

from backend import ai_agent

USER = 1
OTHER_USER = 2


@pytest.fixture(autouse=True)
def isolated_resumes_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(ai_agent, "RESUMES_DIR", tmp_path)


def _upload(user_id, filename, content=b"%PDF-1.4 fake resume content"):
    path = ai_agent._user_resumes_dir(user_id) / filename
    path.write_bytes(content)
    return path


def test_list_resumes_only_sees_own_directory():
    _upload(USER, "mine.pdf")
    _upload(OTHER_USER, "theirs.pdf")

    assert ai_agent.list_resumes(USER) == ["mine.pdf"]
    assert ai_agent.list_resumes(OTHER_USER) == ["theirs.pdf"]


def test_resume_path_cannot_resolve_another_users_file():
    _upload(OTHER_USER, "theirs.pdf")

    assert ai_agent._resume_path(USER, "theirs.pdf") is None
    assert ai_agent._resume_path(OTHER_USER, "theirs.pdf") is not None


def test_default_resume_falls_back_to_own_first_file_only():
    _upload(OTHER_USER, "a-comes-first-alphabetically.pdf")
    _upload(USER, "z-mine.pdf")

    path = ai_agent._resume_path(USER)
    assert path is not None
    assert path.name == "z-mine.pdf"


def test_delete_resume_cannot_delete_another_users_file():
    theirs = _upload(OTHER_USER, "theirs.pdf")

    assert ai_agent.delete_resume(USER, "theirs.pdf") is False
    assert theirs.exists()
    assert ai_agent.delete_resume(OTHER_USER, "theirs.pdf") is True
    assert not theirs.exists()


def test_extract_resume_text_reads_tex_as_plain_text():
    _upload(USER, "resume.tex", content=b"\\documentclass{article}\nHello World")
    text = ai_agent.extract_resume_text(USER, "resume.tex")
    assert "Hello World" in text


def test_extract_resume_text_returns_empty_for_missing_file():
    assert ai_agent.extract_resume_text(USER, "does-not-exist.pdf") == ""
