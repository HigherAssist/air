from typing import List, Optional
from pydantic import BaseModel


class ChatMessageIn(BaseModel):
    role: str       # 'user' | 'assistant'
    content: str


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None    # UUID; if None, starts a new session
    user_token: str                     # AIR dbUser.id passed from iframe URL


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    session_title: Optional[str] = None


class ChatSessionSummary(BaseModel):
    id: str
    title: Optional[str] = None
    created_at: Optional[str] = None
    last_activity_at: Optional[str] = None
    message_count: int = 0

    model_config = {"from_attributes": True}


class SessionSearchRequest(BaseModel):
    user_token: str
    query: str
