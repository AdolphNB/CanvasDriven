from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from canvasdriven.main import app
from canvasdriven import qrcode


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("QRCODE_IMAGE_DIR", str(tmp_path))
    return TestClient(app)


@pytest.mark.parametrize("suffix,media_type", qrcode.IMAGE_TYPES.items())
def test_returns_image(client, tmp_path, suffix, media_type):
    (tmp_path / f"照片{suffix.upper()}").write_bytes(b"image-content")
    response = client.get("/qrcode")
    assert response.status_code == 200
    assert response.content == b"image-content"
    assert response.headers["content-type"] == media_type
    assert response.headers["cache-control"] == "no-store"


def test_rescans_and_randomly_selects_only_top_level_images(client, tmp_path, monkeypatch):
    first = tmp_path / "first.jpg"
    second = tmp_path / "second.png"
    first.write_bytes(b"first")
    second.write_bytes(b"second")
    (tmp_path / "notes.txt").write_text("ignore")
    nested = tmp_path / "nested.jpg"
    nested.mkdir()
    (nested / "hidden.jpg").write_bytes(b"ignore")
    calls = []

    def choose(candidates):
        calls.append(set(candidates))
        return second if second in candidates else first

    monkeypatch.setattr(qrcode.random, "choice", choose)
    assert client.get("/qrcode").content == b"second"
    second.unlink()
    assert client.get("/qrcode").content == b"first"
    second.write_bytes(b"new")
    assert client.get("/qrcode").content == b"new"
    assert calls == [{first, second}, {first}, {first, second}]


@pytest.mark.parametrize("state", ["empty", "missing", "not_directory", "non_image"])
def test_unavailable_directory(client, tmp_path, monkeypatch, state):
    if state == "missing":
        monkeypatch.setenv("QRCODE_IMAGE_DIR", str(tmp_path / "missing"))
    elif state == "not_directory":
        file = tmp_path / "file"
        file.write_text("not a directory")
        monkeypatch.setenv("QRCODE_IMAGE_DIR", str(file))
    elif state == "non_image":
        (tmp_path / "notes.txt").write_text("ignore")
    response = client.get("/qrcode")
    assert response.status_code == 404
    assert response.text == "暂无可展示的照片"
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("has_remaining_photo", [True, False])
def test_deleted_selection_is_retried(client, tmp_path, monkeypatch, has_remaining_photo):
    removed = tmp_path / "removed.jpg"
    removed.write_bytes(b"removed")
    remaining = tmp_path / "remaining.png"
    if has_remaining_photo:
        remaining.write_bytes(b"remaining")

    def choose(candidates):
        if removed in candidates:
            removed.unlink()
            return removed
        return remaining

    monkeypatch.setattr(qrcode.random, "choice", choose)
    response = client.get("/qrcode")
    assert response.status_code == (200 if has_remaining_photo else 404)
    assert response.content == (b"remaining" if has_remaining_photo else "暂无可展示的照片".encode())


def test_symlink_is_excluded(client, tmp_path):
    target = tmp_path / "target.txt"
    target.write_bytes(b"private")
    try:
        (tmp_path / "link.jpg").symlink_to(target)
    except OSError:
        pytest.skip("Creating symlinks requires permission on this platform")
    assert client.get("/qrcode").status_code == 404


def test_read_failure_is_friendly(client, tmp_path, monkeypatch):
    (tmp_path / "photo.jpg").write_bytes(b"image")

    def denied(self):
        raise PermissionError("denied")

    monkeypatch.setattr(Path, "read_bytes", denied)
    response = client.get("/qrcode")
    assert response.status_code == 503
    assert response.text == "照片暂时无法加载，请稍后再试"
    assert response.headers["cache-control"] == "no-store"


def test_default_directory(client, tmp_path, monkeypatch):
    monkeypatch.delenv("QRCODE_IMAGE_DIR")
    monkeypatch.setattr(qrcode, "DEFAULT_IMAGE_DIR", tmp_path)
    (tmp_path / "photo.jpg").write_bytes(b"default")
    assert client.get("/qrcode").content == b"default"


def test_health_still_available(client):
    assert client.get("/health").json() == {"status": "ok"}
