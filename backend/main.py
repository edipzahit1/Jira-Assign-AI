import os
import sys
from dotenv import load_dotenv

# Try to load .env from current dir and then parent dir
load_dotenv()
if os.path.exists("../.env"):
    load_dotenv("../.env")

from sqlalchemy.orm import defer
from nlp_utils import get_text_embedding
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from database import engine, Base, get_db, SessionLocal
from sqlalchemy import text
from jira_client import client as jira_client
from scoring_engine import ScoringEngine
from models import ScoringWeights, RecommendationResponse, JiraSettingsUpdate, Setting, TaskCache, RecommendedUserResult, PortalUser, JiraUser, AdvancedSettings, AdvancedSettingsSchema, Project, ProjectSchema, TeamRule, UserTeam, ConnectionTestRequest, ProxyCredentials, JiraSearchUsersRequest, TeamMemberCreate, CreateProjectWithTeamsRequest, DeveloperActivity
from auth import router as auth_router, get_current_user, get_password_hash, verify_password
from fastapi import FastAPI, HTTPException, Depends, APIRouter
from crypto_utils import encrypt_token, decrypt_token
from scheduler import start_scheduler, stop_scheduler, get_scheduler_status
from contextlib import asynccontextmanager
# Environment is already loaded at the top

if os.environ.get("DATABASE_URL", "").startswith("postgresql"):
    try:
        db_url_safe = os.environ.get("DATABASE_URL").split('@')[-1]
        print(f"[STARTUP] Connecting to PostgreSQL at {db_url_safe}")
        # Use AUTOCOMMIT because Postgres cannot create extensions inside a transaction block
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            print("[STARTUP] pgvector extension ensured.")
    except Exception as e:
        print(f"[CRITICAL] Could not create vector extension: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup Logic ──
    db = SessionLocal()
    try:
        # 1. Ensure DB is ready and tables exist (PostgreSQL specific)
        if os.environ.get("DATABASE_URL", "").startswith("postgresql"):
            # Use a raw connection to ensure the extension exists
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                print("[STARTUP] pgvector extension ensured.")
        
        # 2. Create tables if they don't exist
        print("[STARTUP] Synchronizing database schema...")
        Base.metadata.create_all(bind=engine)
        print("[STARTUP] Schema synchronization complete.")

        # 3. Load NLP model & Start multi-project scheduler
        from nlp_utils import load_model
        load_model()
        start_scheduler()

        # 4. Admin User Seeding
        admin_user = os.environ.get("ADMIN_USERNAME")
        admin_pass = os.environ.get("ADMIN_PASSWORD")
        
        if admin_user and admin_pass:
            existing_admin = db.query(PortalUser).filter(PortalUser.username == admin_user).first()
            if not existing_admin:
                print(f"[AUTH] Seeding admin user: {admin_user}")
                new_admin = PortalUser(
                    username=admin_user,
                    hashed_password=get_password_hash(admin_pass)
                )
                db.add(new_admin)
                db.commit()
                print("[AUTH] Admin user seeded successfully.")
    except Exception as e:
        print(f"[STARTUP ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()
    
    import asyncio
    try:
        yield
    except asyncio.CancelledError:
        # This is expected on Ctrl+C shutdown
        pass
    finally:
        # ── Shutdown Logic ──
        # Offload to thread to avoid blocking the loop during exit
        await asyncio.to_thread(stop_scheduler)

app = FastAPI(title="Jira Task Assignment Optimizer", lifespan=lifespan)

# CORS Configuration
# IT Note: Specify your official domain(s) in the .env file under ALLOWED_ORIGINS.
# Separate multiple domains with commas.
allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "*")
origins = [o.strip() for o in allowed_origins_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Rate Limiting (Brute-Force Protection) ──
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from rate_limiter import limiter

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

from starlette.requests import Request
from starlette.responses import JSONResponse

# ── Secured API Router ──
api_router = APIRouter(prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(auth_router)
import traceback
import re

def _sanitize_log(text: str) -> str:
    """Strip sensitive tokens/passwords from log output."""
    return re.sub(r'(api_token|password|secret|token)["\']?\s*[:=]\s*["\']?[^\s,;"\'}\]]+', r'\1=***REDACTED***', text, flags=re.IGNORECASE)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    err_msg = _sanitize_log(f"{str(exc)}\n{traceback.format_exc()}")
    print(f"[CRITICAL EXCEPTION]\n{err_msg}", file=sys.stderr)
    return JSONResponse(status_code=500, content={"detail": _sanitize_log(str(exc))})

class TaskRecommendationRequest(BaseModel):
    issue_key: str
    strategy: Optional[str] = None # Allows frontend to temporarily override Strategy Preset
    lang: str = "en"

class AssignRequest(BaseModel):
    issue_id: str
    user_id: str

class DeleteProjectRequest(BaseModel):
    password: str

@app.get("/")
def read_root():
    return {"message": "Welcome to the Jira Task Assignment Optimizer API"}

# ── Credential Resolver Helper ──
def resolve_credentials(req, db: Session):
    """Fallback to referenced project credentials or global settings if not provided."""
    server = (req.server_url or "").rstrip("/")
    user_email = req.user_email
    api_token = req.api_token
    
    # If copying, bypass provided credentials and use established ones (resolved)
    if getattr(req, "copy_credentials_from", None):
        ref_proj = db.query(Project).filter(Project.key == req.copy_credentials_from).first()
        if not ref_proj:
            raise HTTPException(status_code=400, detail="Reference project for credentials not found.")
        
        # 1. Start with project-specific overrides
        server = (ref_proj.server_url or "").rstrip("/")
        user_email = ref_proj.user_email
        api_token = decrypt_token(ref_proj.api_token) if ref_proj.api_token else ""

    # 2. Fallback to global settings if reference project doesn't have its own
    if not server:
        url_setting = db.query(Setting).filter(Setting.key == "jira_url").first()
        if url_setting: server = url_setting.value.rstrip("/")
    if not user_email:
        email_setting = db.query(Setting).filter(Setting.key == "jira_email").first()
        if email_setting: user_email = email_setting.value
    if not api_token:
        token_setting = db.query(Setting).filter(Setting.key == "jira_token").first()
        if token_setting: api_token = decrypt_token(token_setting.value)
        
    if not server:
        raise HTTPException(status_code=400, detail="Server URL is required.")
    if not api_token:
        raise HTTPException(status_code=400, detail="API Token/PAT is missing or decryption failed.")
        
    return server, user_email, api_token

# ── Connection Test (secured via api_router) ──
@api_router.post("/jira/test-connection")
def test_jira_connection(req: ConnectionTestRequest, db: Session = Depends(get_db)):
    """Validate Jira credentials without persisting them."""
    import requests as http_requests
    from jira import JIRA, JIRAError

    print(f"[TEST CONNECTION] Req Key: {req.project_key}, Copying: {req.copy_credentials_from}")
    
    server, user_email, api_token = resolve_credentials(req, db)
    print(f"[TEST CONNECTION] Resolved credentials. Server={server}, Email={user_email if user_email else 'TOKEN_AUTH'}, TokenFound={bool(api_token)}")

    try:
        # Match jira_client.py: basic_auth if email exists, token_auth otherwise (PAT)
        if user_email:
            print(f"[TEST CONNECTION] Connecting with Basic Auth (Cloud)...")
            jira_client_test = JIRA(
                options={'server': server},
                basic_auth=(user_email, api_token),
                timeout=10,
            )
        else:
            print(f"[TEST CONNECTION] Connecting with Token Auth (Server/PAT)...")
            jira_client_test = JIRA(
                options={'server': server},
                token_auth=api_token,
                timeout=10,
            )
        
        user_info = jira_client_test.myself()
        display_name = user_info.get('displayName', user_info.get('name', 'Unknown'))
        message = f"Connected as {display_name}"
        
        # If project_key provided, verify it exists in Jira
        if req.project_key:
            try:
                p = jira_client_test.project(req.project_key)
                message += f" | Verified Project: {p.name}"
            except JIRAError as pe:
                if pe.status_code == 404:
                    raise HTTPException(status_code=400, detail=f"Project '{req.project_key}' not found in this Jira instance.")
                raise HTTPException(status_code=400, detail=f"Jira Project Error: {str(pe.text)[:100]}")

        return {
            "success": True,
            "message": message,
            "user": display_name,
        }

    except JIRAError as e:
        status = getattr(e, "status_code", 0)
        if status in (401, 403):
            detail = "Invalid email or API token."
        elif status == 404:
            detail = "The Jira URL provided does not exist or is unreachable."
        else:
            detail = f"Jira error ({status}): {str(e.text)[:200] if hasattr(e, 'text') else str(e)[:200]}"
        raise HTTPException(status_code=400, detail=detail)

    except http_requests.exceptions.Timeout:
        raise HTTPException(status_code=400, detail="Connection timed out. Check your URL or network.")

    except http_requests.exceptions.ConnectionError:
        raise HTTPException(status_code=400, detail="Could not connect to the server. Verify the URL.")

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)[:200]}")

@api_router.post("/jira/count")
def get_jira_count(req: ProxyCredentials, db: Session = Depends(get_db)):
    """Fetch total completed issues count for initial sync estimation."""
    from jira import JIRA, JIRAError
    try:
        server, user_email, api_token = resolve_credentials(req, db)
        if user_email:
            jira_temp = JIRA(options={'server': server}, basic_auth=(user_email, api_token), timeout=10)
        else:
            jira_temp = JIRA(options={'server': server}, token_auth=api_token, timeout=10)
            
        jql = f'project = {req.project_key} AND assignee is not EMPTY'
        try:
            if hasattr(jira_temp, 'enhanced_search_issues'):
                result = jira_temp.enhanced_search_issues(jql, maxResults=0)
            else:
                result = jira_temp.search_issues(jql, maxResults=0)
        except Exception:
            result = jira_temp.search_issues(jql, maxResults=0)
            
        total = getattr(result, 'total', 0)
        
        # Estimate CPU time: ~1 second per 5 issues encoded + ~0.2 per fetch
        # So about 0.2s * total 
        eta_seconds = int(total * 0.25)
        
        return {
            "total": total,
            "eta_seconds": eta_seconds
        }
    except JIRAError as e:
        raise HTTPException(status_code=400, detail=f"Jira API error: {str(e.text)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error counting issues: {str(e)}")

@api_router.post("/jira/search-users")
def proxy_search_users(req: JiraSearchUsersRequest, db: Session = Depends(get_db)):
    """Search for users in Jira using proxy credentials (for team wizard)."""
    from jira import JIRA, JIRAError
    try:
        server, user_email, api_token = resolve_credentials(req, db)
        if user_email:
            jira_temp = JIRA(options={'server': server}, basic_auth=(user_email, api_token), timeout=10)
        else:
            jira_temp = JIRA(options={'server': server}, token_auth=api_token, timeout=10)
        
        # Try different search variants to ensure a match for both Cloud and Server
        # Some Jira Python versions use 'query', some use 'username'
        users = []
        try:
            # Cloud variant — using positional arguments to be safer across versions
            # First attempt: treat req.query as the search string for assignable users
            users = jira_temp.search_assignable_users_for_projects(req.query, req.project_key)
        except Exception as e1:
            try:
                # Second attempt: try passing as query=... keyword for newer Cloud versions
                users = jira_temp.search_assignable_users_for_projects(query=req.query, projectKeys=req.project_key)
            except Exception as e2:
                try:
                    # Third attempt: Generic user search if project-scoped fails. 
                    # We will filter manually later.
                    users = jira_temp.search_users(req.query)
                except Exception as e3:
                    # Final attempt: just get everyone assignable to the project if search text is still empty/failing
                    try:
                        users = jira_temp.search_assignable_users_for_projects("", req.project_key)
                    except:
                        users = []
            
        active_users = []
        for u in users:
            # Filters: active status and must somewhat match our search query if we did a broad fetch
            is_active = getattr(u, 'active', True)
            if not is_active: continue
            
            disp = getattr(u, 'displayName', getattr(u, 'name', 'Unknown'))
            uid = getattr(u, 'accountId', None) or getattr(u, 'key', None) or getattr(u, 'name', 'unknown')
            
            # Extract avatar URL
            avatar = ''
            if hasattr(u, 'avatarUrls'):
                try:
                    avatar = getattr(u.avatarUrls, '48x48', '')
                except:
                    pass
            
            active_users.append({"account_id": uid, "display_name": disp, "avatar_url": avatar})
            
        return active_users[:20]  # Cap results for UI sanity
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error proxying user search: {str(e)}")

@api_router.post("/jira/labels")
def proxy_get_labels(req: ProxyCredentials, db: Session = Depends(get_db)):
    """Fetch unique labels from the project via proxy (for team wizard)."""
    from jira import JIRA, JIRAError
    try:
        server, user_email, api_token = resolve_credentials(req, db)
        if user_email:
            jira_temp = JIRA(options={'server': server}, basic_auth=(user_email, api_token), timeout=10)
        else:
            jira_temp = JIRA(options={'server': server}, token_auth=api_token, timeout=10)
            
        jql = f'project = {req.project_key}'
        # Fast scan for labels across last 1000 issues
        try:
            if hasattr(jira_temp, 'enhanced_search_issues'):
                issues = jira_temp.enhanced_search_issues(jql, maxResults=1000, fields="labels")
            else:
                issues = jira_temp.search_issues(jql, maxResults=1000, fields="labels")
        except Exception:
            issues = jira_temp.search_issues(jql, maxResults=1000, fields="labels")
        unique_labels = set()
        for issue in issues:
            if hasattr(issue.fields, "labels") and issue.fields.labels:
                for label in issue.fields.labels:
                    unique_labels.add(label)
                    
        return sorted(list(unique_labels))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error proxying labels: {str(e)}")

from fastapi import BackgroundTasks

@api_router.post("/projects/create-with-teams")
def create_project_with_teams_and_sync(req: CreateProjectWithTeamsRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Creates project, teams, caches token, and starts background migration job atomically."""
    server, user_email, api_token = resolve_credentials(req, db)

    # 1. Create Project
    if db.query(Project).filter(Project.key == req.key).first():
        raise HTTPException(status_code=400, detail="Project key already exists")
        
    new_project = Project(
        key=req.key,
        name=req.name,
        server_url=server,
        user_email=user_email,
        api_token=encrypt_token(api_token) if api_token else None,
        active_strategy="BALANCED",
        sync_progress={"status": "idle", "total": 0, "current": 0}
    )
    db.add(new_project)
    
    # 2. Add Teams and User Mappings
    team_names = []
    for tm in req.teams:
        if tm.name not in team_names:
            team_names.append(tm.name)
        team_rule = TeamRule(project_key=req.key, allowed_team=tm.name, match_type='label', match_value=tm.label)
        db.add(team_rule)
        for user_id in tm.members:
            ut = UserTeam(project_key=req.key, team_name=tm.name, user_account_id=user_id)
            db.add(ut)
            
    if team_names:
        import json
        key_name = f"created_teams_{req.key}"
        existing_setting = db.query(Setting).filter(Setting.key == key_name).first()
        if existing_setting:
            existing_setting.value = json.dumps(team_names)
        else:
            db.add(Setting(key=key_name, value=json.dumps(team_names)))
            
    db.commit()
    
    # 3. Start Sync Job automatically
    from sync_service import MigrationService
    
    def background_sync_task(project_key: str):
        # We need a fresh session for the background worker
        from database import SessionLocal
        bg_db = SessionLocal()
        try:
            svc = MigrationService(bg_db, project_key)
            svc.run(mode="full")
        except Exception as e:
            msg = f"BACKGROUND SYNC CRITICAL THREAD ERROR: {str(e)}"
            from datetime import datetime
            print(f"[CRITICAL] {datetime.now().isoformat()} - {msg}", file=sys.stderr)
        finally:
            bg_db.close()
            
    if not req.skip_migration:
        background_tasks.add_task(background_sync_task, req.key)
        return {"message": "Project created and sync started", "project_key": req.key}
    
    # If skipping, update sync progress immediately
    db.query(Project).filter(Project.key == req.key).update({
        "sync_progress": {"status": "completed", "total": 0, "current": 0}
    })
    db.commit()
    return {"message": "Project created (sync skipped)", "project_key": req.key}

class SyncRequest(BaseModel):
    mode: str = "daily"

@api_router.post("/projects/{project_key}/sync")
def trigger_sync(project_key: str, req: SyncRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    from sync_service import MigrationService
    project = db.query(Project).filter(Project.key == project_key).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    def background_sync_task(project_key: str, mode: str):
        from database import SessionLocal
        bg_db = SessionLocal()
        try:
            svc = MigrationService(bg_db, project_key)
            real_mode = "incremental"
            if mode == "monthly": real_mode = "reconcile"
            if mode == "full": real_mode = "re-embed"
            svc.run(mode=real_mode)
        except Exception as e:
            print(f"[CRITICAL] Sync error: {str(e)}", file=sys.stderr)
        finally:
            bg_db.close()

    background_tasks.add_task(background_sync_task, project_key, req.mode)
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=202, content={"message": f"Sync started in mode {req.mode}", "status": "running"})

@api_router.get("/projects/{project_key}/sync-status")
def get_sync_status(project_key: str, db: Session = Depends(get_db)):
    import json as json_lib
    # Expire all cached ORM objects so we read fresh data from DB
    # This is critical because a background thread may have updated sync_progress
    db.expire_all()
    project = db.query(Project).filter(Project.key == project_key).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    state = project.sync_progress
    if not state:
        return {"status": "idle"}
    # Handle case where SQLite stores JSON as a string
    if isinstance(state, str):
        try:
            return json_lib.loads(state)
        except Exception:
            return {"status": "idle"}
    return state

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

@api_router.get("/unassigned")
def get_unassigned_issues(request: Request, db: Session = Depends(get_db)):
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key:
        raise HTTPException(status_code=400, detail="project_key is required")
    from models import Project
    project = db.query(Project).filter(Project.key == project_key).first()
    if not project:
        print(f"[DEBUG] /api/unassigned: Project '{project_key}' NOT FOUND in DB.")
        raise HTTPException(status_code=404, detail=f"Project {project_key} not found")
    print(f"[DEBUG] /api/unassigned: Found project '{project_key}' in DB. Fetching Jira issues...")

    """Fetch ALL unassigned issues from the configured Jira project (paginated)."""
    if not jira_client.connect(db, project_key):
        raise HTTPException(status_code=503, detail="Jira client not configured or connection failed")
    
    try:
        # Fetch leave label for filtering
        from models import AdvancedSettings
        adv_row = db.query(AdvancedSettings).filter(AdvancedSettings.project_key == project_key).first()
        leave_label = adv_row.leave_label if (adv_row and adv_row.leave_label) else ""
        
        # Prepare labels filter for JQL
        labels_list = [l.strip() for l in leave_label.split(',') if l.strip()]
        if labels_list:
            # We want: (labels is EMPTY OR (NOT labels IN ("izin", "leave")))
            # This ensures we get all non-leave-labeled issues (including those with NO labels)
            labels_query = " AND (labels is EMPTY OR NOT labels IN (" + ", ".join([f'"{l}"' for l in labels_list]) + "))"
        else:
            labels_query = ""

        jql = f'project = {jira_client.project_key} AND assignee is EMPTY AND statusCategory != Done{labels_query} ORDER BY priority DESC'
        result = []
        fields = "summary,issuetype,priority,labels"
        
        issues = jira_client._fetch_all_issues_paginated(jql, fields=fields)
        
        for issue in issues:
            # Jira Server 9.4 safety: issue.fields.priority might be None or a string in some weird cases
            p_name = "Medium"
            if hasattr(issue.fields, "priority") and issue.fields.priority:
                if hasattr(issue.fields.priority, "name"):
                    p_name = issue.fields.priority.name
                elif isinstance(issue.fields.priority, str):
                    p_name = issue.fields.priority
            
            result.append({
                "key": issue.key,
                "summary": issue.fields.summary or "",
                "type": issue.fields.issuetype.name if hasattr(issue.fields, "issuetype") and issue.fields.issuetype else "Task",
                "priority": p_name,
                "labels": list(issue.fields.labels) if hasattr(issue.fields, "labels") and issue.fields.labels else [],
            })

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch unassigned issues: {str(e)}")


@api_router.get("/jira/labels")
def get_project_labels(request: Request, db: Session = Depends(get_db)):
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key or not db.query(Project).filter(Project.key == project_key).first():
        raise HTTPException(status_code=404, detail="Project not found")
        
    if not jira_client.connect(db, project_key):
        raise HTTPException(status_code=503, detail="Jira client not configured")
    try:
        return jira_client.get_labels()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch labels: {str(e)}")

@api_router.get("/jira/priorities")
def get_priorities(request: Request, db: Session = Depends(get_db)):
    """Fetch all priorities from Jira and assign evenly-spaced urgency scores (100 → 10)."""
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key or not db.query(Project).filter(Project.key == project_key).first():
        raise HTTPException(status_code=404, detail="Project not found")

    if not jira_client.connect(db, project_key):
        raise HTTPException(status_code=503, detail="Jira client not configured")
    try:
        priorities = jira_client.get_priorities()
        n = len(priorities)
        for i, p in enumerate(priorities):
            # First = 100, last = 10, evenly spaced regardless of count
            p["urgency_score"] = round(100 - (90 * i / max(n - 1, 1)), 1)
        return priorities
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch priorities: {str(e)}")

@api_router.get("/jira/users")
def get_project_users(request: Request, db: Session = Depends(get_db)):
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key or not db.query(Project).filter(Project.key == project_key).first():
        raise HTTPException(status_code=404, detail="Project not found")

    if not jira_client.connect(db, project_key):
        raise HTTPException(status_code=503, detail="Jira client not configured")
    try:
        users = jira_client.get_users()
        result = []
        for u in users:
            avatar = ''
            if hasattr(u, 'avatarUrls'):
                # Jira Python library returns a PropertyHolder, not a dict
                try:
                    avatar = getattr(u.avatarUrls, '48x48', '')
                except:
                    pass
            # Server 9.4 uses 'key' (immutable) then 'name' (username); Cloud uses 'accountId'
            uid = (
                getattr(u, 'accountId', None) or  # Jira Cloud
                getattr(u, 'key', None) or         # Jira Server 9.x (immutable user key)
                getattr(u, 'name', None) or        # Jira Server (login name, can change)
                ''
            )
            result.append({
                "account_id": uid,
                "display_name": getattr(u, 'displayName', 'Unknown User'),
                "avatar_url": avatar
            })
        result.sort(key=lambda x: x["display_name"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch users: {str(e)}")

@api_router.post("/recommendations", response_model=RecommendationResponse)
async def get_recommendations(req: TaskRecommendationRequest, request: Request, db: Session = Depends(get_db)):
    try:
        project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
        project = db.query(Project).filter(Project.key == project_key).first() if project_key else None
        if not project:
            raise HTTPException(status_code=404, detail=f"Project {project_key} not found")

        if not jira_client.connect(db, project_key):
            raise HTTPException(status_code=503, detail="Jira client not configured or connection failed")
            
        # Determine which weights to use
        from models import STRATEGY_PRESETS
        
        # If a strategy was explicitly requested, use it. Otherwise, fallback to DB setting.
        strategy_key = req.strategy
        if not strategy_key:
            strategy_key = project.active_strategy

        safe_strategy = strategy_key if strategy_key else "BALANCED"
        
        if safe_strategy.upper() == "PERSONALIZED":
            # Load custom weights from AdvancedSettings
            adv_row_for_weights = db.query(AdvancedSettings).filter(AdvancedSettings.project_key == project_key).first()
            if adv_row_for_weights:
                weights = ScoringWeights(
                    expertise=adv_row_for_weights.w_expertise,
                    workload=adv_row_for_weights.w_workload,
                    success_rate=adv_row_for_weights.w_success_rate,
                    category_experience=adv_row_for_weights.w_category_experience,
                    recent_activity=adv_row_for_weights.w_recent_activity,
                )
            else:
                weights = STRATEGY_PRESETS["BALANCED"]
        else:
            weights = STRATEGY_PRESETS.get(safe_strategy.upper(), STRATEGY_PRESETS["BALANCED"])
                
        # Fetch Phase 1 Constraints Data from DB
        from models import TeamRule, UserTeam
        team_rules = db.query(TeamRule).filter(TeamRule.project_key == project_key).all()
        override_labels = [l.strip() for l in project.override_labels.split(",")] if project.override_labels else ["documentation", "general", "minor-bug", "typo"]
            
        import time
        t0 = time.time()
        
        # Fetch the issue that needs assignment
        issue = jira_client.get_issue(req.issue_key)
        if not issue:
            raise HTTPException(status_code=404, detail="Issue not found")
        print(f"[DEBUG] Fetched issue {req.issue_key} in {time.time()-t0:.1f}s")
            
        issue_data = {
            "issue_type": issue.fields.issuetype.name if hasattr(issue.fields, "issuetype") else "",
            "labels": issue.fields.labels if hasattr(issue.fields, "labels") else [],
            "components": [c.name for c in issue.fields.components] if hasattr(issue.fields, "components") else [],
            "summary": issue.fields.summary if hasattr(issue.fields, "summary") else "",
            "description": issue.fields.description if hasattr(issue.fields, "description") else "",
            "priority": issue.fields.priority.name if hasattr(issue.fields, "priority") and issue.fields.priority else "Medium",
        }
        
        # Fetch assignable users
        users = jira_client.get_users()
        print(f"[DEBUG] Fetched {len(users)} users in {time.time()-t0:.1f}s")
        
        scoring_engine = ScoringEngine(weights=weights)

        # Load advanced settings from DB (or use defaults)
        adv_row = db.query(AdvancedSettings).filter(AdvancedSettings.project_key == project_key).first()
        adv_settings = {
            "expertise_nlp_weight": adv_row.expertise_nlp_weight if adv_row else 0.60,
            "expertise_label_weight": adv_row.expertise_label_weight if adv_row else 0.40,
            "workload_task_saturation": adv_row.workload_task_saturation if adv_row else 10,
            "workload_sp_saturation": adv_row.workload_sp_saturation if adv_row else 20,
            "success_deadline_weight": adv_row.success_deadline_weight if adv_row else 0.70,
            "success_reopen_weight": adv_row.success_reopen_weight if adv_row else 0.30,
            "activity_window_days": adv_row.activity_window_days if adv_row else 14,
            "activity_neutral_score": adv_row.activity_neutral_score if adv_row else 50,
            "leave_label": adv_row.leave_label if adv_row else "izin",
            "leave_threshold_days": adv_row.leave_threshold_days if adv_row else 15,
            "leave_window_days": adv_row.leave_window_days if adv_row else 30,
            "leave_exclude_weekends": adv_row.leave_exclude_weekends if adv_row else True,
        }
        scoring_engine.set_advanced_settings(adv_settings)
        # Detect Task Type & Get Dynamic Weights once for this issue
        task_type = scoring_engine.detect_task_type(issue_data, override_labels)
        final_weights = scoring_engine.get_dynamic_weights(task_type, weights)
        # Update engine weights to the dynamic ones so they are used for all users
        scoring_engine.weights = final_weights

        recommendations = []
        
        # 1. Fetch batched open workload ONCE for all users (INSTANCE-WIDE)
        t_workload = time.time()
        from workload_cache import workload_cache
        
        cached_workloads = workload_cache.get()
        if cached_workloads is not None:
            print("[DEBUG] Workload cache HIT. Using cached data.")
            open_workloads = cached_workloads
        else:
            print("[DEBUG] Workload cache MISS. Fetching ALL open issues across Jira (slim mode) for global workload calculation...")
            all_open_raw = jira_client.get_instance_wide_workload_summary()
            open_workloads = {} # user_id -> list of open issues
            for o in all_open_raw:
                sp = 0
                if hasattr(o.fields, "customfield_10016") and o.fields.customfield_10016:
                    try:
                        sp = float(o.fields.customfield_10016)
                    except (ValueError, TypeError):
                        sp = 0
                
                assignee_id = jira_client.get_user_id(o.fields.assignee) if hasattr(o.fields, "assignee") and o.fields.assignee else None
                if assignee_id:
                    if assignee_id not in open_workloads:
                        open_workloads[assignee_id] = []
                    open_workloads[assignee_id].append({
                        "story_points": sp,
                        "issue_key": o.key
                    })
            workload_cache.set(open_workloads)
            print(f"[DEBUG] Batched workload fetched and parsed in {time.time()-t_workload:.1f}s")
        
        # 1.5 Calculate Team-wide workload boundaries (for Relative Scaling)
        candidate_loads = []
        for u_cand in users:
            uid_cand = jira_client.get_user_id(u_cand)
            u_cand_tasks = open_workloads.get(uid_cand, [])
            u_cand_load = len(u_cand_tasks) + (sum([t.get("story_points", 0) for t in u_cand_tasks]) * 0.5)
            candidate_loads.append(u_cand_load)
            
        max_team_load = max(candidate_loads) if candidate_loads else 0.0
        min_team_load = min(candidate_loads) if candidate_loads else 0.0
        print(f"[DEBUG] Team workload boundaries: Min={min_team_load}, Max={max_team_load}")

        # PRE-CALCULATE NEW ISSUE EMBEDDING ONCE
        # [POSTGRESQL MIGRATION POINT]
        # Native pgvector cosine_distance is executed at the database level when _USE_PG is True.
        # This prevents pulling 30,000+ massive arrays into Python memory.
        _USE_PG = os.environ.get("DATABASE_URL", "").startswith("postgresql")
        new_text = f"{issue_data.get('summary', '')} {issue_data.get('description', '')}"
        new_embedding = get_text_embedding(new_text) if new_text.strip() else None
        new_embedding_list = new_embedding.tolist() if new_embedding is not None else None

        for user in users:
            try:
                t1 = time.time()
                account_id = getattr(user, "accountId", None) or getattr(user, "key", None) or getattr(user, "name", "unknown")
                display_name = getattr(user, "displayName", "unknown")
                
                # Fetch user teams: Global + Project overrides
                user_teams_all = db.query(UserTeam).filter(UserTeam.user_account_id == account_id).all()
                global_team = next((ut.team_name for ut in user_teams_all if ut.project_key == "GLOBAL"), None)
                project_team = next((ut.team_name for ut in user_teams_all if ut.project_key == project_key), None)
                
                # Resolving team name
                final_team = project_team if project_team else global_team
                user_teams = [final_team] if final_team else []
                
                # Fetch real historical from Local DB Cache
                cached_history = cached_history = db.query(TaskCache).filter(
                    TaskCache.assignee_id == account_id, 
                    TaskCache.project_key == project_key
                ).options(defer(TaskCache.embedding)).all()
                
                # 2. Execute Native pgvector Similarity Search (Top 5 matches)
                top_semantic_matches = None
                if _USE_PG and new_embedding_list is not None:
                    top_k_records = db.query(
                        TaskCache.resolved_at,
                        TaskCache.embedding.cosine_distance(new_embedding_list).label("distance")
                    ).filter(
                        TaskCache.assignee_id == account_id,
                        TaskCache.project_key == project_key,
                        TaskCache.embedding.is_not(None)
                    ).order_by(
                        TaskCache.embedding.cosine_distance(new_embedding_list)
                    ).limit(5).all()
                    
                    top_semantic_matches = []
                    for r in top_k_records:
                        # pgvector distance to similarity: similarity = 1.0 - distance
                        top_semantic_matches.append({
                            "resolved_at": r.resolved_at,
                            "similarity": 1.0 - float(r.distance)
                        })
                open_issues = open_workloads.get(account_id, [])
                
                print(f"[DEBUG]   {display_name}: fetched {len(cached_history)} cached history + {len(open_issues)} open in {time.time()-t1:.1f}s")
                
                # --- New: Read from Developer Activity Cache ---
                cached_act = db.query(DeveloperActivity).filter(
                    DeveloperActivity.project_key == project_key,
                    DeveloperActivity.account_id == account_id
                ).first()
                
                if cached_act:
                    activity_data = {
                        "dates": cached_act.active_dates or [],
                        "leave_dates": cached_act.leave_dates or [],
                        "has_assignments": cached_act.has_assignments or False
                    }
                else:
                    # Fallback: empty activity if not yet synced
                    activity_data = {"dates": [], "has_assignments": False, "leave_dates": []}
                
                # activity_data = jira_client.get_user_ticket_activity(account_id, window_days=window_days, leave_config=leave_config)
                
                # Convert DB objects to dicts for the scoring engine
                history = []
                for h in cached_history:
                    history.append({
                        "issue_type": h.issue_type,
                        "labels": h.labels or [],
                        "components": [],
                        "summary": h.summary or "",
                        "description": h.description or "",
                        "status_category": h.status_category,
                        "completed_on_time": h.completed_on_time,
                        "reopened": (h.reopen_count > 0) if h.reopen_count is not None else False,
                        "reopen_count": h.reopen_count or 0,
                        "resolutiondate": h.resolved_at.isoformat() if h.resolved_at else None,
                        "embedding": h.embedding
                    })
                
                t2 = time.time()
                rec = scoring_engine.get_recommendation(
                    user_id=account_id,
                    user_name=display_name,
                    new_issue=issue_data,
                    user_history=history,
                    user_open_tasks=open_issues,
                    user_team_names=user_teams,
                    team_rules=team_rules,
                    override_labels=override_labels,
                    worklog_dates=activity_data.get("dates", []),
                    leave_dates=activity_data.get("leave_dates", []),
                    has_assignments=activity_data.get("has_assignments", False),
                    top_semantic_matches=top_semantic_matches,
                    lang=req.lang,
                    max_team_load=max_team_load,
                    min_team_load=min_team_load
                )
                print(f"[DEBUG]   {display_name}: scored in {time.time()-t2:.1f}s (total: {rec.total_score})")
                recommendations.append(rec)
            except Exception as e:
                import traceback
                print(f"Skipping user {getattr(user, 'displayName', 'unknown')} due to error: {e}")
                traceback.print_exc()
                
        # Sort recommendations by highest total score descending
        recommendations.sort(key=lambda x: x.total_score, reverse=True)
        
        print(f"[DEBUG] Total recommendations time: {time.time()-t0:.1f}s, {len(recommendations)} results")
        
        return RecommendationResponse(
            issue_key=req.issue_key,
            recommendations=recommendations,
            applied_weights=final_weights,
            task_type=task_type
        )
    except Exception as outer_e:
        import traceback
        raise HTTPException(status_code=500, detail=f"Recommendation Engine Crash: {str(outer_e)}\n{traceback.format_exc()}")


@api_router.post("/assign")
def assign_issue(req: AssignRequest, request: Request, db: Session = Depends(get_db)):
    """Assign a Jira issue to a user. Expects JSON body {issue_id, user_id}."""
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key or not db.query(Project).filter(Project.key == project_key).first():
        raise HTTPException(status_code=404, detail="Project not found")

    if not jira_client.connect(db, project_key):
        raise HTTPException(status_code=503, detail="Jira client not configured")
        
    success = jira_client.assign_issue(req.issue_id, req.user_id)
    if success:
        return {"status": "assigned", "issue_key": req.issue_id, "account_id": req.user_id}
    raise HTTPException(status_code=500, detail="Failed to assign issue")

@api_router.get("/scheduler/status")
def scheduler_status(request: Request, db: Session = Depends(get_db)):
    """Return the current state of the automated sync scheduler for a project."""
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key:
        raise HTTPException(status_code=400, detail="project_key is required")
        
    project = db.query(Project).filter(Project.key == project_key).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    status = get_scheduler_status(project_key)
    status["enabled"] = project.scheduler_enabled
    status["daily_sync_enabled"] = project.daily_sync_enabled
    status["weekly_sync_enabled"] = project.weekly_sync_enabled
    status["monthly_sync_enabled"] = project.monthly_sync_enabled
    return status

@api_router.get("/scheduler/global-status")
def global_scheduler_status(db: Session = Depends(get_db)):
    """Return a high-level summary of the scheduler across all projects.
    Used by the system Settings page which has no active project context.
    """
    all_projects = db.query(Project).all()
    enabled_projects = [p for p in all_projects if p.scheduler_enabled]

    all_jobs = []
    last_run = None
    for proj in all_projects:
        proj_status = get_scheduler_status(proj.key)
        active_jobs = {j["id"]: j for j in proj_status.get("jobs", [])}
        
        lr = proj_status.get("last_run")
        if lr and (last_run is None or lr.get("time", "") > last_run.get("time", "")):
            last_run = lr

        if proj.daily_sync_enabled:
            job_id = f"nightly_{proj.key}"
            active_job = active_jobs.get(job_id)
            all_jobs.append({
                "id": job_id, "project_key": proj.key, "freq": "nightly",
                "name": f"Nightly Incremental Sync ({proj.key})",
                "active": bool(active_job) and proj.scheduler_enabled,
                "next_run": active_job["next_run"] if active_job else None
            })
            
        if proj.weekly_sync_enabled:
            job_id = f"weekly_{proj.key}"
            active_job = active_jobs.get(job_id)
            all_jobs.append({
                "id": job_id, "project_key": proj.key, "freq": "weekly",
                "name": f"Weekly Reconciliation ({proj.key})",
                "active": bool(active_job) and proj.scheduler_enabled,
                "next_run": active_job["next_run"] if active_job else None
            })
            
        if proj.monthly_sync_enabled:
            job_id = f"monthly_{proj.key}"
            active_job = active_jobs.get(job_id)
            all_jobs.append({
                "id": job_id, "project_key": proj.key, "freq": "monthly",
                "name": f"Monthly Re-Embed ({proj.key})",
                "active": bool(active_job) and proj.scheduler_enabled,
                "next_run": active_job["next_run"] if active_job else None
            })

    return {
        "enabled": any(p.scheduler_enabled for p in all_projects),
        "enabled_project_count": len(enabled_projects),
        "total_project_count": len(all_projects),
        "jobs": all_jobs,
        "last_run": last_run
    }


@api_router.post("/scheduler/toggle-all")
def toggle_all_schedulers(enable: bool, db: Session = Depends(get_db)):
    """Enable or disable the automated sync scheduler for all projects globally."""
    projects = db.query(Project).all()
    from scheduler import sync_project_jobs
    for p in projects:
        p.scheduler_enabled = enable
        sync_project_jobs(db, p.key, enable)
    db.commit()
    return {"message": f"All schedulers {'enabled' if enable else 'disabled'} successfully"}


@api_router.post("/scheduler/toggle")
def toggle_scheduler(enable: bool, request: Request, db: Session = Depends(get_db)):
    """Enable or disable the automated sync scheduler for a project."""
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key:
        raise HTTPException(status_code=400, detail="project_key is required")

    project = db.query(Project).filter(Project.key == project_key).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.scheduler_enabled = enable
    db.commit()

    # Update APScheduler jobs
    from scheduler import sync_project_jobs, get_scheduler_status
    sync_project_jobs(db, project_key, enable)

    # Return full updated status so UI can refresh properly
    status = get_scheduler_status(project_key)
    status["enabled"] = enable
    return status


@api_router.post("/sync")
def sync_jira_history(request: Request, background_tasks: BackgroundTasks, full: bool = False, db: Session = Depends(get_db)):
    """Sync Jira issue history and precompute NLP embeddings (Legacy endpoint)."""
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    project = db.query(Project).filter(Project.key == project_key).first() if project_key else None
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    def background_sync_task(project_key: str, mode: str):
        from database import SessionLocal
        from sync_service import MigrationService
        from workload_cache import workload_cache
        bg_db = SessionLocal()
        try:
            svc = MigrationService(bg_db, project_key)
            svc.run(mode=mode)
            # Invalidate the cache when sync is finished so new recommendations use fresh data
            workload_cache.invalidate()
        except Exception as e:
            with open("crash_debug.txt", "a") as f:
                f.write(f"\n[CRITICAL] Sync error: {str(e)}\n")
        finally:
            bg_db.close()

    mode = "re-embed" if full else "incremental"
    background_tasks.add_task(background_sync_task, project_key, mode)
    return {
        "status": "running",
        "message": f"Sync started in mode {mode}",
        "project_key": project_key
    }

@api_router.get("/projects")
def get_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).all()
    print(f"[DEBUG] /api/projects: Found {len(projects)} projects in database.")
    # Mask API tokens
    return [{
        "key": p.key,
        "name": p.name,
        "server_url": p.server_url,
        "user_email": p.user_email,
        "active_strategy": p.active_strategy,
        "override_labels": p.override_labels,
        "last_sync_date": p.last_sync_date,
        "scheduler_enabled": p.scheduler_enabled,
        "daily_sync_enabled": p.daily_sync_enabled,
        "weekly_sync_enabled": p.weekly_sync_enabled,
        "monthly_sync_enabled": p.monthly_sync_enabled,
        "has_token": bool(p.api_token)
    } for p in projects]

@api_router.get("/projects/{key}")
def get_project(key: str, db: Session = Depends(get_db)):
    """Return a single project by its key, with the API token masked."""
    proj = db.query(Project).filter(Project.key == key).first()
    if not proj:
        raise HTTPException(status_code=404, detail=f"Project '{key}' not found")
    return {
        "key": proj.key,
        "name": proj.name,
        "server_url": proj.server_url or "",
        "user_email": proj.user_email or "",
        "active_strategy": proj.active_strategy or "BALANCED",
        "override_labels": proj.override_labels or "",
        "last_sync_date": proj.last_sync_date,
        "scheduler_enabled": proj.scheduler_enabled,
        "daily_sync_enabled": proj.daily_sync_enabled,
        "weekly_sync_enabled": proj.weekly_sync_enabled,
        "monthly_sync_enabled": proj.monthly_sync_enabled,
        "has_token": bool(proj.api_token)
    }

@api_router.post("/projects")
def create_project(data: ProjectSchema, db: Session = Depends(get_db)):
    if db.query(Project).filter(Project.key == data.key).first():
        raise HTTPException(status_code=400, detail="Project key already exists")
    
    new_proj = Project(
        key=data.key,
        name=data.name,
        server_url=data.server_url,
        user_email=data.user_email,
        active_strategy=data.active_strategy,
        override_labels=data.override_labels,
        scheduler_enabled=data.scheduler_enabled,
        daily_sync_enabled=data.daily_sync_enabled,
        weekly_sync_enabled=data.weekly_sync_enabled,
        monthly_sync_enabled=data.monthly_sync_enabled
    )
    
    if data.copy_credentials_from:
        ref_proj = db.query(Project).filter(Project.key == data.copy_credentials_from).first()
        if not ref_proj:
            raise HTTPException(status_code=400, detail="Reference project not found")
        new_proj.server_url = ref_proj.server_url
        new_proj.user_email = ref_proj.user_email
        new_proj.api_token = ref_proj.api_token
    elif data.api_token:
        new_proj.api_token = encrypt_token(data.api_token)
        
    db.add(new_proj)
    db.commit()
    
    # Initialize scheduler jobs if enabled (default is False in model)
    if new_proj.scheduler_enabled:
        from scheduler import sync_project_jobs
        sync_project_jobs(db, new_proj.key, True)
        
    return {"status": "success", "message": "Project created"}

@api_router.put("/projects/{key}")
def update_project(key: str, data: ProjectSchema, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.key == key).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    
    proj.name = data.name
    proj.server_url = data.server_url
    proj.user_email = data.user_email
    proj.active_strategy = data.active_strategy
    proj.override_labels = data.override_labels
    proj.scheduler_enabled = data.scheduler_enabled
    proj.daily_sync_enabled = data.daily_sync_enabled
    proj.weekly_sync_enabled = data.weekly_sync_enabled
    proj.monthly_sync_enabled = data.monthly_sync_enabled
    
    # Only update token if it's provided in the payload (not None)
    # data.api_token == "" means clear, data.api_token == "..." means new value
    if data.api_token is not None:
        if data.api_token == "":
            proj.api_token = None
        else:
            proj.api_token = encrypt_token(data.api_token)
        
    db.commit()
    
    # Update scheduler jobs base on toggle status
    from scheduler import sync_project_jobs
    sync_project_jobs(db, proj.key, proj.scheduler_enabled)
    
    return {"status": "success"}

@api_router.delete("/projects/{key}")
def delete_project(key: str, req: DeleteProjectRequest, db: Session = Depends(get_db), current_user: PortalUser = Depends(get_current_user)):
    proj = db.query(Project).filter(Project.key == key).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Security: Verify user's password before deletion
    if not verify_password(req.password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect password. Deletion aborted.")

    # Delete all associated data
    db.query(TaskCache).filter(TaskCache.project_key == key).delete()
    db.query(DeveloperActivity).filter(DeveloperActivity.project_key == key).delete()
    db.query(TeamRule).filter(TeamRule.project_key == key).delete()
    db.query(UserTeam).filter(UserTeam.project_key == key).delete()
    db.query(AdvancedSettings).filter(AdvancedSettings.project_key == key).delete()
    
    # Delete the project itself
    db.delete(proj)
    db.commit()
    
    # Remove scheduler jobs
    from scheduler import sync_project_jobs
    sync_project_jobs(db, key, False)
    
    return {"status": "success"}


@api_router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    # Legacy global settings only
    url = db.query(Setting).filter(Setting.key == "jira_url").first()
    email = db.query(Setting).filter(Setting.key == "jira_email").first()
    
    strategy = db.query(Setting).filter(Setting.key == "global_strategy").first()
    
    return {
        "server_url": url.value if url else "",
        "user_email": email.value if email else "",
        "has_token": db.query(Setting).filter(Setting.key == "jira_token").first() is not None,
        "active_strategy": strategy.value if strategy else "BALANCED",
        "project_key": "GLOBAL"
    }

@api_router.post("/settings")
def save_settings(settings: JiraSettingsUpdate, db: Session = Depends(get_db)):
    # Helper to insert or update
    def save_setting(key, value):
        db_item = db.query(Setting).filter(Setting.key == key).first()
        if db_item:
            db_item.value = str(value)
        else:
            db_item = Setting(key=key, value=str(value))
            db.add(db_item)
            
    save_setting("jira_url", settings.server_url)
    
    # Allow null email for Jira Server
    if settings.user_email is not None:
        save_setting("jira_email", settings.user_email)
    
    if settings.api_token:
        save_setting("jira_token", encrypt_token(settings.api_token))

    if settings.active_strategy:
        save_setting("global_strategy", settings.active_strategy)
        
    db.commit()
    return {"status": "success", "message": "Global Settings saved successfully."}

@api_router.get("/settings/teams")
def get_custom_teams(request: Request, db: Session = Depends(get_db)):
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key:
        raise HTTPException(status_code=400, detail="project_key is required")

    setting_key = f"created_teams_{project_key}"
    teams_setting = db.query(Setting).filter(Setting.key == setting_key).first()
    
    # Fallback to the old global setting if the specific one doesn't exist yet
    # This ensures backward compatibility until they save for the first time
    if not teams_setting:
         teams_setting = db.query(Setting).filter(Setting.key == "created_teams").first()

    if not teams_setting or not teams_setting.value:
        return []
        
    import json
    try:
        return json.loads(teams_setting.value)
    except:
        return [t.strip() for t in teams_setting.value.split(",") if t.strip()]

@api_router.post("/settings/teams")
def save_custom_teams(teams: List[str], request: Request, db: Session = Depends(get_db)):
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key:
        raise HTTPException(status_code=400, detail="project_key is required")

    import json
    teams_json = json.dumps(list(set([t.strip() for t in teams if t.strip()])))
    setting_key = f"created_teams_{project_key}"
    
    teams_setting = db.query(Setting).filter(Setting.key == setting_key).first()
    if teams_setting:
        teams_setting.value = teams_json
    else:
        new_setting = Setting(key=setting_key, value=teams_json)
        db.add(new_setting)
    db.commit()
    return {"status": "success"}

# --- Database Management Endpoints for Constraints ---

class TeamRuleCreate(BaseModel):
    match_type: str
    match_value: str
    allowed_team: str
    
@api_router.get("/settings/team-rules")
def get_team_rules(request: Request, db: Session = Depends(get_db)):
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key or not db.query(Project).filter(Project.key == project_key).first():
        raise HTTPException(status_code=404, detail="Project not found")

    from models import TeamRule
    rules = db.query(TeamRule).filter(TeamRule.project_key == project_key).all()
    return [{"id": r.id, "match_type": r.match_type, "match_value": r.match_value, "allowed_team": r.allowed_team} for r in rules]

@api_router.post("/settings/team-rules")
def save_team_rules(rules: List[TeamRuleCreate], request: Request, db: Session = Depends(get_db)):
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key or not db.query(Project).filter(Project.key == project_key).first():
        raise HTTPException(status_code=404, detail="Project not found")

    from models import TeamRule
    # Clear existing
    db.query(TeamRule).filter(TeamRule.project_key == project_key).delete()
    # Add new
    for r in rules:
        new_rule = TeamRule(project_key=project_key, match_type=r.match_type, match_value=r.match_value, allowed_team=r.allowed_team)
        db.add(new_rule)
    db.commit()
    return {"status": "success", "message": "Team rules saved successfully"}

@api_router.get("/settings/user-teams")
def get_user_teams(request: Request, db: Session = Depends(get_db)):
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key or not db.query(Project).filter(Project.key == project_key).first():
        raise HTTPException(status_code=404, detail="Project not found")

    from models import UserTeam
    user_teams = db.query(UserTeam).filter(UserTeam.project_key == project_key).all()
    # Also fetch all Jira users to show unassigned users
    try:
        jira_client.connect(db, project_key)
        jira_users = jira_client.get_users()
        # Server 9.4: 'key' is immutable primary ID; 'name' is login (can change); Cloud uses 'accountId'
        jira_user_map = {
            (getattr(u, 'accountId', None) or getattr(u, 'key', None) or getattr(u, 'name', 'unknown')): 
            getattr(u, "displayName", "Unknown User") 
            for u in jira_users
        }
    except Exception:
        jira_user_map = {}
        
    result = []
    # Map DB entries with names
    for ut in user_teams:
        result.append({
            "account_id": ut.user_account_id,
            "display_name": jira_user_map.get(ut.user_account_id, "Unknown User"),
            "team_name": ut.team_name
        })
    return result

@api_router.post("/settings/user-teams")
def save_user_teams(teams: List[Dict[str, str]], request: Request, db: Session = Depends(get_db)):
    """Expected format: [{'account_id': '123', 'team_name': 'Team A'}, ...]"""
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key or not db.query(Project).filter(Project.key == project_key).first():
        raise HTTPException(status_code=404, detail="Project not found")

    from models import UserTeam
    # Clear existing project overrides (but do not touch GLOBAL!)
    db.query(UserTeam).filter(UserTeam.project_key == project_key).delete()
    # Add new
    for t in teams:
        new_ut = UserTeam(user_account_id=t["account_id"], project_key=project_key, team_name=t["team_name"])
        db.add(new_ut)
    db.commit()
    return {"status": "success", "message": "User teams saved successfully"}

# --- Advanced Settings Endpoints ---

ADVANCED_DEFAULTS = AdvancedSettingsSchema()

@api_router.get("/settings/advanced")
def get_advanced_settings(request: Request, db: Session = Depends(get_db)):
    """Return current advanced settings or defaults if no row exists."""
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key:
        raise HTTPException(status_code=400, detail="project_key required")
    
    if project_key != "GLOBAL" and not db.query(Project).filter(Project.key == project_key).first():
        raise HTTPException(status_code=404, detail="Project not found")

    row = db.query(AdvancedSettings).filter(AdvancedSettings.project_key == project_key).first()
    if not row:
        return ADVANCED_DEFAULTS.model_dump()
    return {
        "w_expertise": row.w_expertise,
        "w_workload": row.w_workload,
        "w_success_rate": row.w_success_rate,
        "w_category_experience": row.w_category_experience,
        "w_recent_activity": row.w_recent_activity,
        "expertise_nlp_weight": row.expertise_nlp_weight,
        "expertise_label_weight": row.expertise_label_weight,
        "workload_task_saturation": row.workload_task_saturation,
        "workload_sp_saturation": row.workload_sp_saturation,
        "success_deadline_weight": row.success_deadline_weight,
        "success_reopen_weight": row.success_reopen_weight,
        "activity_window_days": row.activity_window_days,
        "activity_neutral_score": row.activity_neutral_score,
        "leave_label": row.leave_label,
        "leave_threshold_days": row.leave_threshold_days,
        "leave_window_days": row.leave_window_days,
        "leave_exclude_weekends": row.leave_exclude_weekends,
    }

@api_router.post("/settings/advanced")
def save_advanced_settings(data: AdvancedSettingsSchema, request: Request, db: Session = Depends(get_db)):
    """Upsert the single advanced settings row for the active project."""
    project_key = request.headers.get("x-project-key") or request.query_params.get("project_key")
    if not project_key:
        raise HTTPException(status_code=400, detail="project_key required")
    
    if project_key != "GLOBAL" and not db.query(Project).filter(Project.key == project_key).first():
        raise HTTPException(status_code=404, detail="Project not found")

    row = db.query(AdvancedSettings).filter(AdvancedSettings.project_key == project_key).first()
    if not row:
        row = AdvancedSettings(project_key=project_key)
        db.add(row)
    row.w_expertise = data.w_expertise
    row.w_workload = data.w_workload
    row.w_success_rate = data.w_success_rate
    row.w_category_experience = data.w_category_experience
    row.w_recent_activity = data.w_recent_activity
    row.expertise_nlp_weight = data.expertise_nlp_weight
    row.expertise_label_weight = data.expertise_label_weight
    row.workload_task_saturation = data.workload_task_saturation
    row.workload_sp_saturation = data.workload_sp_saturation
    row.success_deadline_weight = data.success_deadline_weight
    row.success_reopen_weight = data.success_reopen_weight
    row.activity_window_days = data.activity_window_days
    row.activity_neutral_score = data.activity_neutral_score
    row.leave_label = data.leave_label
    row.leave_threshold_days = data.leave_threshold_days
    row.leave_window_days = data.leave_window_days
    row.leave_exclude_weekends = data.leave_exclude_weekends
    db.commit()
    return {"status": "success", "message": "Advanced settings saved successfully."}

app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
