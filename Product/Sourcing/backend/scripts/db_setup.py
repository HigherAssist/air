"""
Database setup script.
Run ONCE before first use to:
  1. Enable the pgvector extension
  2. Create all ORM tables
  3. Create the vector index for fast similarity search

Usage:
    cd Product/Sourcing
    python scripts/db_setup.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv()

import sqlalchemy
from sqlalchemy import create_engine, text

from app.config import get_settings
from app.db.orm_models import Base


def setup():
    settings = get_settings()
    print(f"Connecting to: {settings.DATABASE_URL_SYNC.split('@')[1] if '@' in settings.DATABASE_URL_SYNC else settings.DATABASE_URL_SYNC}")

    engine = create_engine(settings.DATABASE_URL_SYNC, pool_pre_ping=True)

    with engine.connect() as conn:
        # Enable pgvector extension
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
        print("pgvector extension: OK")

    # Create all tables
    Base.metadata.create_all(engine)
    print("Tables created: jobs, candidates, matches, chat_sessions, chat_messages")

    # Create HNSW vector index for fast approximate nearest-neighbor search
    # HNSW is faster than IVFFlat for our scale (<500k vectors)
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_jobs_embedding
            ON jobs USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_candidates_embedding
            ON candidates USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
        """))
        conn.commit()
    print("Vector indexes created (HNSW cosine)")

    # Create indexes for common query patterns
    with engine.connect() as conn:
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates (global_status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_matches_job_score ON matches (job_id, score DESC)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions (user_token)"))
        conn.commit()
    print("Additional indexes created")

    print("\nDatabase setup complete.")
    engine.dispose()


if __name__ == "__main__":
    setup()
