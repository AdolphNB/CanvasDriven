from __future__ import annotations

from canvasdriven.config import load_llm_config


def test_load_llm_config_returns_defaults_when_file_is_missing(tmp_path) -> None:
    config = load_llm_config(tmp_path / "missing.json")

    assert config.provider == "openai"
    assert config.apiMode == "responses"
    assert config.model == "gpt-5.2"
    assert config.apiKey is None


def test_load_llm_config_reads_local_json_file(tmp_path) -> None:
    config_path = tmp_path / "llm.local.json"
    config_path.write_text(
        """
        {
          "provider": "openai_compatible",
          "apiMode": "chat_completions",
          "model": "deepseek-chat",
          "baseUrl": "https://api.deepseek.com",
          "apiKey": "test-key"
        }
        """,
        encoding="utf-8",
    )

    config = load_llm_config(config_path)

    assert config.provider == "openai_compatible"
    assert config.apiMode == "chat_completions"
    assert config.model == "deepseek-chat"
    assert config.baseUrl == "https://api.deepseek.com"
    assert config.apiKey == "test-key"
