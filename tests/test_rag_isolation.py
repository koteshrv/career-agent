"""rag_engine.py moved from one shared ChromaDB collection to one collection per user in
the multi-user rollout. Uses a tmp_path ChromaDB instance and mocks the embedding call
(get_embedding_with_model hits the real Gemini API) so these tests run offline and never
touch the real backend/vector_store/.
"""
from unittest.mock import patch

import pytest
import chromadb

from backend import rag_engine

USER = 1
OTHER_USER = 2


@pytest.fixture(autouse=True)
def isolated_vector_store(tmp_path, monkeypatch):
    monkeypatch.setattr(rag_engine, "chroma_client", chromadb.PersistentClient(path=str(tmp_path)))
    monkeypatch.setattr(rag_engine, "_collections", {})


def _fake_embedding(text, api_key):
    # A short, deterministic, valid-shaped embedding — real content doesn't matter for
    # these tests, only that ingest/query round-trip through Chroma correctly per user.
    return [float(len(text) % 7), 0.1, 0.2], "gemini-embedding-001"


def test_ingest_and_list_are_isolated_per_user():
    with patch("backend.rag_engine.get_embedding_with_model", side_effect=_fake_embedding):
        rag_engine.ingest_context(USER, "I built an internal API gateway.", "fake-key")
        rag_engine.ingest_context(OTHER_USER, "I led a data migration project.", "fake-key")

    mine = rag_engine.list_context(USER)
    theirs = rag_engine.list_context(OTHER_USER)
    assert len(mine) == 1 and "API gateway" in mine[0]["text"]
    assert len(theirs) == 1 and "data migration" in theirs[0]["text"]


def test_remove_context_cannot_delete_another_users_chunk():
    with patch("backend.rag_engine.get_embedding_with_model", side_effect=_fake_embedding):
        doc_id = rag_engine.ingest_context(OTHER_USER, "Their only chunk.", "fake-key")

    # Deleting by this doc_id from the wrong user's collection must not affect it —
    # Chroma just no-ops on an unknown id within that collection.
    rag_engine.remove_context(USER, doc_id)
    assert len(rag_engine.list_context(OTHER_USER)) == 1

    rag_engine.remove_context(OTHER_USER, doc_id)
    assert len(rag_engine.list_context(OTHER_USER)) == 0


def test_retrieve_relevant_experience_only_searches_own_collection():
    with patch("backend.rag_engine.get_embedding_with_model", side_effect=_fake_embedding):
        rag_engine.ingest_context(USER, "My unique career fact.", "fake-key")
        result = rag_engine.retrieve_relevant_experience(OTHER_USER, "some job description", api_key="fake-key")

    assert result == ""  # OTHER_USER's collection is empty — must not see USER's chunk


def test_retrieve_relevant_experience_returns_empty_for_empty_collection():
    with patch("backend.rag_engine.get_embedding_with_model", side_effect=_fake_embedding):
        result = rag_engine.retrieve_relevant_experience(USER, "some job description", api_key="fake-key")
    assert result == ""
