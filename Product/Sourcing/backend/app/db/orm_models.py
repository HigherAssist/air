"""
SQLAlchemy ORM models.
Tables: jobs, candidates, matches, chat_sessions, chat_messages
"""
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


class Job(Base):
    """Active job from Loxo ATS with embedding for semantic search."""

    __tablename__ = "jobs"

    id = Column(BigInteger, primary_key=True)           # Loxo job_id
    title = Column(String(500), nullable=False)
    company = Column(String(500))
    city = Column(String(200))
    state = Column(String(100))
    country = Column(String(100))
    location = Column(String(500))                      # Derived full location string
    job_type = Column(String(100))                      # full_time, contract, etc.
    description = Column(Text)                          # Plain text description
    description_html = Column(Text)                     # Original HTML
    internal_notes = Column(Text)                       # Plain text internal notes
    pay_rate_min = Column(Float)
    pay_rate_max = Column(Float)
    salary_min = Column(Float)
    salary_max = Column(Float)
    salary_type = Column(String(50))                    # annual, hourly, monthly, etc.
    remote_work_allowed = Column(Boolean, default=False)
    status = Column(String(100))
    pipeline_counts = Column(JSONB)                     # Stage breakdown [{id, name, count}]
    raw_data = Column(JSONB)                            # Full Loxo API response
    embedding = Column(Vector(384))                     # Job description embedding
    last_synced_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    matches = relationship("Match", back_populates="job", cascade="all, delete-orphan")


class Candidate(Base):
    """Person candidate from Loxo ATS with profile, resume text, and embedding."""

    __tablename__ = "candidates"

    id = Column(BigInteger, primary_key=True)           # Loxo person_id
    first_name = Column(String(200))
    last_name = Column(String(200))
    email = Column(String(500))
    phone = Column(String(100))
    city = Column(String(200))
    state = Column(String(100))
    country = Column(String(100))
    location = Column(String(500))                      # Derived full location string
    current_title = Column(String(500))
    current_company = Column(String(500))
    skills = Column(ARRAY(Text))
    linkedin_url = Column(String(500))
    global_status = Column(String(100))                 # contacted, in_progress, hired, etc.
    global_status_id = Column(Integer)
    resume_text = Column(Text)                          # Extracted PDF text (truncated)
    resume_s3_key = Column(String(500))                 # S3 object key for raw PDF
    job_profiles = Column(JSONB)                        # Work history array
    education_profiles = Column(JSONB)                  # Education array
    raw_data = Column(JSONB)                            # Full Loxo API response
    embedding = Column(Vector(384))                     # Candidate profile embedding
    last_synced_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    matches = relationship("Match", back_populates="candidate", cascade="all, delete-orphan")


class Match(Base):
    """Pre-computed and on-demand LLM match scores between jobs and candidates."""

    __tablename__ = "matches"
    __table_args__ = (UniqueConstraint("job_id", "candidate_id", name="uq_job_candidate"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(BigInteger, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    candidate_id = Column(BigInteger, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    score = Column(Integer, nullable=False)             # 0-100
    reasoning = Column(Text)                            # Brief LLM justification
    vector_similarity = Column(Float)                   # Pre-filter cosine similarity score
    prompt_version = Column(String(50), default="v1")  # Track prompt changes over time
    computed_at = Column(DateTime(timezone=True), server_default=func.now())

    job = relationship("Job", back_populates="matches")
    candidate = relationship("Candidate", back_populates="matches")


class ChatSession(Base):
    """A conversation session between a recruiter and the chatbot."""

    __tablename__ = "chat_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_token = Column(String(500), nullable=False, index=True)  # AIR dbUser.id
    title = Column(String(300))                         # Auto-generated from first message
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_activity_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    messages = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(Base):
    """A single message in a chat session."""

    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)           # 'user' | 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("ChatSession", back_populates="messages")
