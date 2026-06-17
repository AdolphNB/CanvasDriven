from __future__ import annotations

from canvasdriven.llm import (
    build_chat_completions_payload,
    chat_completions_endpoint,
    chunk_text_for_stream,
    parse_architect_response,
)
from canvasdriven.models import ChatMessage, LLMConfig


def test_parse_architect_response_accepts_json_payload() -> None:
    result = parse_architect_response(
        """
        {
          "assistantMessage": "建议先拆 API 层和任务层。",
          "mermaidCode": "flowchart LR\\n  A[API] --> B[Worker]",
          "architectureSummary": "API forwards work to workers."
        }
        """
    )

    assert result.assistantMessage.startswith("建议")
    assert "flowchart LR" in result.mermaidCode
    assert result.architectureSummary == "API forwards work to workers."


def test_chat_completions_endpoint_targets_deepseek_shape() -> None:
    config = LLMConfig(
        provider="openai_compatible",
        apiMode="chat_completions",
        model="deepseek-v4-flash",
        baseUrl="https://api.deepseek.com",
    )

    assert chat_completions_endpoint(config) == "https://api.deepseek.com/chat/completions"


def test_build_chat_completions_payload_uses_messages_contract() -> None:
    config = LLMConfig(provider="openai_compatible", apiMode="chat_completions", model="deepseek-v4-flash")
    payload = build_chat_completions_payload(
        config=config,
        messages=[ChatMessage(role="user", content="设计一个多租户课程平台")],
        current_mermaid="flowchart LR\n  A --> B",
        architecture_summary="Initial",
    )

    assert payload["model"] == "deepseek-v4-flash"
    assert payload["response_format"] == {"type": "json_object"}
    assert payload["messages"][0]["role"] == "system"
    assert payload["messages"][-1]["role"] == "user"
    assert "多租户课程平台" in payload["messages"][-1]["content"]


def test_chunk_text_for_stream_preserves_complete_text() -> None:
    text = "第一段架构建议，需要先拆清边界。第二段说明数据流。"

    chunks = chunk_text_for_stream(text, chunk_size=8)

    assert "".join(chunks) == text
    assert len(chunks) > 1
