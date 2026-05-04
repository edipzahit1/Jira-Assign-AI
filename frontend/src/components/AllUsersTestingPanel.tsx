import type { RecommendationType } from './RecommendationPanel.tsx';
import { useLanguage } from '../LanguageContext.tsx';

interface JiraIssue {
    key: string;
    summary: string;
    type: string;
    priority: string;
    labels: string[];
}

// ── Styling maps (mirrored from Dashboard for consistency)
const TYPE_STYLE: Record<string, { color: string; bg: string }> = {
    Bug: { color: 'text-rose-500', bg: 'bg-rose-500/10' },
    Story: { color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    Task: { color: 'text-blue-500', bg: 'bg-blue-500/10' },
    Epic: { color: 'text-violet-500', bg: 'bg-violet-500/10' },
    Subtask: { color: 'text-slate-400', bg: 'bg-slate-400/10' },
};
const DEFAULT_TYPE = { color: 'text-muted-foreground', bg: 'bg-muted' };

const PRIORITY_STYLE: Record<string, { dot: string; label: string }> = {
    Highest: { dot: 'bg-red-600', label: 'text-red-500' },
    High: { dot: 'bg-orange-500', label: 'text-orange-500' },
    Medium: { dot: 'bg-yellow-400', label: 'text-yellow-500' },
    Low: { dot: 'bg-blue-400', label: 'text-blue-400' },
    Lowest: { dot: 'bg-slate-400', label: 'text-slate-400' },
};
const DEFAULT_PRIORITY = { dot: 'bg-muted-foreground', label: 'text-muted-foreground' };

interface AllUsersTestingPanelProps {
    recommendations: RecommendationType[];
    appliedWeights: Record<string, number> | null;
    taskType?: string | null;
    selectedIssue?: JiraIssue | null;
}

export default function AllUsersTestingPanel({ recommendations, appliedWeights, taskType, selectedIssue }: AllUsersTestingPanelProps) {
    const { t } = useLanguage();
    const ta = t.allUsers;

    const renderScore = (raw: number, weightKey: string) => {
        if (!appliedWeights) return Math.round(raw);
        const weight = appliedWeights[weightKey] || 0;
        const weighted = raw * weight;
        return (
            <div className="flex flex-col items-center">
                <span className="font-medium">{Math.round(raw)}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">/{weighted.toFixed(1)}</span>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-card overflow-hidden">

            {/* ── Top App Bar (Drawer Title) ── */}
            <div className="bg-background/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
                <h1 className="text-xl font-black text-foreground flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Detailed AI Analysis
                </h1>
            </div>

            {/* ── Selected Issue Detail Banner ── */}
            {selectedIssue ? (
                <div className="shrink-0 border-b border-border bg-gradient-to-r from-card via-muted/20 to-card px-6 py-5 space-y-3">
                    <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">{t.allUsers.targetTaskDetails}</h2>
                        {/* Row 1: Key + Type + Priority */}
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded-md bg-primary text-primary-foreground font-mono">
                                {selectedIssue.key}
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-tight px-2 py-0.5 rounded-md ${(TYPE_STYLE[selectedIssue.type] ?? DEFAULT_TYPE).bg} ${(TYPE_STYLE[selectedIssue.type] ?? DEFAULT_TYPE).color}`}>
                                {selectedIssue.type}
                            </span>
                            <div className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted/40 border border-border/30">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${(PRIORITY_STYLE[selectedIssue.priority] ?? DEFAULT_PRIORITY).dot}`} />
                                <span className={`text-[10px] font-bold ${(PRIORITY_STYLE[selectedIssue.priority] ?? DEFAULT_PRIORITY).label}`}>
                                    {selectedIssue.priority}
                                </span>
                            </div>
                        </div>

                        {/* Row 2: Summary */}
                        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                            {selectedIssue.summary}
                        </p>

                        {/* Row 3: Labels */}
                        {selectedIssue.labels && selectedIssue.labels.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                {selectedIssue.labels.map(label => (
                                    <span key={label} className="text-[10px] font-bold bg-muted/70 text-muted-foreground px-2 py-0.5 rounded-md border border-border/30">
                                        {label}
                                    </span>
                                ))}
                            </div>
                        )}
                </div>
            ) : null}

            <div className="flex-1 flex flex-col overflow-hidden px-6 pb-6 pt-4">

            {/* ── No data state ── */}
            {(!recommendations || recommendations.length === 0) ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center h-full">
                    <svg className="w-16 h-16 mb-4 text-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <h3 className="text-lg font-medium text-foreground mb-1">{ta.noData}</h3>
                    <p className="max-w-sm">{ta.noDataHint}</p>
                </div>
            ) : (
                <>
                    {/* HEADER */}
                    <div className="py-3 border-b border-border flex justify-between items-center shrink-0">
                        <div>
                            <h2 className="text-sm font-bold flex items-center gap-2 text-foreground uppercase tracking-widest">
                                {ta.title}
                            </h2>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{ta.subtitle}</p>
                        </div>
                        {taskType && (
                            <div className="flex flex-col items-end gap-0.5">
                                <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    taskType === 'specialist' ? 'bg-purple-500/10 text-purple-500' : 'bg-blue-500/10 text-blue-500'
                                }`}>
                                    {taskType === 'specialist' ? '🎯 Specialist' : '🔧 Generalist'}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* METRIC EXPLANATIONS */}
                    <div className="bg-muted/30 px-4 py-3 border border-border rounded-lg shrink-0 flex flex-wrap gap-x-6 gap-y-2 text-[11px] mb-4">
                        <div className="flex items-center gap-1.5 w-full mb-1">
                            <span className="font-bold text-foreground">{ta.scoreAnatomy}</span>
                            <span className="text-muted-foreground mr-1 border-r border-border/50 pr-2">{ta.rawVsWeighted}</span>
                        </div>
                        <div className="flex items-start gap-1.5"><span className="font-bold text-primary shrink-0">{ta.matTitle}</span> <span className="text-muted-foreground">{ta.matDesc}</span></div>
                        <div className="flex items-start gap-1.5"><span className="font-bold text-emerald-500 shrink-0">{ta.capTitle}</span> <span className="text-muted-foreground">{ta.capDesc}</span></div>
                        <div className="flex items-start gap-1.5"><span className="font-bold text-blue-500 shrink-0">{ta.relTitle}</span> <span className="text-muted-foreground">{ta.relDesc}</span></div>
                        <div className="flex items-start gap-1.5"><span className="font-bold text-purple-500 shrink-0">{ta.domTitle}</span> <span className="text-muted-foreground">{ta.domDesc}</span></div>
                        <div className="flex items-start gap-1.5"><span className="font-bold text-orange-500 shrink-0">{ta.actTitle}</span> <span className="text-muted-foreground">{ta.actDesc}</span></div>
                    </div>

                    {/* TABLE */}
                    <div className="flex-1 overflow-auto custom-scrollbar border border-border rounded-lg">

                        <table className="w-full text-left border-collapse text-xs">
                            <thead className="sticky top-0 bg-secondary text-secondary-foreground z-10 shadow-sm">
                                <tr>
                                    <th className="p-3 font-semibold border-b">{ta.colUser}</th>
                                    <th className="p-3 font-semibold border-b text-center" title="Match (NLP + Tags)">{ta.colMat}</th>
                                    <th className="p-3 font-semibold border-b text-center" title="Capacity (Workload)">{ta.colCap}</th>
                                    <th className="p-3 font-semibold border-b text-center" title="Reliability (Historical)">{ta.colRel}</th>
                                    <th className="p-3 font-semibold border-b text-center" title="Domain (Category Experience)">{ta.colDom}</th>
                                    <th className="p-3 font-semibold border-b text-center" title="Recent Activity (Presence)">{ta.colAct}</th>
                                    <th className="p-3 font-semibold border-b">{ta.colPLabel}</th>
                                    <th className="p-3 font-semibold border-b">{ta.colSLabel}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {recommendations.map((rec) => (
                                    <tr key={rec.user_id} className={`hover:bg-muted/50 transition-colors ${!rec.is_eligible ? 'opacity-50' : ''}`}>
                                        <td className="p-3 font-medium text-foreground whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">
                                                    {rec.display_name.charAt(0)}
                                                </div>
                                                <span>{rec.display_name}</span>
                                                <span className="ml-auto px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground text-[10px] font-bold tabular-nums">
                                                    {rec.total_score.toFixed(1)}
                                                </span>
                                            </div>
                                            {!rec.is_eligible && <div className="text-[10px] text-destructive mt-1 truncate max-w-[120px]" title={rec.filtered_reason || "Not eligible"}>{ta.blocked}</div>}
                                        </td>
                                        <td className="p-3 text-center">{renderScore(rec.expertise_score, 'expertise')}</td>
                                        <td className="p-3 text-center">{renderScore(rec.workload_score, 'workload')}</td>
                                        <td className="p-3 text-center">{renderScore(rec.success_rate_score, 'success_rate')}</td>
                                        <td className="p-3 text-center">{renderScore(rec.category_experience_score, 'category_experience')}</td>
                                        <td className="p-3 text-center">{renderScore(rec.recent_activity_score, 'recent_activity')}</td>
                                        <td className="p-3 truncate max-w-[80px]" title={rec.primary_label || "-"}>
                                            <span className={rec.primary_label ? "px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : "text-muted-foreground"}>
                                                {rec.primary_label || "-"}
                                            </span>
                                        </td>
                                        <td className="p-3 truncate max-w-[80px]" title={rec.secondary_label || "-"}>
                                            <span className={rec.secondary_label ? "px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" : "text-muted-foreground"}>
                                                {rec.secondary_label || "-"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            
            </div>
        </div>
    );
}
