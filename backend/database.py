"""
Database connection module.

Uses DATABASE_URL environment variable when available (PostgreSQL in Docker),
otherwise falls back to a local SQLite database file for development.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is NOT set. PostgreSQL is REQUIRED.")

# [POSTGRESQL MIGRATION POINT]
# For 30,000+ tickets, SQLite vector search becomes too slow. 
# To switch to PostgreSQL, change the DATABASE_URL environment variable:
# e.g., export DATABASE_URL="postgresql://user:pass@localhost:5432/jira_db"
# The system will automatically detect 'postgresql' and enable pgvector extensions.

# SQLite needs check_same_thread=False; PostgreSQL does not
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
