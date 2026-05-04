"""
This file defines the data structures for the Jira Task Optimizer.
It contains both SQLAlchemy models (for the database) and Pydantic models
(for validating incoming/outgoing API data).

When DATABASE_URL points to PostgreSQL the embedding column uses
pgvector's Vector(384) type; otherwise it falls back to LargeBinary
for local SQLite development.
"""
import os
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, JSON, DateTime, LargeBinary, Index
from database import Base
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

_USE_PG = os.environ.get("DATABASE_URL", "").startswith("postgresql")

# [POSTGRESQL MIGRATION POINT]
# The _USE_PG flag automatically enables advanced PostgreSQL features.
# - SQLite: Uses LargeBinary for basic local caching. Embeddings are pulled into app memory.
# - PostgreSQL: Uses pgvector (Vector(384)) and native HNSW indexing for millisecond similarity search at 30k+ scale.
if _USE_PG:
    from pgvector.sqlalchemy import Vector

# --- SQLAlchemy Models (Database) ---

class JiraUser(Base):
    __tablename__ = "jira_users"

    account_id = Column(String, primary_key=True, index=True)
    display_name = Column(String)
    email = Column(String, index=True)
    active = Column(Boolean, default=True)

class PortalUser(Base):
    __tablename__ = "portal_users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class Project(Base):
    __tablename__ = "projects"
    
    key = Column(String, primary_key=True, index=True)
    name = Column(String)
    
    # Optional per-project credential overrides
    server_url = Column(String, nullable=True)
    user_email = Column(String, nullable=True)
    api_token = Column(String, nullable=True)
    
    # Project-specific settings
    active_strategy = Column(String, default="BALANCED")
    override_labels = Column(String, default="")
    
    last_sync_date = Column(String, nullable=True)
    scheduler_enabled = Column(Boolean, default=False)
    daily_sync_enabled = Column(Boolean, default=True)
    weekly_sync_enabled = Column(Boolean, default=True)
    monthly_sync_enabled = Column(Boolean, default=True)
    
    # State tracking for background migrations/syncs
    sync_progress = Column(JSON, nullable=True)
    sync_type = Column(String, nullable=True)

class TaskCache(Base):
    __tablename__ = "task_cache"
    
    issue_key = Column(String, primary_key=True, index=True)
    project_key = Column(String, index=True, nullable=False, default="DEFAULT")
    assignee_id = Column(String, index=True)
    status_category = Column(String) # "Done", "In Progress", etc.
    labels = Column(JSON) # List of labels
    issue_type = Column(String)
    story_points = Column(Float, default=0.0)
    priority = Column(String)
    resolved_at = Column(DateTime, nullable=True, index=True)
    updated_at = Column(DateTime, nullable=True, index=True)
    description = Column(String)
    summary = Column(String)
    
    # New: Reliability Metrics
    completed_on_time = Column(Boolean, default=True)
    reopen_count = Column(Integer, default=0)
        
    if os.environ.get("DATABASE_URL", "").startswith("postgresql"):
        from pgvector.sqlalchemy import Vector
        embedding = Column(Vector(384))
        print("[MODEL] Using pgvector for embeddings.")
    else:
        embedding = Column(LargeBinary) # Standard SQLite compatible type
        print("[MODEL] Using LargeBinary for embeddings.")

# HNSW index — only effective on PostgreSQL with pgvector
if _USE_PG:
    Index(
        'ix_task_cache_embedding_hnsw',
        TaskCache.embedding,
        postgresql_using='hnsw',
        postgresql_with={'m': 16, 'ef_construction': 64},
        postgresql_ops={'embedding': 'vector_cosine_ops'}
    )

class Setting(Base):
    __tablename__ = "settings"
    
    key = Column(String, primary_key=True, index=True)
    value = Column(String)

class TeamRule(Base):
    __tablename__ = "team_rules"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    project_key = Column(String, index=True, nullable=False, default="DEFAULT")
    match_type = Column(String) # 'component' or 'label'
    match_value = Column(String) # e.g. 'Simulation'
    allowed_team = Column(String) # e.g. 'Simulation Team'

class UserTeam(Base):
    __tablename__ = "user_teams"
    user_account_id = Column(String, primary_key=True, index=True)
    project_key = Column(String, primary_key=True, index=True, default="GLOBAL")
    team_name = Column(String)
 
class DeveloperActivity(Base):
    __tablename__ = "developer_activity_cache"
    
    project_key = Column(String, primary_key=True, index=True)
    account_id = Column(String, primary_key=True, index=True)
    active_dates = Column(JSON)      # List of ISO dates ["2026-03-24", ...]
    leave_dates = Column(JSON)       # List of ISO dates ["2026-03-20", ...]
    has_assignments = Column(Boolean)
    updated_at = Column(DateTime, default=datetime.utcnow)

# --- Pydantic Models (API Data Validation) ---

class ProjectSchema(BaseModel):
    key: str
    name: str
    server_url: Optional[str] = None
    user_email: Optional[str] = None
    api_token: Optional[str] = None
    copy_credentials_from: Optional[str] = None
    active_strategy: str = "BALANCED"
    override_labels: str = ""
    last_sync_date: Optional[str] = None
    scheduler_enabled: bool = False
    daily_sync_enabled: bool = True
    weekly_sync_enabled: bool = True
    monthly_sync_enabled: bool = True
    sync_progress: Optional[Dict[str, Any]] = None
    sync_type: Optional[str] = None

    class Config:
        from_attributes = True

class ProxyCredentials(BaseModel):
    server_url: str
    user_email: Optional[str] = None
    api_token: str
    project_key: Optional[str] = None
    copy_credentials_from: Optional[str] = None

class JiraSearchUsersRequest(ProxyCredentials):
    query: str

class TeamMemberCreate(BaseModel):
    name: str
    label: str
    members: List[str]

class CreateProjectWithTeamsRequest(BaseModel):
    key: str
    name: str
    server_url: str
    user_email: Optional[str] = None
    api_token: str
    connection_type: str = "cloud"
    copy_credentials_from: Optional[str] = None
    teams: List[TeamMemberCreate] = []
    skip_migration: bool = False

class ConnectionTestRequest(BaseModel):
    server_url: str
    user_email: str = ""
    api_token: str
    connection_type: str = "cloud"  # "cloud" or "server"
    copy_credentials_from: Optional[str] = None
    project_key: Optional[str] = None

class ScoringWeights(BaseModel):
    expertise: float = 0.35
    workload: float = 0.30
    success_rate: float = 0.05
    category_experience: float = 0.15
    recent_activity: float = 0.15

STRATEGY_PRESETS = {
    "BALANCED": ScoringWeights(
        expertise=0.35, workload=0.30, success_rate=0.05,
        category_experience=0.15, recent_activity=0.15
    ),
    "SPEED": ScoringWeights(
        expertise=0.10, workload=0.50, success_rate=0.05,
        category_experience=0.05, recent_activity=0.30
    ),
    "QUALITY": ScoringWeights(
        expertise=0.40, workload=0.10, success_rate=0.15,
        category_experience=0.25, recent_activity=0.10
    ),
    "GROWTH": ScoringWeights(
        expertise=0.05, workload=0.40, success_rate=0.00,
        category_experience=0.10, recent_activity=0.45
    )
}

class RecommendedUserResult(BaseModel):
    user_id: str
    display_name: str
    is_eligible: bool = True
    filtered_reason: Optional[str] = None
    task_type: str = "generalist" # 'specialist' or 'generalist'
    total_score: float
    expertise_score: float
    workload_score: float
    success_rate_score: float
    category_experience_score: float = 50.0
    recent_activity_score: float = 50.0
    primary_label: str = ""
    secondary_label: str = ""
    reasoning_data: Dict[str, Any] = {}
    warnings: List[str] = []
class RecommendationResponse(BaseModel):
    issue_key: str
    recommendations: List[RecommendedUserResult]
    applied_weights: ScoringWeights
    task_type: str = "generalist"

class JiraSettingsUpdate(BaseModel):
    server_url: str
    user_email: str
    api_token: str
    project_key: str
    
    # Active strategy preset instead of granular weights
    active_strategy: str = "BALANCED" # "BALANCED", "SPEED", "QUALITY", "GROWTH"
    override_labels: str = "documentation,general,minor-bug,typo" # comma separated

# --- Advanced Settings (Scoring Engine Constants) ---

class AdvancedSettings(Base):
    __tablename__ = "advanced_settings"

    project_key = Column(String, primary_key=True, default="DEFAULT")
    # Personalized criterion weights (must sum to 1.0)
    w_expertise = Column(Float, default=0.35)
    w_workload = Column(Float, default=0.30)
    w_success_rate = Column(Float, default=0.05)
    w_category_experience = Column(Float, default=0.15)
    w_recent_activity = Column(Float, default=0.15)
    # Criterion 1: Expertise Score weights (must sum to 1.0)
    expertise_nlp_weight = Column(Float, default=0.60)
    expertise_label_weight = Column(Float, default=0.40)
    # Criterion 2: Workload Score saturation thresholds
    workload_task_saturation = Column(Integer, default=30)
    workload_sp_saturation = Column(Integer, default=60)
    # Criterion 3: Success Rate weights (must sum to 1.0)
    success_deadline_weight = Column(Float, default=0.70)
    success_reopen_weight = Column(Float, default=0.30)
    # Criterion 4: Category Experience Scaling
    category_saturation_point = Column(Integer, default=100)
    # Criterion 5: Recent Activity Config
    activity_window_days = Column(Integer, default=14)
    activity_neutral_score = Column(Integer, default=50)
    # Leave Tracking Config
    leave_label = Column(String, default="")
    leave_threshold_days = Column(Integer, default=15)
    leave_window_days = Column(Integer, default=30)
    leave_exclude_weekends = Column(Boolean, default=True)

class AdvancedSettingsSchema(BaseModel):
    w_expertise: float = 0.35
    w_workload: float = 0.30
    w_success_rate: float = 0.05
    w_category_experience: float = 0.15
    w_recent_activity: float = 0.15
    expertise_nlp_weight: float = 0.60
    expertise_label_weight: float = 0.40
    workload_task_saturation: int = 30
    workload_sp_saturation: int = 60
    success_deadline_weight: float = 0.70
    success_reopen_weight: float = 0.30
    category_saturation_point: int = 100
    activity_window_days: int = 14
    activity_neutral_score: int = 50
    leave_label: str = ""
    leave_threshold_days: int = 15
    leave_window_days: int = 30
    leave_exclude_weekends: bool = True
 
class DeveloperActivitySchema(BaseModel):
    project_key: str
    account_id: str
    active_dates: List[str]
    leave_dates: List[str]
    has_assignments: bool
    updated_at: datetime
    
    class Config:
        from_attributes = True
