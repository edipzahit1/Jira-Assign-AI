# 🗄️ Database Schema Documentation

This document describes the SQLAlchemy tables used in the **Jira Assign AI** system. The schema is optimized for PostgreSQL with `pgvector` for AI similarity searches.

---

## 1. `jira_users`
Stores assignable users fetched from the Jira Project.
| Column | Type | Description |
| :--- | :--- | :--- |
| `account_id` | `String` | **Primary Key**. Standard Jira identifier. |
| `display_name` | `String` | Full name of the user. |
| `email` | `String` | User email address. |
| `active` | `Boolean` | Whether the user is active in Jira. |

## 2. `portal_users`
Administrative users for the dashboard.
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `Integer` | **Primary Key**. |
| `username` | `String` | Unique login username. |
| `hashed_password`| `String` | Secure argon2/bcrypt hash. |
| `created_at` | `DateTime` | Account creation timestamp. |

## 3. `projects`
Individual Jira project configurations and sync states.
| Column | Type | Description |
| :--- | :--- | :--- |
| `key` | `String` | **Primary Key**. e.g., "BRUH". |
| `name` | `String` | Readable project name. |
| `server_url` | `String` | Jira instance URL. |
| `user_email` | `String` | Admin email for API auth. |
| `api_token` | `String` | **Encrypted** Jira API token. |
| `active_strategy` | `String` | Active preset (BALANCED, SPEED, etc.). |
| `last_sync_date` | `String` | Timestamp of last successful sync. |
| `sync_progress` | `JSON` | Current sync status and ETA. |
| `sync_type` | `String` | Current active sync mode. |

## 4. `task_cache`
Cached Jira issues with AI embeddings for rapid assignment.
| Column | Type | Description |
| :--- | :--- | :--- |
| `issue_key` | `String` | **Primary Key**. e.g., "ASAI-123". |
| `project_key` | `String` | Foreign reference to projects. |
| `assignee_id` | `String` | Jira Account ID of the assignee. |
| `status_category`| `String` | e.g., "To Do", "In Progress", "Done". |
| `labels` | `JSON` | List of Jira labels. |
| `story_points` | `Float` | Estimated effort. |
| `completed_on_time`| `Boolean` | Punctuality metric (AI source). |
| `reopen_count` | `Integer` | Quality metric (AI source). |
| `embedding` | `Vector(384)`| **AI Vector**. Supports similarity search. |

## 5. `team_rules` & `user_teams`
Maps specific Jira users and tags to internal team structures.
- **Rules**: Defines which tags (e.g., 'Frontend') map to which teams.
- **Teams**: Direct many-to-many relationship between users and groups.

## 6. `developer_activity_cache`
Performance and availability data for the scoring engine.
| Column | Type | Description |
| :--- | :--- | :--- |
| `account_id` | `String` | **Primary Key**. User identifier. |
| `active_dates` | `JSON` | List of dates with recent activity. |
| `leave_dates` | `JSON` | Detected leave/vacation periods. |
| `updated_at` | `DateTime` | Cache refresh timestamp. |

## 7. `advanced_settings`
Personalized scoring weights and thresholds per project.
| Column | Type | Description |
| :--- | :--- | :--- |
| `project_key` | `String` | **Primary Key**. |
| `w_expertise` | `Float` | Weight score for NLP match. |
| `w_workload` | `Float` | Weight score for current capacity. |
| `leave_threshold` | `Integer` | Days defined as "Long Leave" (Default: 15). |

---

> [!NOTE]
> In production environments using PostgreSQL, the `embedding` column utilizes the `pgvector` extension for high-performance cosine similarity calculations.
