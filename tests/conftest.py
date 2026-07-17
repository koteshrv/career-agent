import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import models


@pytest.fixture
def db_session():
    """A fresh in-memory SQLite session per test — never touches the real jobs.db."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()
