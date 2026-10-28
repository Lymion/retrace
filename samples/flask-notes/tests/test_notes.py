import pytest

from app import create_app


class TestConfig:
    TESTING = True
    SECRET_KEY = "test"
    DATABASE = ":memory:"


@pytest.fixture
def client(tmp_path):
    TestConfig.DATABASE = str(tmp_path / "test.db")
    app = create_app(TestConfig)
    return app.test_client()


def test_empty_list(client):
    response = client.get("/")
    assert b"No notes yet." in response.data


def test_create_note(client):
    client.post("/notes", data={"body": "Buy milk"})
    response = client.get("/")
    assert b"Buy milk" in response.data
