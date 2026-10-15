"""AI PDF Chatbot — Streamlit frontend.

Run with::

    python -m streamlit run app.py

Layout
------
* **Sidebar** — PDF upload, processing status, document list, Clear button.
* **Main area** — welcome screen, chat history, chat input, source citations.
"""

from __future__ import annotations

import html
import os
from typing import Dict, List

import streamlit as st
from dotenv import load_dotenv

# Load .env BEFORE any project module reads os.getenv (API key, model name).
load_dotenv()

from pdf_processor import (  # noqa: E402
    PDFProcessingError,
    process_pdf,
)
from rag_pipeline import (  # noqa: E402
    RAGError,
    Source,
    create_client,
    get_api_key,
    get_model_name,
    run_rag,
)
from vector_store import VectorStore  # noqa: E402

# ---------------------------------------------------------------------------
# Page config & styling
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="AI PDF Chatbot",
    page_icon="📄",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
    <style>
    .app-title {
        font-size: 2.1rem;
        font-weight: 800;
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        margin-bottom: 0;
    }
    .bubble {
        padding: 0.75rem 1rem;
        border-radius: 14px;
        line-height: 1.55;
        white-space: pre-wrap;
        word-wrap: break-word;
    }
    .bubble-user {
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: #fff;
        border-bottom-right-radius: 4px;
    }
    .bubble-assistant {
        background: #f1f3f9;
        border: 1px solid #e3e6ef;
        border-bottom-left-radius: 4px;
    }
    .bubble-error {
        background: #fdecea;
        color: #b3261e;
        border: 1px solid #f2b8b5;
        border-bottom-left-radius: 4px;
    }
    .source-chip {
        display: inline-block;
        background: #e8eaf6;
        color: #3f51b5;
        border: 1px solid #c5cae9;
        border-radius: 12px;
        padding: 2px 10px;
        font-size: 0.78rem;
        margin: 4px 6px 0 0;
    }
    .step-card {
        background: #ffffff;
        border: 1px solid #e6e9f0;
        border-radius: 12px;
        padding: 14px 16px;
        height: 100%;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------
_defaults: Dict = {
    "messages": [],          # [{"role", "content", "sources"?, "error"?}]
    "vector_store": None,    # VectorStore instance (per browser session)
    "docs_info": {},         # filename -> {"pages", "chunks", "characters"}
    "uploader_gen": 0,       # bumped by Clear → remounts an empty uploader
}
for _key, _value in _defaults.items():
    if _key not in st.session_state:
        st.session_state[_key] = _value


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def reset_all() -> None:
    """Clear chat, indexed documents, and the uploader (Clear button callback).

    Registered via ``on_click`` so it runs *before* the script body on the
    next rerun — that is the only place Streamlit allows widget-state changes.
    """
    st.session_state["messages"] = []
    st.session_state["docs_info"] = {}
    # Clear the index in place — reusing the instance avoids accumulating
    # orphaned collections inside chromadb's process-wide system.
    store = st.session_state.get("vector_store")
    if store is not None:
        store.reset()
    # st.file_uploader is READ-ONLY in session state (writes_allowed=False),
    # so its value can never be assigned. Instead, bump a plain (writable)
    # counter: the uploader gets a brand-new key on the next run, which
    # remounts it empty in the browser. The old key's state is cleaned up.
    gen = int(st.session_state.get("uploader_gen", 0))
    old_key = f"pdf_uploader_{gen}"
    st.session_state["uploader_gen"] = gen + 1
    if old_key in st.session_state:
        del st.session_state[old_key]


def _get_store() -> VectorStore:
    """Lazily create this session's vector store (model loads once, globally)."""
    if st.session_state["vector_store"] is None:
        st.session_state["vector_store"] = VectorStore()
    return st.session_state["vector_store"]


def render_sources(sources: List[Source]) -> None:
    """Render citation chips under an assistant message."""
    if not sources:
        return
    chips = "".join(
        '<span class="source-chip">📄 {} &middot; page {}</span>'.format(
            html.escape(s.filename), s.page
        )
        for s in sources
    )
    st.markdown(f'<div>{chips}</div>', unsafe_allow_html=True)


def render_bubble(text: str, role: str, is_error: bool = False) -> None:
    """Render one chat message as a styled bubble."""
    if is_error:
        css = "bubble-error"
    elif role == "user":
        css = "bubble-user"
    else:
        css = "bubble-assistant"
    st.markdown(
        f'<div class="bubble {css}">{html.escape(text)}</div>',
        unsafe_allow_html=True,
    )


def show_welcome() -> None:
    """Instructions shown while the chat is still empty."""
    st.markdown('<p class="app-title">📄 AI PDF Chatbot</p>', unsafe_allow_html=True)
    st.caption("Ask questions about your PDFs — answers cite the source file and page.")
    st.divider()
    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown(
            '<div class="step-card"><h4>1️⃣ Upload</h4>'
            "<p>Add one or more PDF files in the sidebar, then click "
            "<b>Process PDFs</b>.</p></div>",
            unsafe_allow_html=True,
        )
    with c2:
        st.markdown(
            '<div class="step-card"><h4>2️⃣ Ask</h4>'
            "<p>Type a question about the content in the box at the bottom "
            "of the page.</p></div>",
            unsafe_allow_html=True,
        )
    with c3:
        st.markdown(
            '<div class="step-card"><h4>3️⃣ Verify</h4>'
            "<p>Every answer shows the <b>source filename and page "
            "numbers</b> it came from.</p></div>",
            unsafe_allow_html=True,
        )
    st.info(
        "💡 **Tips**\n\n"
        "• Answers are generated **only** from your uploaded documents.\n"
        "• If the answer is not in the documents, the bot says so explicitly.\n"
        "• Use **Clear chat & documents** in the sidebar to start over."
    )


# ---------------------------------------------------------------------------
# Sidebar — upload, processing, status, reset
# ---------------------------------------------------------------------------
with st.sidebar:
    st.markdown("### 📂 Document center")

    # The key changes whenever "Clear" is pressed (see reset_all): giving the
    # widget a fresh key is the only supported way to empty a file_uploader.
    uploader_key = f"pdf_uploader_{st.session_state.get('uploader_gen', 0)}"
    uploaded_files = st.file_uploader(
        "Upload PDF files",
        type=["pdf"],
        accept_multiple_files=True,
        key=uploader_key,
        help="Only .pdf files are accepted. Scanned/image-only PDFs without "
        "selectable text will be rejected.",
    )

    known = st.session_state["docs_info"]
    new_files = [f for f in (uploaded_files or []) if f.name not in known]

    if new_files:
        if st.button("⚡ Process PDFs", type="primary", use_container_width=True):
            store = _get_store()
            progress = st.progress(0.0, text="Starting…")
            failures: Dict[str, str] = {}
            indexed: List[str] = []
            for i, up in enumerate(new_files, start=1):
                progress.progress(
                    i / len(new_files),
                    text=f"Processing {up.name} ({i}/{len(new_files)})…",
                )
                try:
                    pdf, chunks = process_pdf(up.name, up.getvalue())
                    store.add_chunks(chunks)
                    known[up.name] = {
                        "pages": pdf.page_count,
                        "chunks": len(chunks),
                        "characters": pdf.total_characters,
                    }
                    indexed.append(up.name)
                except PDFProcessingError as exc:
                    failures[up.name] = str(exc)
                except Exception as exc:  # noqa: BLE001 — keep the app alive
                    failures[up.name] = f"Unexpected error: {exc}"
            progress.empty()

            for name in indexed:
                st.success(f"✅ {name} indexed")
            for name, msg in failures.items():
                st.error(f"❌ **{name}** — {msg}")

    # --- processed documents status ---
    if known:
        st.markdown("#### 📑 Indexed documents")
        total_chunks = 0
        for name, info in known.items():
            total_chunks += info["chunks"]
            st.markdown(
                f"• **{html.escape(name)}** — {info['pages']} pages, "
                f"{info['chunks']} chunks"
            )
        st.caption(
            f"{len(known)} file(s) · {total_chunks} chunks · "
            f"model: `{get_model_name()}`"
        )
    else:
        st.caption("No documents indexed yet — upload a PDF above. ☝️")

    # --- API key status ---
    if get_api_key():
        st.success("🔑 xAI (Grok) API key detected")
    else:
        st.warning(
            "🔑 **API key missing** — copy `.env.example` to `.env` and set "
            "`XAI_API_KEY`."
        )

    st.divider()
    st.button(
        "🧹 Clear chat & documents",
        on_click=reset_all,
        use_container_width=True,
        help="Deletes the conversation and removes all indexed PDFs.",
    )


# ---------------------------------------------------------------------------
# Main area — welcome screen & chat history
# ---------------------------------------------------------------------------
api_key = get_api_key()
store = st.session_state["vector_store"]
has_docs = bool(st.session_state["docs_info"]) and store is not None and store.count > 0

if not st.session_state["messages"]:
    show_welcome()

for msg in st.session_state["messages"]:
    with st.chat_message(msg["role"], avatar="🧑" if msg["role"] == "user" else "🤖"):
        render_bubble(
            msg["content"],
            msg["role"],
            is_error=msg.get("error", False),
        )
        if msg.get("sources"):
            render_sources(
                [Source(**s) if isinstance(s, dict) else s for s in msg["sources"]]
            )

# ---------------------------------------------------------------------------
# Chat input
# ---------------------------------------------------------------------------
disabled = not (has_docs and api_key)
if not has_docs:
    st.caption("☝️ Upload and process at least one PDF to start asking questions.")
elif not api_key:
    st.caption("🔑 Set `XAI_API_KEY` in `.env` to start asking questions.")

question = st.chat_input(
    "Ask a question about your PDFs…",
    disabled=disabled,
)

if question:
    # 1) Show & store the user message immediately.
    st.session_state["messages"].append({"role": "user", "content": question})
    with st.chat_message("user", avatar="🧑"):
        render_bubble(question, "user")

    # 2) Generate the answer inside the assistant bubble.
    with st.chat_message("assistant", avatar="🤖"):
        try:
            with st.spinner("Searching your documents…"):
                result = run_rag(
                    question=question,
                    vector_store=store,
                    # History excludes the message we just appended.
                    chat_history=st.session_state["messages"][:-1],
                    client=create_client(api_key),
                )
            render_bubble(result.answer, "assistant")
            if result.found and result.sources:
                render_sources(result.sources)
            st.session_state["messages"].append(
                {
                    "role": "assistant",
                    "content": result.answer,
                    "sources": [
                        {"filename": s.filename, "page": s.page, "score": s.score}
                        for s in result.sources
                    ],
                }
            )
        except RAGError as exc:
            # Missing key / rate limit / network — friendly message, no crash.
            render_bubble(str(exc), "assistant", is_error=True)
            st.session_state["messages"].append(
                {"role": "assistant", "content": str(exc), "error": True}
            )

