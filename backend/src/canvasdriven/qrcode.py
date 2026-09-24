from __future__ import annotations

import logging
import os
import random
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse, Response

router = APIRouter()
logger = logging.getLogger(__name__)
DEFAULT_IMAGE_DIR = Path(__file__).resolve().parents[3] / "data" / "qrcode-images"
IMAGE_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}
NO_CACHE = {"Cache-Control": "no-store"}


@router.get("/qrcode", response_class=Response)
def random_photo() -> Response:
    directory = Path(os.environ.get("QRCODE_IMAGE_DIR") or DEFAULT_IMAGE_DIR)
    for _ in range(2):
        try:
            candidates = [
                path for path in directory.iterdir()
                if path.suffix.lower() in IMAGE_TYPES
                and not path.is_symlink()
                and path.is_file()
            ]
            if not candidates:
                break
            selected = random.choice(candidates)
            # Read before sending headers so a deleted file can be retried.
            if selected.is_symlink():
                continue
            content = selected.read_bytes()
            return Response(content, media_type=IMAGE_TYPES[selected.suffix.lower()], headers=NO_CACHE)
        except (FileNotFoundError, NotADirectoryError):
            continue
        except OSError:
            logger.exception("Unable to read QR code photo directory")
            return PlainTextResponse("照片暂时无法加载，请稍后再试", status_code=503, headers=NO_CACHE)
    return PlainTextResponse("暂无可展示的照片", status_code=404, headers=NO_CACHE)
