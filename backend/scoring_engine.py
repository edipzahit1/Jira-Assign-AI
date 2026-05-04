"""
This engine contains the core algorithm for the task assignment optimization.
It calculates scores for Expertise, Workload, Success Rate, Category Experience,
and Recent Activity, combining them using the dynamic weights provided by
the user (or the database defaults).

Criteria (5):
  1. Expertise        – NLP + label matching with time decay
  2. Workload         – capacity based on open tasks & story points
  3. Success Rate     – on-time completion & quality (low default weight)
  4. Category Exp.    – decay-weighted count of past tasks in same labels
  5. Recent Activity  – presence consistency (distinct active days in last 5 days)
"""
from typing import List, Dict, Any, Tuple
from models import ScoringWeights, RecommendedUserResult, TeamRule, UserTeam
from nlp_utils import get_text_embedding
import numpy as np
import datetime
import math
from collections import Counter

class ScoringEngine:
    def __init__(self, weights: ScoringWeights):
        self.weights = weights
        # Advanced settings with defaults (overridden by set_advanced_settings)
        self._adv = {
            "expertise_nlp_weight": 0.60,
            "expertise_label_weight": 0.40,
            "workload_task_saturation": 30,
            "workload_sp_saturation": 60,
            "success_deadline_weight": 0.70,
            "success_reopen_weight": 0.30,
            "activity_window_days": 14,
            "activity_neutral_score": 50,
            "leave_threshold_days": 15,
            "leave_window_days": 30,
            "category_saturation_point": 100,
        }

    def set_advanced_settings(self, settings: Dict[str, Any]):
        """Override internal scoring constants with user-configured values."""
        self._adv.update(settings)

    @staticmethod
    def _calculate_decay_factor(resolved_at) -> float:
        """Calculate a time-decay multiplier for a historical task based on its resolution date.
        
        Formula: decay = max(0.3, 1.0 - (age_years * 0.15))
        - Today's task      -> 1.0  (full weight)
        - 1 year old task    -> 0.85
        - 2 year old task    -> 0.70
        - 5+ year old task   -> 0.30 (floor, preserves deep domain signal)
        
        Returns 1.0 for tasks with no resolution date (still open or unknown).
        """
        if not resolved_at:
            return 1.0
        try:
            if hasattr(resolved_at, 'date'):
                resolved_date = resolved_at
            else:
                resolved_date = datetime.datetime.fromisoformat(str(resolved_at))
            
            now = datetime.datetime.now(tz=resolved_date.tzinfo if resolved_date.tzinfo else None)
            age_years = (now - resolved_date).days / 365.0
            return max(0.3, 1.0 - (age_years * 0.15))
        except (ValueError, TypeError):
            return 1.0

    def calculate_expertise_score(self, new_issue: Dict[str, Any], user_history: List[Dict[str, Any]], top_semantic_matches: List[Dict[str, Any]] = None) -> float:
        """
        Calculates expertise based on two factors (Blended Score) with time-decay:
        1. Jaccard similarity of tags (components, labels, issue_type) — weighted by decay.
        2. Semantic similarity of the text (summary, description) using NLP embeddings — weighted by decay.
        Returns a score between 0 and 100.
        """
        if not user_history:
            return 0.0
            
        new_labels = set(new_issue.get("labels", []))
        new_type = new_issue.get("issue_type")
        
        # 1. TAG MATCHING (JACCARD) — with time-decay weighting
        total_tag_similarity = 0.0
        total_decay_weight = 0.0
        
        for task in user_history:
            task_labels = set(task.get("labels", []))
            decay = self._calculate_decay_factor(task.get("resolved_at"))
            
            # Simple Jaccard Similarity for tags
            intersection = len(new_labels.intersection(task_labels))
            union = len(new_labels.union(task_labels))
            
            sim_score = (intersection / union) if union > 0 else 0.0
            
            # Boost if issue type is exactly the same
            if new_type and task.get("issue_type") == new_type:
                sim_score += 0.2
                
            total_tag_similarity += min(sim_score, 1.0) * decay
            total_decay_weight += decay
            
        # Weighted average tags (normalized by total decay weight)
        avg_tag_score = (total_tag_similarity / total_decay_weight) * 100 if total_decay_weight > 0 else 0.0
        
        # 2. NLP SEMANTIC MATCHING (O(users * Top-K)) — with time-decay weighting
        new_text = f"{new_issue.get('summary', '')} {new_issue.get('description', '')}"
        nlp_semantic_score = 0.0

        if new_text.strip():
            if top_semantic_matches is not None and len(top_semantic_matches) > 0:
                # A) ENTERPRISE MODE: Use pre-calculated PostgreSQL pgvector matches
                total_weighted_sim = 0.0
                total_decay_nlp = 0.0
                for match in top_semantic_matches:
                    decay = self._calculate_decay_factor(match["resolved_at"])
                    total_weighted_sim += match["similarity"] * decay
                    total_decay_nlp += decay
                
                if total_decay_nlp > 0:
                    nlp_semantic_score = (total_weighted_sim / total_decay_nlp) * 100
                    
            else:
                # B) FALLBACK MODE: In-Memory NumPy Math (for SQLite local testing)
                new_embedding = get_text_embedding(new_text)
                historical_embeddings = []
                embedding_decay_factors = []
                
                for task in user_history:
                    decay = self._calculate_decay_factor(task.get("resolved_at"))
                    emb = task.get('embedding')
                    
                    # 1. Try to get pre-computed embedding
                    current_emb = None
                    if emb is not None:
                        if isinstance(emb, bytes):
                            current_emb = np.frombuffer(emb, dtype=np.float32)
                        elif isinstance(emb, (list, np.ndarray)):
                            current_emb = np.array(emb, dtype=np.float32)
                    
                    # 2. Fallback to on-the-fly calculation if missing
                    if current_emb is None:
                        hist_text = f"{task.get('summary', '')} {task.get('description', '')}"
                        if hist_text.strip():
                            current_emb = get_text_embedding(hist_text)
                            
                    if current_emb is not None:
                        historical_embeddings.append(current_emb)
                        embedding_decay_factors.append(decay)
                
                if historical_embeddings:
                    nlp_semantic_score = self._decay_weighted_top_k_similarity(
                        new_embedding, historical_embeddings, embedding_decay_factors, k=5
                    ) * 100
        
        # 3. BLEND SCORES
        # If no semantic text available, rely 100% on tags. 
        # If text is available, Semantic match is often more accurate than simple tags.
        TAG_WEIGHT = self._adv["expertise_label_weight"]
        NLP_WEIGHT = self._adv["expertise_nlp_weight"]
        
        # Only apply NLP if there was actually text to compare
        if new_text.strip():
            blended_score = (TAG_WEIGHT * avg_tag_score) + (NLP_WEIGHT * nlp_semantic_score)
        else:
            blended_score = avg_tag_score
            
        return float(min(blended_score, 100.0))

    @staticmethod
    def _decay_weighted_top_k_similarity(
        new_embedding: np.ndarray, 
        historical_embeddings: List[np.ndarray], 
        decay_factors: List[float],
        k: int = 5
    ) -> float:
        """Calculate top-K semantic similarity with time-decay weighting.
        
        Instead of a simple average of top-K similarities, each similarity
        is weighted by its decay factor so recent matches count more.
        """
        if not historical_embeddings or new_embedding is None:
            return 0.0
        
        # Calculate cosine similarities
        similarities = []
        for emb, decay in zip(historical_embeddings, decay_factors):
            if emb is not None and len(emb) > 0:
                dot = np.dot(new_embedding, emb)
                norm = np.linalg.norm(new_embedding) * np.linalg.norm(emb)
                sim = (dot / norm) if norm > 0 else 0.0
                similarities.append((sim, decay))
        
        if not similarities:
            return 0.0
        
        # Sort by raw similarity descending, take top K
        similarities.sort(key=lambda x: x[0], reverse=True)
        top_k = similarities[:k]
        
        # Decay-weighted average
        total_weighted_sim = sum(sim * decay for sim, decay in top_k)
        total_decay = sum(decay for _, decay in top_k)
        
        return float(total_weighted_sim / total_decay) if total_decay > 0 else 0.0

    def calculate_workload_score(self, user_open_tasks: List[Dict[str, Any]], max_team_load: float = 0.0, min_team_load: float = 0.0) -> float:
        """
        Calculate workload score (Adaptive Relative).
        - If team loads are provided (max/min), we use relative ranking.
        - Otherwise fall back to the fixed saturation logic.
        """
        task_count = len(user_open_tasks)
        story_points = sum([t.get("story_points", 0) for t in user_open_tasks])
        
        user_load = task_count + (story_points * 0.5)
        
        if max_team_load > min_team_load:
            # RELATIVE SCORING (Adaptive for 30k tickets)
            # The person with the least work always gets 100.
            # The person with the most work always gets 0.
            # Scaling: (1 - (user - min) / (max - min)) * 100
            diff = max_team_load - min_team_load
            rel_score = 1.0 - (user_load - min_team_load) / diff
            return float(max(0.0, min(100.0, rel_score * 100)))
        
        # LEGACY: Fixed Saturation (Used if no team context provided)
        task_sat = self._adv.get("workload_task_saturation", 30)
        sp_sat = self._adv.get("workload_sp_saturation", 60)
        capacity_penalty = (task_count / task_sat) + (story_points / sp_sat)
        raw_score = 100 - (capacity_penalty * 50)
        return max(0.0, min(100.0, raw_score))

    def calculate_success_rate_score(self, user_history: List[Dict[str, Any]]) -> float:
        """
        Calculate Reliability Score:
        - Penalizes missed deadlines (completed_on_time=False)
        - Penalizes reopens (reopen_count > 0)
        We use a weighted average of past performance.
        """
        completed = [t for t in user_history if t.get("status_category") in ("Done", "Completed", "Resolved")]
        if not completed:
            return 50.0 # Neutral starting score
            
        weighted_on_time = 0.0
        weighted_quality = 0.0
        total_weight = 0.0
        
        for t in completed:
            decay = self._calculate_decay_factor(t.get("resolutiondate"))
            total_weight += decay
            
            # Punctuality
            if t.get("completed_on_time", True):
                weighted_on_time += decay
                
            # Quality (inverse of reopens)
            reopens = t.get("reopen_count", 0)
            # Each reopen drops the score for that task. 0 reopens = 1.0, 1 reopen = 0.0
            quality_score = max(0.0, 1.0 - (reopens * 1.0)) 
            weighted_quality += (quality_score * decay)
                
        on_time_ratio = (weighted_on_time / total_weight) * 100
        quality_ratio = (weighted_quality / total_weight) * 100
        
        w_deadline = self._adv.get("success_deadline_weight", 0.70)
        w_reopen = self._adv.get("success_reopen_weight", 0.30)
        
        return (on_time_ratio * w_deadline) + (quality_ratio * w_reopen)



    def calculate_category_experience_score(self, new_issue: Dict[str, Any], user_history: List[Dict[str, Any]]) -> float:
        """
        Score based on logarithmic depth and domain concentration.
        - Depth: log10 of matching tasks (rewards early learning, requires 100 for perfect 100).
        - Concentration: Percentage of their total work that is in this category (rewards specialists).
        """
        if not user_history:
            return 50.0
            
        new_tags = set(new_issue.get("labels", []))
        if not new_tags:
            return 50.0 # General task, everyone gets neutral
            
        weighted_match_count = 0.0
        for task in user_history:
            task_tags = set(task.get("labels", []))
            if new_tags.intersection(task_tags):
                decay = self._calculate_decay_factor(task.get("resolved_at"))
                weighted_match_count += decay
        
        # 1. DEPTH (LOGARITHMIC)
        # Using log10 ensures diminishing returns. It is much harder to go from 50 to 60 than 0 to 10.
        sat_point = self._adv.get("category_saturation_point", 100)
        # We use log10(x+1) to handle 0 and ensure log10(1) = 0.
        depth_score = (math.log10(weighted_match_count + 1) / math.log10(sat_point + 1)) * 100
        
        # 2. CONCENTRATION (SPECIALIZATION)
        # How much of their career is focused on this area?
        total_tasks = len(user_history)
        concentration_ratio = weighted_match_count / total_tasks if total_tasks > 0 else 0
        
        # Specialist Boost: A dev with only 20 tasks total but ALL in this category 
        # should be highly ranked despite lower 'Depth' than a 1000-task senior.
        # We boost the base depth score by up to 50% based on concentration.
        final_score = depth_score * (1.0 + (concentration_ratio * 0.5))
        
        return float(min(100.0, final_score))

    def calculate_recent_activity_score(self, worklog_dates: List[str], has_assignments: bool, leave_dates: List[str] = None) -> float:
        """
        Presence consistency metric: measures how many of the recent working days
        the developer was actively interacting with tickets (comments, transitions).
        
        - Counts distinct days with any activity
        - Target active days = max(1, int(activity_window_days * 5 / 7))
        - Zero activity AND zero assignments → neutral score (possible planned leave)
        - Zero activity BUT has assignments → 0 (inactive despite having work)
        """
        leave_dates = leave_dates or []
        total_working_leave_days = len(set(leave_dates))
        leave_threshold = self._adv.get("leave_threshold_days", 15)
        neutral_score = float(self._adv.get("activity_neutral_score", 50))
        
        # Check for Current Presence
        now = datetime.datetime.now()
        recent_check_days = [(now - datetime.timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
        currently_on_leave = any(day in leave_dates for day in recent_check_days)
        
        if total_working_leave_days >= leave_threshold and currently_on_leave:
            return neutral_score

        active_days = len(set(worklog_dates))
        window_days = self._adv.get("activity_window_days", 14)
        target_days = max(1, int(window_days * 5 / 7))
        
        if active_days == 0:
            if not has_assignments:
                return neutral_score  # Neutral — possibly on leave
            return 0.0  # Has tasks but no activity — actually inactive
        
        return min(100.0, (active_days / target_days) * 100)

    def calculate_top_labels(self, user_history: List[Dict[str, Any]]) -> Tuple[str, str]:
        """
        Calculate the top 2 most frequently used labels by a user across their historical tasks.
        """
        if not user_history:
            return "", ""
            
        all_labels = []
        for task in user_history:
            all_labels.extend([label.lower().strip() for label in task.get("labels", []) if label.strip()])
            
        if not all_labels:
            return "", ""
            
        counter = Counter(all_labels)
        most_common = counter.most_common(2)
        
        primary = most_common[0][0] if len(most_common) > 0 else ""
        secondary = most_common[1][0] if len(most_common) > 1 else ""
        
        return primary, secondary

    def detect_task_type(self, new_issue: Dict[str, Any], override_labels: List[str]) -> str:
        """
        Detect if the task is a 'specialist' or 'generalist' task based on its tags and overrides.
        """
        issue_labels = [l.lower() for l in new_issue.get("labels", [])]
        
        # A task is generalist ONLY if ALL of its labels are override labels.
        # A mixed task like ["payment-gateway", "general"] is still a specialist task.
        override_set = set(o.lower().strip() for o in override_labels)
        if issue_labels and all(label in override_set for label in issue_labels):
            return "generalist"
                
        # If no override, but has specific labels, it's a specialist
        if new_issue.get("labels"):
            return "specialist"
            
        return "generalist"

    def get_dynamic_weights(self, task_type: str, base_weights: ScoringWeights) -> ScoringWeights:
        """
        Adjust weights based on task type.
        """
        adjusted = base_weights.model_copy()
        
        if task_type == "specialist":
            # Boost expertise, reduce workload importance
            total_reduction = adjusted.workload * 0.5
            adjusted.workload -= total_reduction
            adjusted.expertise += (total_reduction * 0.6)
            adjusted.category_experience += (total_reduction * 0.4)
        elif task_type == "generalist":
            # Boost workload (availability), reduce expertise
            total_reduction = adjusted.expertise * 0.5
            adjusted.expertise -= total_reduction
            adjusted.workload += (total_reduction * 0.8)
            adjusted.recent_activity += (total_reduction * 0.2)
            
        # Normalize to ensure sum is exactly 1.0
        total = sum([v for k, v in adjusted.model_dump().items() if isinstance(v, (int, float))])
        if total > 0:
            for k in adjusted.model_dump().keys():
                if isinstance(getattr(adjusted, k), float):
                    setattr(adjusted, k, getattr(adjusted, k) / total)
                    
        return adjusted

    def apply_hard_constraints(
        self, 
        new_issue: Dict[str, Any], 
        user_id: str, 
        user_team_names: List[str], 
        team_rules: List[TeamRule], 
        override_labels: List[str]
    ) -> Tuple[bool, str]:
        """
        Phase 1 Filter: Returns (is_eligible, reason)
        - Checks if task has any override labels -> Eligible
        - Checks if task components/labels match any strict TeamRule
        - If so, checks if the user is in the allowed teams
        """
        issue_labels = [l.lower() for l in new_issue.get("labels", [])]
        
        # 1. Override Check
        # A task is generalist ONLY if ALL of its labels are override labels.
        # A mixed task like ["payment-gateway", "general"] is still a specialist task.
        override_set = set(o.lower().strip() for o in override_labels)
        if issue_labels and all(label in override_set for label in issue_labels):
            return True, ""
                
        # 2. Constraint Check
        required_teams = set()
        for rule in team_rules:
            val = rule.match_value.lower()
            if rule.match_type == "label" and val in issue_labels:
                required_teams.add(rule.allowed_team)
                
        # If no rules matched the issue's tags, it's unconstrained
        if not required_teams:
            return True, ""
            
        # 3. User Eligibility Check
        # Check intersection of required_teams and user_team_names
        # User only needs to be in AT LEAST ONE of the allowed teams
        user_team_set = set(user_team_names)
        if required_teams.intersection(user_team_set):
            return True, ""
            
        return False, f"Assignment Constraint: This task can only be assigned to the following team(s): {', '.join(required_teams)}"

    def build_explanation(
        self, 
        scores: Dict[str, float], 
        weights: ScoringWeights, 
        total_score: float,
        primary_label: str = "",
        secondary_label: str = "",
        open_tasks_count: int = 0,
        lang: str = "en",
        is_long_leave: bool = False
    ) -> Dict[str, Any]:
        """
        Explainability Engine: Calculates percentage contribution of each factor to the final score
        and generates a human-readable reasoning summary.
        """
        contributions = {}
        
        # Calculate the sum of all absolute weighted scores to find the actual denominator
        total_absolute_contribution = 0
        for factor_name, score_val in scores.items():
            weight_val = getattr(weights, factor_name.replace("_score", ""), 0)
            total_absolute_contribution += abs(score_val * weight_val)

        for factor_name, score_val in scores.items():
            weight_val = getattr(weights, factor_name.replace("_score", ""), 0)
            weighted_score = score_val * weight_val
            contribution_pct = (abs(weighted_score) / total_absolute_contribution) * 100 if total_absolute_contribution > 0 else 0
            contributions[factor_name] = round(contribution_pct, 1)
            
        # Build natural language summary based on top contributors
        sorted_factors = sorted(contributions.items(), key=lambda x: x[1], reverse=True)
        top1 = sorted_factors[0] if len(sorted_factors) > 0 else ("expertise_score", 0)
        top2 = sorted_factors[1] if len(sorted_factors) > 1 else ("workload_score", 0)
        
        t1_key, t1_val = top1[0], top1[1]
        t2_key, t2_val = top2[0], top2[1]
        
        # Factor grouping logic for reasoning
        def get_factor_context(key):
            if key in ["expertise_score", "category_experience_score"]: return "expertise"
            if key in ["workload_score"]: return "availability"
            if key in ["success_rate_score"]: return "performance"
            if key in ["recent_activity_score"]: return "activity"
            return "other"
            
        c1 = get_factor_context(t1_key)
        c2 = get_factor_context(t2_key)
        
        # Helper strings for dynamic injection
        label_text = ""
        workload_sat = self._adv.get("workload_task_saturation", 10)
        if lang == "tr":
            workload_text = f" (Şu anda sadece {open_tasks_count} açık görevi var)" if open_tasks_count < (workload_sat / 2) else ""
        else:
            workload_text = f" (Currently has only {open_tasks_count} open tasks)" if open_tasks_count < (workload_sat / 2) else ""

        if lang == "tr":

            if c1 == "expertise" and c2 == "expertise":
                if t1_key == "category_experience_score" or t2_key == "category_experience_score":
                    reasoning_text = f"Geliştirici, bu görevle ilgili etiketlerde çok yüksek bir uzmanlık yoğunluğuna sahip. Geçmişteki odaklanmış tecrübesi (%{(t1_val + t2_val):.1f} toplam etki) onu en güvenilir tercih yapıyor.{label_text}"
                else:
                    reasoning_text = f"Sistem, adayın benzer işlerdeki derin tecrübesine güveniyor. İşin içeriğiyle (NLP) ve etiketlerle (Eşleşme) olan teknik uyumu, bu atama kararındaki en büyük etkendi (toplam %{(t1_val + t2_val):.1f} katkı).{label_text}"
            elif c1 == "availability" and t1_val > 40:
                reasoning_text = f"Ekip iş akışını dengelemek ve tıkanıklıkları önlemek için sistem bu adayı en uygun kişi olarak seçti. Adayın boş kapasitesi{workload_text} bu atamada ana rolü oynadı (%{t1_val:.1f})."
            elif c1 == "performance":
                reasoning_text = f"Bu adayı önermedeki ana faktör, görevleri doğru ve zamanında çözme konusundaki geçmiş güvenilirliği ve başarı oranıdır (%{t1_val:.1f})."
            elif c1 == "activity" and t1_val > 35:
                reasoning_text = f"Bu aday, öncelikle son dönemdeki tutarlı varlığı ve aktivitesi nedeniyle seçildi (%{t1_val:.1f} etki). Aktif olarak çalışıyor ve efor kaydediyorlar, bu da onları zamanında teslimat için güvenilir bir seçim yapıyor."
            elif c1 == "expertise" and c2 == "availability":
                reasoning_text = f"Yapay zeka bu adayı seçti çünkü hem iş için gereken uzmanlığa yüksek derecede sahip (%{t1_val:.1f} etki) hem de mevcut iş yükü bu işi üstlenmek için yeterince uygun (%{t2_val:.1f} etki).{label_text}"
            elif c1 == "availability" and c2 == "expertise":
                reasoning_text = f"Listenin başında olmalarının nedeni hem işi hızla eritmek için kapasitelerinin/zamanlarının olması (%{t1_val:.1f} etki){workload_text} hem de işteki teknik içeriğe hakimiyetleridir.{label_text}"
            else:
                factor_translations = {
                    "expertise_score": "Eşleşme",
                    "workload_score": "Kapasite",
                    "success_rate_score": "Güvenilirlik",
                    "category_experience_score": "Alan Bilgisi",
                    "recent_activity_score": "Son Aktivite"
                }
                n1 = factor_translations.get(t1_key, t1_key)
                n2 = factor_translations.get(t2_key, t2_key)
                reasoning_text = f"Modelimiz tarafından yapılan analizde, en belirleyici faktör %{t1_val:.1f} etki payı ile '{n1}' oldu. "
                if t2_val > 15.0:
                    reasoning_text += f"Ayrıca, adayın '{n2}' kriterindeki avantajı kararı destekliyor."
        else:
            # English (Original)
            if primary_label:
                label_text = f" This candidate's frequent work areas: '{primary_label}'"
                if secondary_label:
                    label_text += f", '{secondary_label}'"
                label_text += "."

            if c1 == "expertise" and c2 == "expertise":
                if t1_key == "category_experience_score" or t2_key == "category_experience_score":
                    reasoning_text = f"The developer shows a very high concentration of expertise in the tags related to this task. Their focused historical experience ({(t1_val + t2_val):.1f}% total impact) makes them the most reliable choice.{label_text}"
                else:
                    reasoning_text = f"The system trusts the candidate's deep experience in previous similar tickets. The technical alignment with the task's content (based on NLP) and labels (Match) was the biggest factor in this assignment decision ({(t1_val + t2_val):.1f}% total contribution).{label_text}"
            elif c1 == "availability" and t1_val > 40:
                reasoning_text = f"To balance the team's workflow and prevent bottlenecks, the system selected this candidate as the most suitable. The candidate's available capacity{workload_text} played the main role ({t1_val:.1f}%) in this assignment."
            elif c1 == "performance":
                reasoning_text = f"The main factor in recommending this candidate is their historical reliability and success rate in resolving tasks correctly and on time ({t1_val:.1f}%)."
            elif c1 == "activity" and t1_val > 35:
                reasoning_text = f"This candidate was selected primarily because of their consistent recent presence and activity ({t1_val:.1f}% impact). They have been actively working and logging effort, making them a reliable pick for timely delivery."
            elif c1 == "expertise" and c2 == "availability":
                reasoning_text = f"The AI selected this candidate because they highly possess the required expertise for the task ({t1_val:.1f}% impact), and their current workload is sufficiently available to take on this work ({t2_val:.1f}% impact).{label_text}"
            elif c1 == "availability" and c2 == "expertise":
                reasoning_text = f"The reason they are at the top of the list is both their capacity/time to quickly melt down the work ({t1_val:.1f}% impact){workload_text}, and their mastery of the technical content in the task.{label_text}"
            else:
                factor_translations = {
                    "expertise_score": "Match",
                    "workload_score": "Capacity",
                    "success_rate_score": "Reliability",
                    "category_experience_score": "Domain",
                    "recent_activity_score": "Recent Activity"
                }
                n1 = factor_translations.get(t1_key, t1_key)
                n2 = factor_translations.get(t2_key, t2_key)
                reasoning_text = f"In the analysis performed by our model, the most decisive factor was '{n1}' with a {t1_val:.1f}% impact share. "
                if t2_val > 15.0:
                    reasoning_text += f"Additionally, the candidate's advantage in the '{n2}' criterion supports the decision."

        if is_long_leave:
            if lang == "tr":
                leave_reason = "⚠️ Bu geliştirici son 30 günde 15+ gün izin kaydı girmiş ve şu an izinde görünüyor. Aktif olmayabilir."
            else:
                leave_reason = "⚠️ This candidate has logged 15+ days of leave in the last 30 days and appears to be currently on leave."
            reasoning_text = leave_reason + "\n\n" + reasoning_text

        return {
            "contributions": contributions,
            "text": reasoning_text,
            "long_leave": is_long_leave
        }

    def get_recommendation(
        self, 
        user_id: str, 
        user_name: str, 
        new_issue: Dict[str, Any], 
        user_history: List[Dict[str, Any]], 
        user_open_tasks: List[Dict[str, Any]],
        user_team_names: List[str] = None,
        team_rules: List[TeamRule] = None,
        override_labels: List[str] = None,
        worklog_dates: List[str] = None,
        leave_dates: List[str] = None,
        has_assignments: bool = False,
        top_semantic_matches: List[Dict[str, Any]] = None,
        lang: str = "en",
        max_team_load: float = 0.0,
        min_team_load: float = 0.0
    ) -> RecommendedUserResult:
        
        user_team_names = user_team_names or []
        team_rules = team_rules or []
        override_labels = override_labels or []
        worklog_dates = worklog_dates or []
        leave_dates = leave_dates or []
        
        # Calculate Labels First so they appear even for ineligible users in the UI
        primary_label, secondary_label = self.calculate_top_labels(user_history)
        
        # Phase 1: Hard Constraints Check
        is_eligible, filtered_reason = self.apply_hard_constraints(new_issue, user_id, user_team_names, team_rules, override_labels)
        
        if not is_eligible:
            # Drop out early, return 0s
            return RecommendedUserResult(
                user_id=user_id,
                display_name=user_name,
                is_eligible=False,
                filtered_reason=filtered_reason,
                total_score=0, expertise_score=0, workload_score=0, success_rate_score=0,
                primary_label=primary_label, secondary_label=secondary_label
            )
            
        # Detect Task Type & Get Dynamic Weights
        task_type = self.detect_task_type(new_issue, override_labels)
        dy_weights = self.get_dynamic_weights(task_type, self.weights)
        
        # Phase 2: Soft Optimization Scoring (5 criteria)
        expertise = self.calculate_expertise_score(new_issue, user_history, top_semantic_matches)
        workload_score = self.calculate_workload_score(user_open_tasks, max_team_load, min_team_load)
        success = self.calculate_success_rate_score(user_history)
        cat_exp = self.calculate_category_experience_score(new_issue, user_history)
        recent_act = self.calculate_recent_activity_score(worklog_dates, has_assignments, leave_dates)
        
        # Combine weights with dynamic weights
        total_score = (
            (expertise * dy_weights.expertise) +
            (workload_score * dy_weights.workload) +
            (success * dy_weights.success_rate) +
            (cat_exp * dy_weights.category_experience) +
            (recent_act * dy_weights.recent_activity)
        )
        
        raw_scores = {
            "expertise_score": expertise,
            "workload_score": workload_score,
            "success_rate_score": success,
            "category_experience_score": cat_exp,
            "recent_activity_score": recent_act
        }
        
        # Calculate is_long_leave for explainability and warnings
        total_working_leave_days = len(set(leave_dates))
        leave_threshold = self._adv.get("leave_threshold_days", 15)
        import datetime
        now = datetime.datetime.now()
        recent_check_days = [(now - datetime.timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
        currently_on_leave = any(day in leave_dates for day in recent_check_days)
        is_long_leave = bool(total_working_leave_days >= leave_threshold and currently_on_leave)
        
        # Explainability Engine
        reasoning_data = self.build_explanation(
            scores=raw_scores, 
            weights=dy_weights, 
            total_score=total_score,
            primary_label=primary_label,
            secondary_label=secondary_label,
            open_tasks_count=len(user_open_tasks),
            lang=lang,
            is_long_leave=is_long_leave
        )
        
        warnings = []
        if recent_act < 5.0 and has_assignments and not is_long_leave:
            if lang == "tr":
                warnings.append("⚠️ Uyarı: Bu adayın açık görevleri var ancak son 5 gün içinde neredeyse hiç çalışma kaydı yok. Müsait olmayabilir veya bir engele takılmış olabilir.")
            else:
                warnings.append("⚠️ Warning: This candidate has open tasks but almost no recent worklog activity in the last 5 days. They may be unavailable or blocked.")
        elif recent_act == 50.0 and not has_assignments and not is_long_leave:
            if lang == "tr":
                warnings.append("ℹ️ Not: Bu adayın son aktivitesi veya ataması yok. Planlı izinde olabilir — puan nötr olarak ayarlandı.")
            else:
                warnings.append("ℹ️ Note: This candidate has no recent activity or assignments. They may be on planned leave — score is set to neutral.")
        
        return RecommendedUserResult(
            user_id=user_id,
            display_name=user_name,
            is_eligible=True,
            task_type=task_type,
            total_score=round(total_score, 2),
            expertise_score=round(expertise, 2),
            workload_score=round(workload_score, 2),
            success_rate_score=round(success, 2),
            category_experience_score=round(cat_exp, 2),
            recent_activity_score=round(recent_act, 2),
            primary_label=primary_label,
            secondary_label=secondary_label,
            reasoning_data=reasoning_data,
            warnings=warnings
        )
