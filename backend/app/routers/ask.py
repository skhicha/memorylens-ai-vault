from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.ask_ai import answer_question

router = APIRouter(prefix="/api/ask", tags=["ask"])


class AskRequest(BaseModel):
    question: str


class CitationOut(BaseModel):
    media_id: str
    filename: str
    media_type: str
    source: str
    segment_start: Optional[float]
    snippet: str


class AskResponse(BaseModel):
    answer: str
    provider: str
    citations: List[CitationOut]


@router.post("", response_model=AskResponse)
def ask(req: AskRequest) -> AskResponse:
    result = answer_question(req.question)
    return AskResponse(
        answer=result.answer,
        provider=result.provider,
        citations=[
            CitationOut(
                media_id=c.media_id,
                filename=c.filename,
                media_type=c.media_type,
                source=c.source,
                segment_start=c.segment_start,
                snippet=c.snippet,
            )
            for c in result.citations
        ],
    )
