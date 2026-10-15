"""RAG orchestration: retrieve relevant chunks, generate a grounded answer.

Flow
----
1. ``similarity_search`` pulls the top-k chunks for the user's question.
2. Chunks are formatted into a CONTEXT block tagged with ``[file | page]``.
3. A strict system prompt forces the model to answer **only** from that
   context, or to refuse with the exact sentence defined in
   ``NOT_FOUND_MESSAGE``.
4. The answer plus de-duplicated ``(filename, page)`` sources come back as a
   :class:`RAGResult`.

Answers are generated with the **xAI Grok API** (official endpoint
``https://api.x.ai/v1``) via the OpenAI-compatible SDK using the Responses
API. xAI failures (bad key, rate limit, network) are mapped to friendly
:class:`RAGError` messages so the UI never shows a raw traceback.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import openai
from openai import OpenAI

from vector_store import VectorStore

# --- Exact refusal sentence (requirement) -----------------------------------
NOT_FOUND_MESSAGE = (
    "The uploaded documents do not contain enough information to "
    "answer this question."
)

# --- Defaults (overridable via .env) ----------------------------------------
# Official xAI API endpoint and current flagship chat model.
# See https://docs.x.ai/docs/models and https://docs.x.ai/docs/overview
XAI_BASE_URL = "https://api.x.ai/v1"
DEFAULT_MODEL = "grok-4.1-fast-reasoning"
DEFAULT_TOP_K = 4
HISTORY_LIMIT = 6  # how many past messages are sent for follow-up context
MAX_TOKENS = 700


class RAGError(Exception):
    """User-facing failure during retrieval or answer generation."""


@dataclass
class Source:
    """One citation shown under an assistant message."""

    filename: str
    page: int
    score: float


@dataclass
class RAGResult:
    """Everything the UI needs to render one assistant turn."""

    answer: str
    sources: List[Source] = field(default_factory=list)
    found: bool = True  # False => refusal sentence was returned


# ---------------------------------------------------------------------------
# Configuration helpers
# ---------------------------------------------------------------------------
def get_api_key() -> Optional[str]:
    """Read the xAI API key from the environment (loaded by python-dotenv).

    Returns ``None`` when missing or still the placeholder from .env.example.
    Get a key at https://console.x.ai (exported as ``XAI_API_KEY``).
    """
    key = (os.getenv("XAI_API_KEY") or "").strip()
    if not key or key.startswith("xai-your-key"):
        return None
    # Provider guard: reject non-xAI keys early (e.g. Groq "gsk_*" keys) with
    # a clear message instead of a raw 400 from the xAI endpoint. Inference
    # keys from https://console.x.ai always start with "xai-".
    if not key.startswith("xai-"):
        raise RAGError(
            "The configured API key does not look like an xAI key "
            "(xAI keys start with 'xai-'). Generate one at "
            "https://console.x.ai and set it as XAI_API_KEY in .env."
        )
    return key


def get_model_name() -> str:
    """Grok model to use -- ``XAI_MODEL`` from .env, else a safe default."""
    return (os.getenv("XAI_MODEL") or "").strip() or DEFAULT_MODEL


def get_top_k() -> int:
    """How many chunks to retrieve -- ``RETRIEVAL_TOP_K`` from .env."""
    raw = (os.getenv("RETRIEVAL_TOP_K") or "").strip()
    try:
        return max(1, int(raw)) if raw else DEFAULT_TOP_K
    except ValueError:
        return DEFAULT_TOP_K


def create_client(api_key: Optional[str] = None) -> OpenAI:
    """Build an xAI-backed client; raises :class:`RAGError` if key is bad.

    Uses the OpenAI-compatible SDK pointed at the official xAI endpoint, so
    no extra dependency is needed (``openai`` is in requirements.txt).
    """
    key = api_key if api_key is not None else get_api_key()
    if not key:
        raise RAGError(
            "xAI API key not found. Copy `.env.example` to `.env`, "
            "set `XAI_API_KEY`, and restart the app."
        )
    try:
        return OpenAI(
            api_key=key,
            base_url=XAI_BASE_URL,
            timeout=60.0,
            max_retries=1,  # 403s are never retried (see _map_xai_error)
        )
    except Exception as exc:  # noqa: BLE001 - friendly message below
        raise RAGError(f"Could not initialise the xAI client: {exc}")


SYSTEM_PROMPT = (
    "You are a helpful assistant that answers questions about uploaded PDF documents.\n"
    "STRICT RULES:\n"
    "1. Answer ONLY using the CONTEXT provided by the user. Do not use prior knowledge, even if you are sure.\n"
    "2. If the CONTEXT does not contain the answer, reply with exactly:\n"
    f"{NOT_FOUND_MESSAGE}\n"
    "3. Be concise: 2-5 sentences unless the user asks for detail.\n"
    "4. When helpful, mention which file/page supports the statement."
)
def _format_context(chunks: List[Dict]) -> str:
    """Render retrieved chunks into one labelled CONTEXT block."""
    parts = []
    for i, chunk in enumerate(chunks, start=1):
        parts.append(
            f"[Chunk {i} | File: {chunk['source']} | Page: {chunk['page']}]\n"
            f"{chunk['text']}"
        )
    return "\n\n---\n\n".join(parts)


def _format_history(chat_history: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """Keep only recent user/assistant turns for follow-up questions."""
    recent = [
        msg
        for msg in chat_history
        if msg.get("role") in ("user", "assistant") and msg.get("content")
    ][-HISTORY_LIMIT:]
    return [{"role": msg["role"], "content": msg["content"]} for msg in recent]


def _short(exc: Exception, limit: int = 300) -> str:
    """Trim an SDK error to a safe, UI-sized message (never a key: the SDK
    never embeds the Authorization header in exception text)."""
    return str(exc).strip()[:limit]


def _extract_403_detail(exc: openai.APIStatusError) -> tuple:
    """Pull safe diagnostics from a 403 response: (message, code, request_id).

    All three come from the response body/headers only -- they can never
    contain the API key. Returns empty strings when a field is absent.
    """
    message, code, request_id = "", "", ""
    body = exc.body if isinstance(exc.body, dict) else {}
    error = body.get("error") if isinstance(body, dict) else None
    if isinstance(error, dict):
        message = str(error.get("message") or "")
        code = str(error.get("code") or error.get("type") or "")
    try:
        request_id = exc.request_id or ""
    except Exception:  # noqa: BLE001 - headers may be missing entirely
        request_id = ""
    if not request_id and exc.response is not None:
        try:
            headers = exc.response.headers or {}
            request_id = (
                headers.get("x-request-id")
                or headers.get("x-grok-request-id")
                or headers.get("request-id")
                or ""
            )
        except Exception:  # noqa: BLE001 - defensive only
            request_id = ""
    return message, code, str(request_id)


def _classify_403(code: str, detail: str) -> str:
    """Map a 403 code/message to the most likely permission cause."""
    text = f"{code} {detail}".lower()
    if any(k in text for k in ("team_block", "team_disabled", "suspend", "deactivat")):
        return "Likely cause: the key's team is disabled or suspended."
    if any(k in text for k in ("model", "deployment", "access", "entitle", "scope", "permission")):
        return "Likely cause: this key/model or endpoint is not enabled for your team."
    if any(k in text for k in ("rate", "quota", "credit", "billing")):
        return "Likely cause: billing/quota restriction (check credits in Console)."
    return "Likely cause: key/team permission denied for this model or endpoint."
def _map_xai_error(exc: Exception) -> RAGError:
    """Turn low-level API/SDK exceptions into actionable messages."""
    if isinstance(exc, RAGError):
        return exc
    if isinstance(exc, openai.AuthenticationError):
        return RAGError(
            "xAI rejected the API key (401). Check `XAI_API_KEY` in `.env` - "
            f"get a key at https://console.x.ai. {_short(exc)}"
        )
    if isinstance(exc, openai.PermissionDeniedError):
        # 403 = key accepted but forbidden. Placed BEFORE the generic
        # APIStatusError branch (its parent class) so it actually fires.
        # Never retried: the SDK only auto-retries 429/5xx.
        detail, code, request_id = _extract_403_detail(exc)
        hint = _classify_403(code, detail)
        parts = [
            "xAI denied this request (HTTP 403 - permission denied; "
            "the key itself was accepted but is not allowed to do this).",
            hint,
        ]
        if detail:
            parts.append(f"Server message: {detail}")
        if code:
            parts.append(f"Code: {code}")
        if request_id:
            parts.append(f"Request ID: {request_id} (quote this to xAI support)")
        parts.append("Do not retry automatically - fix the permission first.")
        return RAGError(" ".join(parts))
    if isinstance(exc, openai.RateLimitError):
        return RAGError(
            "xAI rate limit reached (429). Wait a moment and try again, "
            "or check your credit balance at https://console.x.ai."
        )
    if isinstance(exc, (openai.APIConnectionError, openai.APITimeoutError)):
        return RAGError(
            "Could not reach the xAI API. Check your internet connection and retry."
        )
    if isinstance(exc, openai.BadRequestError):
        return RAGError(f"xAI rejected the request: {_short(exc)}")
    if isinstance(exc, openai.APIStatusError):
        return RAGError(
            f"xAI API error (HTTP {exc.status_code}). Please retry later."
        )
    if isinstance(exc, openai.OpenAIError):
        return RAGError(f"xAI client error: {_short(exc)}")
    return RAGError(f"Unexpected error while generating the answer: {_short(exc)}")


# Backwards-compatible alias (older code/tests may import the old name).
_map_openai_error = _map_xai_error


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
def run_rag(
    question: str,
    vector_store: VectorStore,
    chat_history: Optional[List[Dict[str, str]]] = None,
    client: Optional[OpenAI] = None,
) -> RAGResult:
    """Retrieve context for ``question`` and generate a grounded answer.

    Raises:
        RAGError: missing API key, or any xAI API failure.
    """
    # 1) Retrieve -----------------------------------------------------------
    chunks = vector_store.similarity_search(question, k=get_top_k())

    # Nothing retrievable -> short-circuit without calling the API.
    if not chunks:
        return RAGResult(answer=NOT_FOUND_MESSAGE, sources=[], found=False)

    # 2) Build Responses-API input -------------------------------------------
    # ``instructions`` carries the system prompt; ``input`` is the multi-turn
    # conversation (recent history + the context-grounded question). Setting
    # ``store=False`` keeps PDF content on this machine instead of xAI servers.
    # https://docs.x.ai/docs/guides/chat
    user_prompt = (
        f"CONTEXT:\n{_format_context(chunks)}\n\n"
        f"QUESTION: {question}\n\n"
        "Answer using only the CONTEXT above."
    )
    history_msgs = _format_history(chat_history or [])
    api_input: List[Dict[str, str]] = list(history_msgs) + [
        {"role": "user", "content": user_prompt}
    ]

    # 3) Generate -----------------------------------------------------------
    if client is None:
        client = create_client()
    try:
        response = client.responses.create(
            model=get_model_name(),
            instructions=SYSTEM_PROMPT,
            input=api_input,
            temperature=0.0,  # deterministic, grounded answers
            max_output_tokens=MAX_TOKENS,
            store=False,
        )
    except Exception as exc:  # noqa: BLE001 - mapped to a friendly message
        raise _map_xai_error(exc)

    answer = (response.output_text or "").strip()
    if not answer:
        answer = NOT_FOUND_MESSAGE

    # 4) Collect de-duplicated sources --------------------------------------
    found = answer != NOT_FOUND_MESSAGE
    sources: List[Source] = []
    seen = set()
    if found:
        for chunk in chunks:
            key = (chunk["source"], chunk["page"])
            if key not in seen:
                seen.add(key)
                sources.append(
                    Source(
                        filename=chunk["source"],
                        page=chunk["page"],
                        score=chunk["score"],
                    )
                )

    return RAGResult(answer=answer, sources=sources, found=found)
