"""
This is a wrapper around the official `jira` Python package.
It is responsible for all direct communication with the Jira REST API,
fetching issues, getting users, and securely getting the credentials from our local DB.
"""
from jira import JIRA
from sqlalchemy.orm import Session
from models import Setting
from crypto_utils import decrypt_token
import threading
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class JiraClient:
    def __init__(self):
        self._local = threading.local()
        # Fields needed for scoring engine including time tracking
        self.issue_fields = "summary,description,issuetype,priority,labels,components,status,assignee,created,resolutiondate,duedate,timeoriginalestimate,timespent,worklog,customfield_10016"

    @property
    def jira(self):
        return getattr(self._local, 'jira', None)

    @jira.setter
    def jira(self, value):
        self._local.jira = value

    @property
    def is_cloud(self):
        # Default to None (undetected). connect() MUST be called first to set this.
        # We do NOT default to True so we never silently use the wrong ID format.
        return getattr(self._local, 'is_cloud', None)

    @is_cloud.setter
    def is_cloud(self, value):
        self._local.is_cloud = value

    @property
    def project_key(self):
        return getattr(self._local, 'project_key', None)

    @project_key.setter
    def project_key(self, value):
        self._local.project_key = value

    def get_user_id(self, user):
        """Standardize user identification based on deployment type.
        
        - Cloud: accountId (UUID-style, mandatory, GDPR-compliant)
        - Server 9.x: key (immutable internal key) → name (login, can change)
        'name' can be renamed by admins; 'key' cannot. So 'key' is preferred on Server.
        """
        if not user:
            return None
        if self.is_cloud:
            return getattr(user, 'accountId', None)
        # Server 9.4: key is immutable, name can be renamed by admins
        return getattr(user, 'key', None) or getattr(user, 'name', None)

    def connect(self, db: Session, project_key: str = None):
        """Fetch credentials from the database and connect to Jira."""
        try:
            # If a project_key is provided, try to find project-specific overrides
            server_url = None
            email = None
            api_token = None
            
            if project_key:
                from models import Project
                project = db.query(Project).filter(Project.key == project_key).first()
                if project:
                    server_url = project.server_url
                    email = project.user_email
                    if project.api_token:
                        api_token = decrypt_token(project.api_token)

            # Fallback to global settings if not overridden
            # We treat empty strings as "not provided" to allow fallback
            url_setting = db.query(Setting).filter(Setting.key == "jira_url").first()
            email_setting = db.query(Setting).filter(Setting.key == "jira_email").first()
            token_setting = db.query(Setting).filter(Setting.key == "jira_token").first()
            
            if not server_url and url_setting:
                server_url = url_setting.value
            
            if not email and email_setting:
                email = email_setting.value
                
            if not api_token and token_setting:
                api_token = decrypt_token(token_setting.value)

            if not server_url or not api_token:
                logger.warning(f"Jira credentials not fully configured for project '{project_key}' (global or overridden).")
                self.jira = None
                return False

            self.project_key = project_key or (db.query(Setting).filter(Setting.key == "jira_project").first().value if db.query(Setting).filter(Setting.key == "jira_project").first() else "DEFAULT")

            logger.info(f"Connecting to Jira: URL={server_url}, Email={email if email else 'TOKEN_AUTH'}")

            if email:
                self.jira = JIRA(
                    options={'server': server_url},
                    basic_auth=(email, api_token)
                )
            else:
                self.jira = JIRA(
                    options={'server': server_url},
                    token_auth=api_token
                )
            # Detect Deployment Type (Cloud vs Server/DC)
            try:
                info = self.jira.server_info()
                deployment_type = info.get('deploymentType', '')
                if deployment_type == 'Cloud':
                    self.is_cloud = True
                elif deployment_type in ('Server', 'DataCenter'):
                    self.is_cloud = False
                else:
                    # Some Jira Server versions omit deploymentType entirely.
                    # Fall back to URL heuristic: atlassian.net → Cloud, else → Server
                    self.is_cloud = 'atlassian.net' in (server_url or '').lower()
                    logger.warning(f"deploymentType missing from server_info, using URL heuristic: is_cloud={self.is_cloud}")
                version = info.get('version', 'Unknown')
                logger.info(f"Connected to Jira {'Cloud' if self.is_cloud else 'Server/DC'} (Version: {version})")
            except Exception as e:
                # Last resort: URL heuristic rather than blindly defaulting to Cloud
                self.is_cloud = 'atlassian.net' in (server_url or '').lower()
                logger.warning(f"Could not read server_info, using URL heuristic: is_cloud={self.is_cloud}. Error: {e}")

            logger.info(f"Successfully connected to Jira dynamically for {self.project_key}.")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Jira dynamically for '{project_key}': {e}")
            self.jira = None
            return False

    def require_connection(self):
        if not self.jira or not self.project_key:
            raise Exception("Jira client is not connected. Please configure settings and try again.")

    def safe_search(self, jql: str, **kwargs):
        """
        Safely execute a Jira search, switching between enhanced_search_issues (Cloud POST)
        and search_issues (Server/DC GET) based on the environment to avoid deprecation errors.
        """
        self.require_connection()
        try:
            # For Jira Cloud, use the POST-based enhanced_search_issues heavily recommended
            if self.is_cloud and hasattr(self.jira, 'enhanced_search_issues'):
                return self.jira.enhanced_search_issues(jql, **kwargs)
            else:
                # Jira Server/DC uses standard GET endpoint
                return self.jira.search_issues(jql, **kwargs)
        except Exception as e:
            # If the specific method failed, attempt the fallback purely as a failsafe
            logger.warning(f"Initial safe_search failed for JQL '{jql}' (Cloud:{self.is_cloud}): {e}. Attempting fallback.")
            if self.is_cloud:
                return self.jira.search_issues(jql, **kwargs)
            else:
                if hasattr(self.jira, 'enhanced_search_issues'):
                    return self.jira.enhanced_search_issues(jql, **kwargs)
                raise

    def get_users(self):
        self.require_connection()
        try:
            users = self.jira.search_assignable_users_for_projects('', self.project_key)
            # Filter out inactive/deactivated users
            active_users = [u for u in users if getattr(u, 'active', True)]
            logger.info(f"Filtered {len(users)} users -> {len(active_users)} active")
            return active_users
        except Exception as e:
            logger.error(f"Error fetching users: {e}")
            return []

    def get_issue_count(self, jql: str) -> int:
        """Execute a zero-result search to quickly get total matching issues."""
        self.require_connection()
        try:
            logger.info(f"[JIRA COUNT] Executing JQL: {jql}")
            result = self.safe_search(jql, maxResults=0)
            
            count = getattr(result, 'total', 0)
            logger.info(f"[JIRA COUNT] Result: {count} issues for JQL: {jql}")
            return count
        except Exception as e:
            logger.error(f"Error fetching issue count for JQL '{jql}': {e}")
            raise  # Re-raise so caller can handle it

    def search_users_proxy(self, query: str):
        """Search Jira users across the project based on a query string."""
        self.require_connection()
        try:
            # Using find=query allows searching by email or display name in Jira Cloud
            users = self.jira.search_assignable_users_for_projects(query, self.project_key)
            active_users = [u for u in users if getattr(u, 'active', True)]
            return active_users
        except Exception as e:
            logger.error(f"Error proxying user search: {e}")
            return []

    def get_labels(self):
        """Fetch all unique labels used in the active project using safe pagination."""
        self.require_connection()
        try:
            jql = f'project = {self.project_key}'
            unique_labels = set()

            if self.is_cloud:
                # Cloud supports maxResults=False (auto-pagination via enhanced search)
                issues = self.safe_search(jql, maxResults=False, fields="labels")
                for issue in issues:
                    if hasattr(issue.fields, "labels") and issue.fields.labels:
                        for label in issue.fields.labels:
                            unique_labels.add(label)
            else:
                # Jira Server 9.x: maxResults=False is unreliable, use manual pagination
                start_at = 0
                batch_size = 500
                while True:
                    issues = self.safe_search(jql, startAt=start_at, maxResults=batch_size, fields="labels")
                    if not issues:
                        break
                    for issue in issues:
                        if hasattr(issue.fields, "labels") and issue.fields.labels:
                            for label in issue.fields.labels:
                                unique_labels.add(label)
                    if len(issues) < batch_size:
                        break
                    start_at += len(issues)

            return sorted(list(unique_labels))
        except Exception as e:
            logger.error(f"Error fetching labels: {e}")
            return []

    def get_historical_issues(self, user_account_id=None, limit=100):
        self.require_connection()
        jql = f'project = {self.project_key} AND statusCategory = Done'
        if user_account_id:
            jql += f' AND assignee = "{user_account_id}"'
        try:
            return self.safe_search(jql, maxResults=limit, fields=self.issue_fields)
        except Exception as e:
            logger.error(f"Error fetching historical issues: {e}")
            return []

    def _fetch_all_issues_paginated(self, jql: str, fields: str, batch_size: int = 100, expand: str = None):
        """Fetch all issues matching a JQL query using pagination and logging."""
        self.require_connection()
        all_issues = []
        
        try:
            total_expected = self.get_issue_count(jql)
            kwargs = {"fields": fields}
            if expand:
                kwargs["expand"] = expand
            
            if self.is_cloud:
                # Jira Cloud auto-pagination via enhanced_search_issues
                logger.info(f"Using Cloud Enhanced Search for {total_expected} issues. JQL: {jql}")
                all_issues = self.safe_search(jql, maxResults=False, **kwargs)
                return all_issues
            else:
                # Jira Server manual pagination
                logger.info(f"Using Server Manual Pagination for {total_expected} issues. JQL: {jql}")
                all_issues = []
                start_at = 0
                while True:
                    issues = self.safe_search(jql, startAt=start_at, maxResults=batch_size, **kwargs)
                    if not issues: break
                    all_issues.extend(issues)
                    if len(issues) < batch_size: break
                    start_at += len(issues)
                return all_issues
        except Exception as e:
            logger.error(f"Error fetching paginated issues for JQL '{jql}': {e}")
            return all_issues

    def get_all_historical_issues(self, limit=5000):
        """Fetch ALL assigned issues (ignoring Done status for testing) to cache."""
        jql = f'project = {self.project_key} AND assignee is not EMPTY'
        # We expand 'changelog' to calculate reopen counts
        return self._fetch_all_issues_paginated(jql, fields=self.issue_fields, expand="changelog")

    def get_issues_updated_since(self, since_date: str):
        """Fetch assigned issues updated since a given date (YYYY-MM-DD)."""
        jql = (f'project = {self.project_key} '
               f'AND assignee is not EMPTY '
               f'AND updated >= "{since_date}"')
        logger.info(f"[INCREMENTAL SYNC] JQL: {jql}")
        return self._fetch_all_issues_paginated(jql, fields=self.issue_fields, expand="changelog")

    def get_open_issues(self, user_account_id=None):
        self.require_connection()
        jql = f'project = {self.project_key} AND statusCategory != Done'
        if user_account_id:
            jql += f' AND assignee = "{user_account_id}"'
        try:
            return self.safe_search(jql, maxResults=100, fields=self.issue_fields)
        except Exception as e:
            logger.error(f"Error fetching open issues: {e}")
            return []

    def get_all_open_issues(self):
        """Fetch all open issues in the project for workload batching."""
        jql = f'project = {self.project_key} AND statusCategory != Done AND assignee is not EMPTY'
        return self._fetch_all_issues_paginated(jql, fields=self.issue_fields)

    def get_instance_wide_open_issues(self):
        """Fetch ALL open issues across the entire Jira instance for true global workload calculation."""
        jql = 'statusCategory != Done AND assignee is not EMPTY'
        logger.info(f"[GLOBAL WORKLOAD] Executing global JQL: {jql}")
        return self._fetch_all_issues_paginated(jql, fields=self.issue_fields)

    def get_instance_wide_workload_summary(self):
        """Fetch only assignee + story points for all open assigned issues (minimal payload).
        
        This is used for the workload score calculation in recommendations.
        By fetching only 2 fields instead of 16, we reduce payload size from
        ~100KB/issue to ~200 bytes/issue — critical for 30k+ ticket instances.
        """
        jql = 'statusCategory != Done AND assignee is not EMPTY'
        logger.info(f"[GLOBAL WORKLOAD SLIM] Fetching minimal fields: {jql}")
        return self._fetch_all_issues_paginated(jql, fields="assignee,customfield_10016")


    def get_all_issue_metadata(self):
        """Fetch only IDs and timestamps for reconciliation."""
        jql = f'project = {self.project_key} AND assignee is not EMPTY'
        return self._fetch_all_issues_paginated(jql, fields="updated")
            
    def get_issue(self, issue_key):
        self.require_connection()
        try:
            return self.jira.issue(issue_key, fields=self.issue_fields)
        except Exception as e:
            logger.error(f"Error fetching issue {issue_key}: {e}")
            return None

    def assign_issue(self, issue_key, user_account_id):
        self.require_connection()
        try:
            self.jira.assign_issue(issue_key, user_account_id)
            return True
        except Exception as e:
            logger.error(f"Error assigning issue {issue_key}: {e}")
            return False

    def get_priorities(self) -> list:
        """Returns all priorities in display order (highest urgency first) from Jira."""
        self.require_connection()
        try:
            priorities = self.jira.priorities()
            return [{"id": p.id, "name": p.name} for p in priorities]
        except Exception as e:
            logger.error(f"Error fetching priorities: {e}")
            return []

    def fetch_leave_issues(self, leave_config):
        """Fetch issues with specific leave labels for the project.
        This should be called ONCE per project sync to avoid redundant API calls.
        """
        self.require_connection()
        try:
            leave_label = leave_config.get("label", "")
            if not leave_label:
                return []
            
            leave_window = leave_config.get("window_days", 30)
            
            # Support multiple labels (comma-separated)
            labels_list = [l.strip() for l in leave_label.split(',') if l.strip()]
            if len(labels_list) > 1:
                quoted_labels = ", ".join([f'"{l}"' for l in labels_list])
                labels_query = f'labels IN ({quoted_labels})'
            elif labels_list:
                labels_query = f'labels = "{labels_list[0]}"'
            else:
                return []

            # We use expand="worklogs" to get the worklog entries for these issues
            leave_jql = f'project = {self.project_key} AND {labels_query} AND updated >= "-{leave_window}d"'
            # Fetch up to 200 leave tickets (unlikely to have more in 30 days window)
            return self.safe_search(leave_jql, maxResults=200, fields="summary,labels,worklog", expand="worklogs")
        except Exception as e:
            logger.warning(f"Error fetching leave issues for project {self.project_key}: {e}")
            return []

    def get_user_ticket_activity(self, account_id, window_days=14, leave_config=None, prefetched_leave_issues=None):
        """Fetch distinct active dates and leave dates.
        
        Returns: {"dates": ["YYYY-MM-DD", ...], "has_assignments": bool, "leave_dates": ["YYYY-MM-DD", ...]}
        - dates: distinct days on which the user commented or transitioned a ticket
        - has_assignments: True if user has any open task assignments
        - leave_dates: distinct days the user was on leave within leave_window_days
        """
        self.require_connection()
        from datetime import datetime, timedelta
        
        since_date = (datetime.now() - timedelta(days=window_days)).strftime("%Y-%m-%d")
        
        result = {"dates": [], "has_assignments": False, "leave_dates": []}
        
        # 1. Fetch Leave Dates if config is provided
        leave_dates_set = set()
        
        # Use prefetched issues if available, otherwise fetch them if config is present
        leave_issues = []
        if prefetched_leave_issues is not None:
            leave_issues = prefetched_leave_issues
        elif leave_config and leave_config.get("label"):
            leave_issues = self.fetch_leave_issues(leave_config)

        if leave_issues:
            try:
                leave_window = leave_config.get("window_days", 30) if leave_config else 30
                leave_since_date_obj = datetime.now() - timedelta(days=leave_window)
                leave_since_date = leave_since_date_obj.strftime("%Y-%m-%d")
                
                for issue in leave_issues:
                    # Check worklogs for THIS specific user (account_id)
                    all_worklogs = []
                    if hasattr(issue.fields, "worklog"):
                        all_worklogs = getattr(issue.fields.worklog, "worklogs", [])
                    
                    for wl in all_worklogs:
                        author = getattr(wl, 'author', None)
                        if author:
                            wl_user_id = self.get_user_id(author)
                            if wl_user_id == account_id:
                                # Extract date YYYY-MM-DD
                                day_str = wl.started[:10]
                                if day_str >= leave_since_date:
                                    leave_dates_set.add(day_str)
            except Exception as e:
                logger.warning(f"Error processing leave issues for {account_id}: {e}")
                
        result["leave_dates"] = sorted(list(leave_dates_set))
        
        # 2. Check if user has any open assignments
        try:
            assignment_jql = f'project = {self.project_key} AND assignee = "{account_id}" AND statusCategory != Done'
            assigned = self.safe_search(assignment_jql, maxResults=1, fields="summary")
            result["has_assignments"] = len(assigned) > 0
        except Exception as e:
            logger.warning(f"Error checking assignments for {account_id}: {e}")
        
        # 3. Fetch Activity Dates
        issues = []
        try:
            if self.is_cloud:
                # Try JQL with updatedBy (Jira Cloud only)
                jql_cloud = f'project = {self.project_key} AND updated >= "-{window_days}d" AND (assignee = "{account_id}" OR issue in updatedBy("{account_id}", "-{window_days}d"))'
                issues = self.safe_search(jql_cloud, maxResults=100, expand="changelog", fields="comment,updated")
            else:
                # Fallback for Jira Server
                jql_server = f'project = {self.project_key} AND updated >= "-{window_days}d" AND assignee = "{account_id}"'
                issues = self.safe_search(jql_server, maxResults=100, expand="changelog", fields="comment,updated")
        except Exception as e:
            logger.warning(f"Activity JQL failed for {account_id}. Error: {e}")
            return result
                
        active_dates = set()
        
        for issue in issues:
            # Check Comments
            if hasattr(issue.fields, 'comment') and hasattr(issue.fields.comment, 'comments'):
                for c in issue.fields.comment.comments:
                    author = getattr(c, 'author', None)
                    if author:
                        author_id = self.get_user_id(author)
                        if author_id == account_id:
                            created_date = getattr(c, 'created', '')
                            if created_date:
                                day = created_date[:10]
                                if day >= since_date:
                                    active_dates.add(day)
                                
            # Check Changelog (Transitions, etc.)
            if hasattr(issue, 'changelog') and hasattr(issue.changelog, 'histories'):
                for h in issue.changelog.histories:
                    author = getattr(h, 'author', None)
                    if author:
                        author_id = self.get_user_id(author)
                        if author_id == account_id:
                            created_date = getattr(h, 'created', '')
                            if created_date:
                                day = created_date[:10]
                                if day >= since_date:
                                    active_dates.add(day)
                                
        result["dates"] = sorted(list(active_dates))
        return result

client = JiraClient()
