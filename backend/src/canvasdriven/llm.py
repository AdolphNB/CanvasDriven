from __future__ import annotations

import json
import os
import re

import httpx

from .models import ArchitectResponse, ChatMessage, LLMConfig


ARCHITECT_PROMPT = """You are a senior software architect.
Discuss requirements with the user in a pragmatic architecture-review style.
Return ONLY valid JSON with these keys:
- assistantMessage: a concise Chinese architecture discussion response with concrete tradeoffs and one useful follow-up question when needed.
- mermaidCode: a Mermaid flowchart or sequenceDiagram that reflects the latest architecture.
- architectureSummary: a compact summary of the current architecture decisions.

Rules:
- Mermaid must be valid and self-contained.
- Prefer flowchart LR unless a sequence is clearly better.
- Do not wrap JSON in markdown fences.
- Do not include any extra text outside JSON.
"""


async def generate_architecture_response(
    *,
    config: LLMConfig,
    messages: list[ChatMessage],
    current_mermaid: str,
    architecture_summary: str,
) -> ArchitectResponse:
    api_key = config.apiKey or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("missing OpenAI API key")

    if config.apiMode == "chat_completions":
        endpoint = chat_completions_endpoint(config)
        payload = build_chat_completions_payload(
            config=config,
            messages=messages,
            current_mermaid=current_mermaid,
            architecture_summary=architecture_summary,
        )
    else:
        endpoint = responses_endpoint(config)
        payload = build_responses_payload(
            config=config,
            messages=messages,
            current_mermaid=current_mermaid,
            architecture_summary=architecture_summary,
        )
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(endpoint, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()

    text = extract_chat_completions_text(data) if config.apiMode == "chat_completions" else data.get("output_text") or _extract_output_text(data)
    return parse_architect_response(text)


def parse_architect_response(text: str) -> ArchitectResponse:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE | re.DOTALL).strip()
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if not match:
            raise
        payload = json.loads(match.group(0))
    return ArchitectResponse.model_validate(payload)


def build_responses_payload(
    *,
    config: LLMConfig,
    messages: list[ChatMessage],
    current_mermaid: str,
    architecture_summary: str,
) -> dict[str, object]:
    conversation = "\n".join(f"{message.role}: {message.content}" for message in messages[-12:])
    input_text = (
        f"{ARCHITECT_PROMPT}\n\n"
        f"Current architecture summary:\n{architecture_summary}\n\n"
        f"Current Mermaid:\n{current_mermaid}\n\n"
        f"Conversation:\n{conversation}"
    )
    return {"model": config.model, "input": input_text}


def build_chat_completions_payload(
    *,
    config: LLMConfig,
    messages: list[ChatMessage],
    current_mermaid: str,
    architecture_summary: str,
) -> dict[str, object]:
    conversation_messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": (
                f"{ARCHITECT_PROMPT}\n\n"
                f"Current architecture summary:\n{architecture_summary}\n\n"
                f"Current Mermaid:\n{current_mermaid}"
            ),
        }
    ]
    conversation_messages.extend(
        {"role": message.role, "content": message.content}
        for message in messages[-12:]
    )
    return {
        "model": config.model,
        "messages": conversation_messages,
        "response_format": {"type": "json_object"},
    }


def responses_endpoint(config: LLMConfig) -> str:
    if config.provider == "openai_compatible" and config.baseUrl:
        return config.baseUrl.rstrip("/") + "/responses"
    return "https://api.openai.com/v1/responses"


def chat_completions_endpoint(config: LLMConfig) -> str:
    base_url = config.baseUrl or "https://api.openai.com/v1"
    return base_url.rstrip("/") + "/chat/completions"


def extract_chat_completions_text(data: dict[str, object]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message")
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    return content if isinstance(content, str) else ""


def _extract_output_text(data: dict[str, object]) -> str:
    output = data.get("output")
    if not isinstance(output, list):
        return ""
    parts: list[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for content_item in content:
            if isinstance(content_item, dict) and isinstance(content_item.get("text"), str):
                parts.append(content_item["text"])
    return "\n".join(parts)
