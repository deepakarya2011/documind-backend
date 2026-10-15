"""PDF text extraction (PyMuPDF) and chunking (LangChain text splitter).

Pipeline
--------
1. Validate the upload (``.pdf`` extension + ``%PDF`` magic bytes).
2. Open with PyMuPDF, reject password-protected files.
3. Extract text **page by page** so every chunk keeps an exact page number.
4. Split each page's text into overlapping chunks (1000 chars / 150 overlap).
5. Reject "empty" documents — typically scanned/image-only PDFs (no OCR here).

Page-attribution strategy: chunks are produced *per page*, therefore a chunk
never spans two pages and the citation shown in the chat is always exact.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Tuple

import pymupdf  # modern import name for PyMuPDF (>= 1.24)
from langchain_text_splitters import RecursiveCharacterTextSplitter

# --- Tunable chunking settings ---------------------------------------------
CHUNK_SIZE = 1000        # characters per chunk
CHUNK_OVERLAP = 150      # characters of context carried between chunks
MIN_CHUNK_LENGTH = 20    # drop tiny fragments (headers, stray words)
MIN_DOCUMENT_LENGTH = 40 # total characters below this ⇒ "empty" PDF


# ---------------------------------------------------------------------------
# Errors — every failure mode is a typed subclass so the UI can react cleanly
# ---------------------------------------------------------------------------
class PDFProcessingError(Exception):
    """Base class for all PDF problems the UI shows to the user."""


class InvalidPDFError(PDFProcessingError):
    """Wrong extension, corrupt file, or not a PDF at all."""


class PasswordProtectedPDFError(PDFProcessingError):
    """PDF requires a password to open."""


class EmptyPDFError(PDFProcessingError):
    """No extractable text — usually a scanned / image-only document."""


# ---------------------------------------------------------------------------
# Data containers
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class PageText:
    """Text content of a single 1-based PDF page."""

    number: int
    text: str


@dataclass(frozen=True)
class TextChunk:
    """One retrievable chunk with its exact source location."""

    text: str
    source: str   # original filename
    page: int     # 1-based page number
    chunk_index: int  # position of the chunk inside its page


@dataclass
class ExtractedPDF:
    """Extraction result for one PDF file."""

    filename: str
    pages: List[PageText]

    @property
    def page_count(self) -> int:
        return len(self.pages)

    @property
    def total_characters(self) -> int:
        return sum(len(p.text) for p in self.pages)


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------
def validate_filename(filename: str) -> None:
    """Ensure the uploaded file claims to be a PDF."""
    if not filename or not filename.lower().endswith(".pdf"):
        raise InvalidPDFError(
            f'"{filename}" is not a PDF. Please upload files ending in .pdf.'
        )


def looks_like_pdf(file_bytes: bytes) -> bool:
    """Check for the ``%PDF`` header inside the first 1024 bytes (per spec)."""
    return b"%PDF" in file_bytes[:1024]


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------
def extract_pdf(filename: str, file_bytes: bytes) -> ExtractedPDF:
    """Extract per-page text from raw PDF bytes.

    Raises:
        InvalidPDFError: not a PDF / corrupt file / zero pages.
        PasswordProtectedPDFError: the document is encrypted.
        EmptyPDFError: no (or almost no) selectable text found.
    """
    validate_filename(filename)

    if not file_bytes:
        raise InvalidPDFError('The uploaded file is empty (0 bytes).')
    if not looks_like_pdf(file_bytes):
        raise InvalidPDFError(
            f'"{filename}" does not contain a PDF header (%PDF) — it may be '
            "a renamed or corrupted file."
        )

    try:
        doc = pymupdf.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:  # PyMuPDF raises several exception types here
        raise InvalidPDFError(f'Could not open "{filename}" as a PDF: {exc}')

    try:
        if doc.needs_pass:
            raise PasswordProtectedPDFError(
                f'"{filename}" is password-protected. Please upload an '
                "unlocked copy."
            )
        if doc.page_count == 0:
            raise EmptyPDFError(f'"{filename}" contains no pages.')

        pages: List[PageText] = []
        for index, page in enumerate(doc, start=1):
            raw = page.get_text("text") or ""
            # Light normalisation: collapse runs of spaces/tabs, keep newlines
            # (the recursive splitter uses them as break points).
            text = re.sub(r"[ \t]+", " ", raw).strip()
            pages.append(PageText(number=index, text=text))
    finally:
        doc.close()

    extracted = ExtractedPDF(filename=filename, pages=pages)
    if extracted.total_characters < MIN_DOCUMENT_LENGTH:
        raise EmptyPDFError(
            f'"{filename}" contains no selectable text. It is probably a '
            "scanned or image-only PDF — OCR is not supported by this app."
        )
    return extracted


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------
def split_into_chunks(pdf: ExtractedPDF) -> List[TextChunk]:
    """Split every page into overlapping chunks that keep their page number."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    chunks: List[TextChunk] = []
    for page in pdf.pages:
        if not page.text:
            continue
        for piece_index, piece in enumerate(splitter.split_text(page.text)):
            text = piece.strip()
            if len(text) < MIN_CHUNK_LENGTH:
                continue
            chunks.append(
                TextChunk(
                    text=text,
                    source=pdf.filename,
                    page=page.number,
                    chunk_index=piece_index,
                )
            )

    if not chunks:
        raise EmptyPDFError(
            f'"{pdf.filename}" produced no usable text chunks '
            "(the document may contain only images)."
        )
    return chunks


def process_pdf(filename: str, file_bytes: bytes) -> Tuple[ExtractedPDF, List[TextChunk]]:
    """Full pipeline for one file: validate → extract → chunk."""
    extracted = extract_pdf(filename, file_bytes)
    chunks = split_into_chunks(extracted)
    return extracted, chunks
