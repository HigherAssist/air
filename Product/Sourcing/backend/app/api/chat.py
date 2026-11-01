from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.orm_models import ChatMessage, ChatSession
from app.db.session import get_db
from app.models.chat import (
    ChatRequest,
    ChatResponse,
    ChatSessionSummary,
    SessionSearchRequest,
)
from app.services.chat_service import handle_chat

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    """Send a message to the sourcing chatbot and receive a reply."""
    reply, session_id = await handle_chat(
        user_message=req.message,
        user_token=req.user_token,
        session_id=req.session_id,
        db=db,
    )
    # Get session title for the response
    session = await db.get(ChatSession, session_id) if session_id else None
    return ChatResponse(
        session_id=session_id,
        reply=reply,
        session_title=session.title if session else None,
    )


@router.get("/sessions", response_model=List[ChatSessionSummary])
async def list_sessions(user_token: str, db: AsyncSession = Depends(get_db)):
    """List all chat sessions for a user, most recent first."""
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_token == user_token)
        .order_by(ChatSession.last_activity_at.desc())
    )
    sessions = result.scalars().all()

    summaries = []
    for s in sessions:
        count_result = await db.execute(
            select(func.count()).where(ChatMessage.session_id == s.id)
        )
        count = count_result.scalar() or 0
        summaries.append(
            ChatSessionSummary(
                id=str(s.id),
                title=s.title,
                created_at=s.created_at.isoformat() if s.created_at else None,
                last_activity_at=s.last_activity_at.isoformat() if s.last_activity_at else None,
                message_count=count,
            )
        )
    return summaries


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    user_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Load all messages for a specific session."""
    import uuid as _uuid
    try:
        sid = _uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = await db.execute(
        select(ChatSession).where(
            ChatSession.id == sid, ChatSession.user_token == user_token
        )
    )
    sess = session.scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == sid)
        .order_by(ChatMessage.created_at)
    )
    messages = result.scalars().all()
    return [
        {
            "id": str(m.id),
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    user_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a specific chat session and all its messages."""
    import uuid as _uuid
    try:
        sid = _uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == sid, ChatSession.user_token == user_token
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await db.delete(session)
    await db.commit()
    return {"status": "deleted"}


@router.post("/search")
async def search_sessions(req: SessionSearchRequest, db: AsyncSession = Depends(get_db)):
    """Search chat sessions by message content."""
    result = await db.execute(
        select(ChatSession)
        .join(ChatMessage, ChatMessage.session_id == ChatSession.id)
        .where(
            ChatSession.user_token == req.user_token,
            ChatMessage.content.ilike(f"%{req.query}%"),
        )
        .distinct()
        .order_by(ChatSession.last_activity_at.desc())
    )
    sessions = result.scalars().all()
    return [
        {"id": str(s.id), "title": s.title, "last_activity_at": s.last_activity_at.isoformat() if s.last_activity_at else None}
        for s in sessions
    ]
