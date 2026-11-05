"""
Ask AI: a small retrieval-augmented-generation flow.

Retrieval: FTS5 search over filenames/tags/transcripts, used to build a
citation list of (media id, filename, source, timestamp, snippet).

Generation is pluggable via LLM_PROVIDER:
  - "mock" (default): no API key, no network call. Builds an extractive,
    clearly-labelled "offline mode" answer purely out of the retrieved
    snippets -- it never invents facts not present in the citations.
  - "anthropic": calls the real Claude API (anthropic Python SDK) with the
    retrieved context, instructed to answer only from it and cite sources.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List

from app.db import db_cursor
from app.services.search import search as fts_search


@dataclass
class Citation:
    media_id: str
    filename: str
    media_type: str
    source: str
    segment_start: float | None
    snippet: str


@dataclass
class AskResult:
    answer: str
    citations: List[Citation]
    provider: str


def _gather_citations(question: str, user_id: str, limit: int = 8) -> List[Citation]:
    hits = fts_search(question, limit=limit, user_id=user_id)
    citations: List[Citation] = []
    seen = set()
    for hit in hits:
        key = (hit.media_id, hit.source, hit.segment_start)
        if key in seen:
            continue
        seen.add(key)
        with db_cursor() as cur:
            cur.execute(
                "SELECT filename, media_type FROM media WHERE id = ? AND user_id = ?",
                (hit.media_id, user_id),
            )
            row = cur.fetchone()
        if not row:
            continue
        citations.append(
            Citation(
                media_id=hit.media_id,
                filename=row["filename"],
                media_type=row["media_type"],
                source=hit.source,
                segment_start=hit.segment_start,
                snippet=hit.text,
            )
        )
    return citations


def _mock_answer(question: str, citations: List[Citation]) -> str:
    if not citations:
        return (
            "[Offline mode / mock provider] I couldn't find anything in your vault that "
            "matches that question. Try different words, or upload and process some media first. "
            "This answer is template-based and only ever repeats what full-text search finds -- "
            "it never makes facts up."
        )
    lines = [
        "[Offline mode / mock provider -- no LLM API key used] "
        "Here is what your vault's full-text index actually contains for this question:",
        "",
    ]
    for i, c in enumerate(citations[:5], start=1):
        where = f" at {c.segment_start:.1f}s" if c.segment_start is not None else ""
        lines.append(f"{i}. [{c.filename}]{where} ({c.source}): \"{c.snippet.replace('<mark>', '').replace('</mark>', '')}\"")
    lines.append("")
    lines.append(
        "Switch LLM_PROVIDER=anthropic in backend/.env (with ANTHROPIC_API_KEY set) "
        "for a fluent, synthesized answer over these same citations."
    )
    return "\n".join(lines)


def _anthropic_answer(question: str, citations: List[Citation]) -> str:
    import anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return _mock_answer(question, citations) + "\n\n(ANTHROPIC_API_KEY not set -- fell back to offline mode.)"

    model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")
    context_blocks = []
    for i, c in enumerate(citations, start=1):
        where = f" at {c.segment_start:.1f}s" if c.segment_start is not None else ""
        clean_snippet = c.snippet.replace("<mark>", "").replace("</mark>", "")
        context_blocks.append(f"[{i}] file={c.filename}{where} source={c.source}\n{clean_snippet}")
    context = "\n\n".join(context_blocks) if context_blocks else "(no matching media found)"

    system = (
        "You are the Ask AI assistant for MemoryLens AI, a personal photo/video vault. "
        "Answer the user's question using ONLY the numbered context snippets below, which come "
        "from the user's own transcripts/tags/filenames. Cite sources inline like [1], [2]. "
        "If the context doesn't contain the answer, say so plainly -- never invent details, "
        "dates, or people that are not present in the context."
    )
    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=model,
        max_tokens=600,
        system=system,
        messages=[{"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"}],
    )
    text_parts = [block.text for block in response.content if block.type == "text"]
    return "\n".join(text_parts).strip() or _mock_answer(question, citations)


def answer_question(question: str, user_id: str) -> AskResult:
    citations = _gather_citations(question, user_id)
    provider = os.environ.get("LLM_PROVIDER", "mock").lower()

    if provider == "anthropic":
        try:
            answer = _anthropic_answer(question, citations)
        except Exception as exc:  # noqa: BLE001 - never 500 the chat on provider errors
            answer = (
                f"[Anthropic provider error, falling back to offline mode: {exc}]\n\n"
                + _mock_answer(question, citations)
            )
            provider = "mock (fallback)"
    else:
        answer = _mock_answer(question, citations)
        provider = "mock"

    return AskResult(answer=answer, citations=citations, provider=provider)
