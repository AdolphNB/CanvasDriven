from __future__ import annotations

import json
from pathlib import Path

from .models import LLMConfig


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_LLM_CONFIG_PATH = PROJECT_ROOT / "config" / "llm.local.json"


def load_llm_config(path: str | Path = DEFAULT_LLM_CONFIG_PATH) -> LLMConfig:
    config_path = Path(path)
    if not config_path.exists():
        return LLMConfig()

    data = json.loads(config_path.read_text(encoding="utf-8"))
    return LLMConfig.model_validate(data)
