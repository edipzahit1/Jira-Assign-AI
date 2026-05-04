"""
APScheduler-based automated sync scheduler.
Three-tier schedule:
  1. Nightly incremental sync at 02:00 (fast — only new/updated issues)
  2. Weekly full re-sync on Sundays at 03:00 (catches deletions/reassignments)
  3. Monthly deep re-sync on the 1st at 04:00 (full rebuild with fresh embeddings)
The scheduler lives inside the FastAPI process — no external cron needed.
"""
import logging
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import os

logger = logging.getLogger(__name__)

# Module-level scheduler instance
_scheduler: BackgroundScheduler | None = None
_last_run_results: dict[str, dict] = {}


def _run_sync(project_key: str, mode: str = "incremental"):
    """Execute a sync job for a specific project via MigrationService."""
    logger.info(f"[SCHEDULER] [{project_key}] Starting scheduled {mode.upper()} sync...")

    try:
        from database import SessionLocal
        from sync_service import MigrationService
        import json

        db = SessionLocal()
        try:
            svc = MigrationService(db, project_key)
            svc.run(mode=mode)
            
            # Fetch final result from project state for the status endpoints
            from models import Project
            project = db.query(Project).filter(Project.key == project_key).first()
            if project and project.sync_progress:
                try:
                    progress = project.sync_progress if isinstance(project.sync_progress, dict) else json.loads(project.sync_progress)
                    _last_run_results[project_key] = {
                        "status": progress.get("status", "completed"),
                        "mode": mode,
                        "fetched": progress.get("total", 0),
                        "processed": progress.get("current", 0),
                        "timestamp": datetime.now().isoformat(),
                    }
                except:
                    pass
            
            logger.info(f"[SCHEDULER] [{project_key}] {mode.upper()} sync completed.")
        finally:
            db.close()

    except Exception as e:
        _last_run_results[project_key] = {
            "status": "error",
            "message": str(e),
            "timestamp": datetime.now().isoformat(),
            "mode": mode,
        }
        logger.exception(f"[SCHEDULER] [{project_key}] Sync failed: {e}")

def sync_project_jobs(db, project_key: str, enabled: bool):
    """Add or remove APScheduler jobs for a specific project."""
    global _scheduler
    if not _scheduler or not _scheduler.running:
        return

    # Clear any existing jobs for this project to avoid duplicates
    for job_tier in ["nightly", "weekly", "monthly"]:
        job_id = f"{job_tier}_{project_key}"
        if _scheduler.get_job(job_id):
            _scheduler.remove_job(job_id)

    if not enabled:
        logger.info(f"[SCHEDULER] Jobs disabled/removed for project: {project_key}")
        return

    from models import Project
    project = db.query(Project).filter(Project.key == project_key).first()
    if not project:
        logger.error(f"[SCHEDULER] [{project_key}] Project not found in DB. Cannot schedule.")
        return

    # 1. Tier 1: Nightly incremental sync at 02:00
    if project.daily_sync_enabled:
        _scheduler.add_job(
            _run_sync,
            CronTrigger(hour=2, minute=0),
            id=f"nightly_{project_key}",
            name=f"Nightly Incremental Sync ({project_key})",
            args=[project_key],
            kwargs={"mode": "incremental"},
            replace_existing=True,
        )

    # 2. Tier 2: Weekly reconciliation on Sundays at 03:00
    if project.weekly_sync_enabled:
        _scheduler.add_job(
            _run_sync,
            CronTrigger(day_of_week="sun", hour=2, minute=0),
            id=f"weekly_{project_key}",
            name=f"Weekly Reconciliation ({project_key})",
            args=[project_key],
            kwargs={"mode": "reconcile"},
            replace_existing=True,
        )

    # 3. Tier 3: Monthly re-embed on the 1st at 04:00
    if project.monthly_sync_enabled:
        _scheduler.add_job(
            _run_sync,
            CronTrigger(day=1, hour=2, minute=0),
            id=f"monthly_{project_key}",
            name=f"Monthly Re-Embed ({project_key})",
            args=[project_key],
            kwargs={"mode": "re-embed"},
            replace_existing=True,
        )

    logger.info(f"[SCHEDULER] Jobs enabled/scheduled for project: {project_key} (Daily={project.daily_sync_enabled}, Weekly={project.weekly_sync_enabled}, Monthly={project.monthly_sync_enabled})")


def start_scheduler():
    """Start the background scheduler and load jobs for all enabled projects."""
    global _scheduler
    if _scheduler and _scheduler.running:
        logger.info("[SCHEDULER] Already running.")
        return

    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.start()
    
    from database import SessionLocal
    from models import Project
    
    db = SessionLocal()
    try:
        projects = db.query(Project).all()
        for p in projects:
            if p.scheduler_enabled:
                sync_project_jobs(db, p.key, True)
    finally:
        db.close()
    
    logger.info("[SCHEDULER] Background scheduler started and projects initialized.")


def stop_scheduler():
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=True)
        logger.info("[SCHEDULER] Stopped.")


def get_scheduler_status(project_key: str) -> dict:
    """Return current scheduler state for a specific project."""
    if not _scheduler or not _scheduler.running:
        return {"running": False, "jobs": [], "last_run": _last_run_results.get(project_key)}

    jobs = []
    project_job_prefix = f"_{project_key}"
    for job in _scheduler.get_jobs():
        if job.id.endswith(project_job_prefix):
            next_run = job.next_run_time
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run": next_run.isoformat() if next_run else None,
            })

    return {
        "running": True,
        "jobs": jobs,
        "last_run": _last_run_results.get(project_key),
    }
