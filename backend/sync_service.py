import logging
import time
import math
import os
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
from models import TaskCache, Project
from jira_client import client as jira_client
from nlp_utils import get_text_embedding

logger = logging.getLogger(__name__)

def _debug_log(msg):
    """Append a timestamped message to migration_debug.log."""
    try:
        with open("migration_debug.log", "a") as f:
            f.write(f"[{datetime.now().isoformat()}] {msg}\n")
    except Exception:
        pass

class MigrationService:
    def __init__(self, db_session: Session, project_key: str):
        self.db = db_session
        self.project_key = project_key
        self.batch_size = 50

    def _get_project(self) -> Project:
        return self.db.query(Project).filter(Project.key == self.project_key).first()

    def _update_state(self, state_dict: dict):
        """Persist sync_progress changes."""
        import json
        project = self._get_project()
        if not project:
            return
        current_state = {}
        if project.sync_progress:
            if isinstance(project.sync_progress, str):
                try:
                    current_state = json.loads(project.sync_progress)
                except Exception:
                    current_state = {}
            else:
                current_state = dict(project.sync_progress)
        
        current_state.update(state_dict)
        
        new_state_json = json.dumps(current_state)
        sync_type_val = state_dict.get("mode", project.sync_type)
        self.db.execute(
            text("UPDATE projects SET sync_progress = :state, sync_type = :stype WHERE key = :key"),
            {"state": new_state_json, "stype": sync_type_val, "key": self.project_key}
        )
        self.db.commit()
        _debug_log(f"STATE UPDATE: {current_state}")

    def set_error(self, message: str):
        self._update_state({
            "status": "error",
            "error_msg": message,
            "eta": None
        })
        logger.error(f"[MIGRATION] [{self.project_key}] ERROR: {message}")

    def run(self, mode="re-embed"):
        """Run the sync operation."""
        _debug_log(f"=== RUN STARTED for {self.project_key}, mode={mode} ===")
        
        project = self._get_project()
        if not project:
            return

        if not jira_client.connect(self.db, self.project_key):
            self.set_error("Jira connection failed.")
            return

        self._update_state({
            "status": "fetching_jira", 
            "mode": mode, 
            "started_at": datetime.now().isoformat(),
            "total": 0,
            "current": 0,
            "eta": "Calculating..."
        })

        if mode == "reconcile":
            self.run_reconcile()
            return

        # re-embed or incremental
        last_sync = project.last_sync_date
        total_issues = 0
        
        try:
            if mode == "re-embed" or not last_sync:
                jql = f'project = "{self.project_key}" AND assignee is not EMPTY'
            else:
                since_str = last_sync[:10]
                jql = f'project = "{self.project_key}" AND assignee is not EMPTY AND updated >= "{since_str}"'
            
            total_issues = jira_client.get_issue_count(jql)
        except Exception as e:
            self.set_error(f"Failed to count issues: {e}")
            return

        if total_issues == 0:
            project.last_sync_date = datetime.now().isoformat()
            self._update_state({"status": "completed", "total": 0, "current": 0, "eta": None})
            self.db.commit()
            return

        self._update_state({"total": total_issues, "current": 0})
        
        if mode == "re-embed":
            self.db.query(TaskCache).filter(TaskCache.project_key == self.project_key).delete()
            self.db.commit()

        self._process_batches(mode, total_issues)

    def run_reconcile(self):
        try:
            self._update_state({"status": "fetching_jira", "current": 0, "total": 1, "eta": "Calculating..."})
            db_tasks = self.db.query(TaskCache.issue_key, TaskCache.updated_at).filter(TaskCache.project_key == self.project_key).all()
            db_task_dict = {t.issue_key: t.updated_at for t in db_tasks}
            
            jira_metadata = jira_client.get_all_issue_metadata()
            jira_task_dict = {}
            for issue in jira_metadata:
                updated_iso = getattr(issue.fields, "updated", None)
                updated_dt = None
                if updated_iso:
                    try:
                        updated_iso = updated_iso.replace('Z', '+00:00').replace('.000', '').replace('+0000', '+00:00')
                        updated_dt = datetime.fromisoformat(updated_iso)
                    except:
                        pass
                jira_task_dict[issue.key] = updated_dt
                
            to_delete = [key for key in db_task_dict if key not in jira_task_dict]
            if to_delete:
                self.db.query(TaskCache).filter(TaskCache.issue_key.in_(to_delete)).delete(synchronize_session=False)
                self.db.commit()
                
            to_update = []
            for j_key, j_dt in jira_task_dict.items():
                d_dt = db_task_dict.get(j_key)
                if j_key not in db_task_dict or (j_dt and d_dt and j_dt > d_dt) or (j_dt and not d_dt):
                    to_update.append(j_key)
            
            self._update_state({"status": "processing_embeddings", "total": len(to_update), "current": 0, "eta": "Calculating..."})
            
            start_time = time.time()
            for i, key in enumerate(to_update):
                issue = jira_client.get_issue(key)
                if issue:
                    self._process_single_issue(issue)
                if i % 5 == 0:
                    self.db.commit()
                    self._update_state({"current": i, "eta": self._calculate_eta(start_time, i, len(to_update))})
            
            self.db.commit()
            
            # --- New: Sync Developer Activity Cache ---
            try:
                self._sync_developer_activity()
            except Exception as ea:
                logger.warning(f"Developer activity sync failed: {ea}")

            project = self._get_project()
            project.last_sync_date = datetime.now().isoformat()
            self.db.commit()
            
            self._update_state({"status": "completed", "current": len(to_update), "eta": None})
                
        except Exception as e:
            self.set_error(f"Reconciliation failed: {str(e)}")

    def _process_batches(self, mode, total):
        project = self._get_project()
        current = 0
        start_time = time.time()
        
        try:
            if mode == "re-embed" or not project.last_sync_date:
                issues = jira_client.get_all_historical_issues()
            else:
                last_sync = project.last_sync_date
                since_str = last_sync[:10]
                issues = jira_client.get_issues_updated_since(since_str)
                
            self._update_state({"status": "processing_embeddings", "eta": "Calculating..."})
            
            for issue in issues:
                try:
                    self._process_single_issue(issue)
                    current += 1
                    
                    if current % 100 == 0 or current == len(issues):
                        self.db.commit()
                        self._update_state({
                            "current": current,
                            "eta": self._calculate_eta(start_time, current, total)
                        })
                        # API Safety: Add 200ms delay between batches to prevent Jira Cloud rate-limiting at 30k scale.
                        time.sleep(0.2)
                except Exception as e:
                    logger.warning(f"Failed to process issue {issue.key}: {e}")
                    
        except Exception as e:
            self.set_error(f"Batch processing failed: {str(e)}")
            raise e

        # Finished looping
        # --- New: Sync Developer Activity Cache ---
        try:
            self._sync_developer_activity()
        except Exception as ea:
            logger.warning(f"Developer activity sync failed: {ea}")
            
        project = self._get_project()
        project.last_sync_date = datetime.now().isoformat()
        self.db.commit()
        
        self._update_state({
            "status": "completed",
            "total": total,
            "current": total,
            "eta": None
        })
        
        _debug_log(f"MIGRATION COMPLETED. Total processed: {current}")

    def _calculate_eta(self, start_time, current, total):
        elapsed = time.time() - start_time
        if current > 0:
            rate = current / elapsed
            remaining = total - current
            eta_secs = remaining / rate if rate > 0 else 0
            return f"{math.ceil(eta_secs / 60)} mins" if eta_secs > 60 else f"{math.ceil(eta_secs)} secs"
        return "Calculating..."

    def _process_single_issue(self, issue):
        assignee_id = jira_client.get_user_id(issue.fields.assignee) if hasattr(issue.fields, "assignee") and issue.fields.assignee else None
        if not assignee_id:
            return

        summary = issue.fields.summary or ""
        desc = issue.fields.description or ""
        issue_type = issue.fields.issuetype.name if hasattr(issue.fields, "issuetype") and issue.fields.issuetype else "Task"
        priority = issue.fields.priority.name if hasattr(issue.fields, "priority") and issue.fields.priority else "Medium"
        labels = list(issue.fields.labels) if hasattr(issue.fields, "labels") and issue.fields.labels else []
        status_category = issue.fields.status.statusCategory.name if hasattr(issue.fields, "status") and hasattr(issue.fields.status, "statusCategory") else "Done"

        resolved_dt = None
        if hasattr(issue.fields, "resolutiondate") and issue.fields.resolutiondate:
            try:
                iso = issue.fields.resolutiondate.replace('Z', '+00:00').replace('.000', '').replace('+0000', '+00:00')
                resolved_dt = datetime.fromisoformat(iso)
            except Exception:
                pass

        updated_dt = None
        if hasattr(issue.fields, "updated") and issue.fields.updated:
            try:
                iso = issue.fields.updated.replace('Z', '+00:00').replace('.000', '').replace('+0000', '+00:00')
                updated_dt = datetime.fromisoformat(iso)
            except Exception:
                pass

        story_points = 0.0
        if hasattr(issue.fields, "customfield_10016") and issue.fields.customfield_10016:
            try:
                story_points = float(issue.fields.customfield_10016)
            except (ValueError, TypeError):
                pass

        # --- New: Reliability Calculations ---
        
        # 1. Reopen Detection (Changelog analysis)
        reopen_count = 0
        if hasattr(issue, "changelog") and issue.changelog:
            for history in issue.changelog.histories:
                for item in history.items:
                    if item.field == "status":
                        # We use 'toString' (to) and 'fromString' (from)
                        # We need to handle status categories. Since we don't have a status->category map here,
                        # we use a heuristic or common status names.
                        # For robustness, we check the 'from' value.
                        # Simple heuristic: if it was in a "Done" like state and moved to something else.
                        done_keywords = ["Done", "Resolved", "Closed", "Completed", "Finished"]
                        if any(kw in (item.fromString or "") for kw in done_keywords):
                            active_keywords = ["In Progress", "To Do", "Reopened", "Open"]
                            if any(kw in (item.toString or "") for kw in active_keywords):
                                reopen_count += 1

        # 2. Punctuality (Due Date vs Resolution)
        completed_on_time = True
        due_dt = None
        if hasattr(issue.fields, "duedate") and issue.fields.duedate:
            try:
                due_dt = datetime.fromisoformat(issue.fields.duedate[:10])
            except Exception:
                pass
        
        if not due_dt:
            # Fallback: Created + 30 days (User preference)
            try:
                created_iso = issue.fields.created.replace('Z', '+00:00').replace('.000', '').replace('+0000', '+00:00')
                created_dt = datetime.fromisoformat(created_iso)
                from datetime import timedelta
                due_dt = created_dt + timedelta(days=30)
            except Exception:
                pass
        
        if resolved_dt and due_dt:
            # Normalize to date for comparison if due_dt is date-only
            if resolved_dt.date() > due_dt.date():
                completed_on_time = False

        text_to_embed = f"{summary} {desc}"
        embedding = get_text_embedding(text_to_embed) if text_to_embed.strip() else None

        # Use bytes for SQLite, list for PostgreSQL
        if embedding is not None:
            if os.environ.get("DATABASE_URL", "").startswith("postgresql"):
                embedding_data = embedding.tolist()
            else:
                embedding_data = embedding.tobytes()
        else:
            embedding_data = None

        existing = self.db.query(TaskCache).filter(
            TaskCache.issue_key == issue.key,
            TaskCache.project_key == self.project_key
        ).first()
        
        if existing:
            existing.assignee_id = assignee_id
            existing.status_category = status_category
            existing.labels = labels
            existing.issue_type = issue_type
            existing.story_points = story_points
            existing.priority = priority
            existing.resolved_at = resolved_dt
            existing.updated_at = updated_dt
            existing.summary = summary
            existing.description = desc
            existing.embedding = embedding_data
            existing.completed_on_time = completed_on_time
            existing.reopen_count = reopen_count
        else:
            new_task = TaskCache(
                issue_key=issue.key,
                project_key=self.project_key,
                assignee_id=assignee_id,
                status_category=status_category,
                labels=labels,
                issue_type=issue_type,
                story_points=story_points,
                priority=priority,
                resolved_at=resolved_dt,
                updated_at=updated_dt,
                summary=summary,
                description=desc,
                embedding=embedding_data,
                completed_on_time=completed_on_time,
                reopen_count=reopen_count
            )
            self.db.add(new_task)

    def _sync_developer_activity(self):
        """Cache developer activity for assigning recommendations."""
        _debug_log(f"--- SYNCING DEVELOPER ACTIVITY for {self.project_key} ---")
        from models import AdvancedSettings, DeveloperActivity
        import json
        
        # 1. Fetch AdvancedSettings for windows
        adv = self.db.query(AdvancedSettings).filter(AdvancedSettings.project_key == self.project_key).first()
        activity_window = adv.activity_window_days if adv else 14
        leave_window = adv.leave_window_days if adv else 30
        leave_config = {
            "label": adv.leave_label if adv else "",
            "window_days": leave_window
        }
        
        try:
            # 2. Fetch all assignable users
            current_users = jira_client.get_users() 
            current_account_ids = [getattr(u, 'accountId', None) or getattr(u, 'key', None) or getattr(u, 'name', None) for u in current_users if u]
            current_account_ids = [aid for aid in current_account_ids if aid]
            
            _debug_log(f"Found {len(current_account_ids)} assignable users.")
            
            # 3. Cleanup: Delete records for users no longer in the project
            self.db.query(DeveloperActivity).filter(
                DeveloperActivity.project_key == self.project_key,
                DeveloperActivity.account_id.notin_(current_account_ids)
            ).delete(synchronize_session=False)
            self.db.commit()

            # 4. Pre-fetch leave issues once to avoid O(N) redundant Jira searches
            prefetched_leave_issues = []
            if leave_config.get("label"):
                _debug_log(f"Pre-fetching leave issues for labels: {leave_config['label']}")
                prefetched_leave_issues = jira_client.fetch_leave_issues(leave_config)
            
            # 5. Iterative Fetch Loop
            start_time = time.time()
            total_users = len(current_account_ids)
            self._update_state({"status": "syncing_activity", "total": total_users, "current": 0})
            
            for i, account_id in enumerate(current_account_ids):
                # Rate Limiting: 100ms delay between users
                if i > 0:
                    time.sleep(0.1)
                
                activity_data = jira_client.get_user_ticket_activity(
                    account_id, 
                    window_days=activity_window, 
                    leave_config=leave_config,
                    prefetched_leave_issues=prefetched_leave_issues
                )
                
                # Upsert
                existing = self.db.query(DeveloperActivity).filter(
                    DeveloperActivity.project_key == self.project_key,
                    DeveloperActivity.account_id == account_id
                ).first()
                
                if existing:
                    existing.active_dates = activity_data["dates"]
                    existing.leave_dates = activity_data["leave_dates"]
                    existing.has_assignments = activity_data["has_assignments"]
                    existing.updated_at = datetime.utcnow()
                else:
                    new_cache = DeveloperActivity(
                        project_key=self.project_key,
                        account_id=account_id,
                        active_dates=activity_data["dates"],
                        leave_dates=activity_data["leave_dates"],
                        has_assignments=activity_data["has_assignments"],
                        updated_at=datetime.utcnow()
                    )
                    self.db.add(new_cache)
                
                if (i + 1) % 5 == 0 or (i + 1) == total_users:
                    self.db.commit()
                    self._update_state({
                        "current": i + 1,
                        "eta": self._calculate_eta(start_time, i + 1, total_users)
                    })
            
            _debug_log(f"Activity sync completed for {total_users} users.")
        except Exception as e:
            _debug_log(f"ERROR in _sync_developer_activity: {e}")
            logger.error(f"Activity sync failed: {e}")
