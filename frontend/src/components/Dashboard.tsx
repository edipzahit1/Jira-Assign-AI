import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Zap, SlidersHorizontal, X, ChevronDown, GripVertical, Sparkles, Loader2, FolderKanban, Plus } from 'lucide-react';
import api from '../api';
import RecommendationPanel from './RecommendationPanel.tsx';
import type { RecommendationType } from './RecommendationPanel.tsx';
import AllUsersTestingPanel from './AllUsersTestingPanel.tsx';
import { useLanguage } from '../LanguageContext.tsx';
import { useProject } from '../ProjectContext.tsx';

interface JiraIssue {
    key: string;
    summary: string;
    type: string;
    priority: string;
    labels: string[];
}

// ── Jira-style issue type styling
const TYPE_STYLE: Record<string, { color: string; bg: string }> = {
    Bug: { color: 'text-rose-500', bg: 'bg-rose-500/10' },
    Story: { color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    Task: { color: 'text-blue-500', bg: 'bg-blue-500/10' },
    Epic: { color: 'text-violet-500', bg: 'bg-violet-500/10' },
    Subtask: { color: 'text-slate-400', bg: 'bg-slate-400/10' },
};

// ── Jira-style priority styling
const PRIORITY_STYLE: Record<string, { color: string; bg: string }> = {
    Highest: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/15' },
    High: { color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/15' },
    Medium: { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/15' },
    Low: { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/15' },
    Lowest: { color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/15' },
    // Localized fallbacks (Turkish)
    'En Yüksek': { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/15' },
    'Yüksek': { color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/15' },
    'Orta': { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/15' },
    'Düşük': { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/15' },
    'En Düşük': { color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/15' },
};

const DEFAULT_TYPE = { color: 'text-muted-foreground', bg: 'bg-muted' };
const DEFAULT_PRIORITY = { color: 'text-slate-500', bg: 'bg-slate-500/10' };

// ── Small select pill ──────────────────────────────────────────────
function FilterSelect({ label, options, value, onChange }: {
    label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
    const active = !!value;
    return (
        <div className="relative">
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className={`appearance-none pl-2.5 pr-6 py-1 rounded-md text-xs font-medium border cursor-pointer outline-none transition-colors
                    ${active
                        ? 'bg-primary/15 border-primary/50 text-primary'
                        : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/30'
                    }`}
            >
                <option value="">{label}</option>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
        </div>
    );
}

export default function Dashboard() {
    const { t, lang } = useLanguage();
    const navigate = useNavigate();
    const td = t.dashboard;
    const { activeProject, projects, refreshProjects, isLoading: projectsLoading } = useProject();

    // Final unified data lifecycle hook
    useEffect(() => {
        // Stage 1: Waiting for ProjectContext to finish its initial fetch
        if (projectsLoading) {
            console.log("[DEBUG] Dashboard: Stage 1 (Waiting for projectsLoading...)");
            setLoading(true);
            return;
        }

        // Stage 2: Projects loaded but none found/selected
        if (projects.length === 0) {
            console.log("[DEBUG] Dashboard: Stage 2 (No projects found.)");
            setLoading(false);
            return;
        }

        // Stage 3: We have projects, but is one active?
        if (!activeProject) {
            console.log("[DEBUG] Dashboard: Stage 3 (Projects exist but none active. Waiting for context selection...)");
            setLoading(false);
            return;
        }

        // Stage 4: Ready to fetch Jira issues
        console.log(`[DEBUG] Dashboard: Stage 4 (Fetching issues for ${activeProject})`);
        
        // Reset states for new project fetch
        setSelectedIssue(null);
        setUnassignedIssues([]);
        setRecommendations([]);
        setAppliedWeights(null);
        setTaskType(null);
        setError(null);
        setLoading(true);

        api.get('/api/unassigned', { headers: { 'x-project-key': activeProject } })
            .then(res => { 
                console.log(`[DEBUG] Dashboard: Successfully fetched ${res.data.length} issues.`);
                setUnassignedIssues(res.data); 
                setError(null); 
            })
            .catch(err => {
                console.error('[DEBUG] Dashboard: Failed to load unassigned issues', err);
                if (err.response?.status === 503) setError(td.jiraNotConfigured);
                else setError(err.response?.data?.detail || td.failedToLoad);
            })
            .finally(() => {
                console.log("[DEBUG] Dashboard: Fetch complete, setting loading=false");
                setLoading(false);
            });
    }, [activeProject, projects.length, projectsLoading, refreshProjects, td]);

    const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
    const [unassignedIssues, setUnassignedIssues] = useState<JiraIssue[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    // const [highPriorityNames, setHighPriorityNames] = useState<Set<string>>(new Set(['Highest', 'High']));
    const [recommendations, setRecommendations] = useState<RecommendationType[]>([]);
    const [appliedWeights, setAppliedWeights] = useState<Record<string, number> | null>(null);
    const [taskType, setTaskType] = useState<string | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [calcError, setCalcError] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);

    // Column resizing state
    const [queueWidth, setQueueWidth] = useState(360);
    const [isResizingLeft, setIsResizingLeft] = useState(false);
    
    // Matrix Drawer State
    const [showMatrix, setShowMatrix] = useState(false);

    const minQueueWidth = 280;
    const minMiddleWidth = 400;

    const handleMouseDownLeft = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizingLeft(true);
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();

        if (isResizingLeft) {
            const newWidth = Math.max(minQueueWidth, e.clientX - containerRect.left);
            const availableForMiddle = containerRect.width - newWidth;
            if (availableForMiddle >= minMiddleWidth) {
                setQueueWidth(newWidth);
            }
        }
    }, [isResizingLeft, queueWidth]);

    const handleMouseUp = useCallback(() => {
        setIsResizingLeft(false);
    }, []);

    useEffect(() => {
        if (isResizingLeft) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizingLeft, handleMouseMove, handleMouseUp]);

    // Filters
    const [filterPriority, setFilterPriority] = useState('');
    const [filterType, setFilterType] = useState('');
    const [filterLabel, setFilterLabel] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // Derived filter option lists (unique values across all issues)
    const allPriorities = useMemo(() => [...new Set(unassignedIssues.map(i => i.priority))], [unassignedIssues]);
    const allTypes = useMemo(() => [...new Set(unassignedIssues.map(i => i.type))], [unassignedIssues]);
    const allLabels = useMemo(() => [...new Set(unassignedIssues.flatMap(i => i.labels ?? []))], [unassignedIssues]);

    const filteredIssues = useMemo(() => {
        return unassignedIssues.filter(i => {
            const q = searchQuery.toLowerCase();
            const matchSearch = !q || i.key.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q);
            const matchPriority = !filterPriority || i.priority === filterPriority;
            const matchType = !filterType || i.type === filterType;
            const matchLabel = !filterLabel || (i.labels ?? []).includes(filterLabel);
            return matchSearch && matchPriority && matchType && matchLabel;
        });
    }, [unassignedIssues, searchQuery, filterPriority, filterType, filterLabel]);

    const activeFilterCount = [filterPriority, filterType, filterLabel].filter(Boolean).length;
    const clearFilters = () => { setFilterPriority(''); setFilterType(''); setFilterLabel(''); };

    const calculateScores = useCallback((issueToCalc: string) => {
        setIsCalculating(true);
        setRecommendations([]);
        setAppliedWeights(null);
        setTaskType(null);
        setCalcError(null);

        api.post('/api/recommendations', { issue_key: issueToCalc, lang })
            .then(res => {
                setRecommendations(res.data.recommendations);
                setAppliedWeights(res.data.applied_weights);
                setTaskType(res.data.task_type);
            })
            .catch(err => {
                console.error('Failed to calculate', err);
                setCalcError(err.response?.data?.detail || 'Failed to calculate AI scores.');
            })
            .finally(() => setIsCalculating(false));
    }, [lang]);

    const handleSelectIssue = (key: string) => {
        setSelectedIssue(key);
    };

    if (!projectsLoading && projects.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background relative overflow-hidden">
                {/* Decorative background elements */}
                <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center max-w-md text-center animate-in fade-in zoom-in duration-700">
                    <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center mb-8 rotate-3 shadow-xl shadow-primary/5 border border-primary/20">
                        <FolderKanban size={48} className="text-primary -rotate-3" />
                    </div>
                    
                    <h2 className="text-3xl font-extrabold tracking-tight text-foreground mb-4">
                        {lang === 'tr' ? 'Henüz bir projeniz yok' : 'No projects yet'}
                    </h2>
                    
                    <p className="text-base text-muted-foreground mb-10 leading-relaxed">
                        {lang === 'tr' 
                            ? 'Yapay zeka destekli atama asistanını kullanmaya başlamak için ilk projenizi ekleyin.' 
                            : 'Add your first project to start using the AI-powered assignment assistant.'}
                    </p>
                    
                    <button
                        onClick={() => navigate('/projects?add=true')}
                        className="group flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-lg shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all active:scale-95"
                    >
                        <Plus size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                        {lang === 'tr' ? 'Yeni Proje Ekle' : 'Add New Project'}
                    </button>

                    <div className="mt-12 flex items-center gap-6 text-muted-foreground/40">
                         <div className="flex items-center gap-2">
                             <Zap size={14} />
                             <span className="text-xs font-medium italic">AI Optimized</span>
                         </div>
                         <div className="w-1 h-1 rounded-full bg-border" />
                         <div className="flex items-center gap-2">
                             <SlidersHorizontal size={14} />
                             <span className="text-xs font-medium italic">Jira Integrated</span>
                         </div>
                    </div>
                </div>
            </div>
        );
    }

    useEffect(() => {
        if (selectedIssue) {
            calculateScores(selectedIssue);
        }
    }, [selectedIssue, calculateScores]);

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">

            {/* ── Page header ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
                <div>
                    <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
                        <Zap size={18} className="text-primary" /> {td.title}
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">AI-powered Jira issue assignment</p>
                </div>
                <span className="bg-secondary text-secondary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    {filteredIssues.length} / {unassignedIssues.length} {td.issues}
                </span>
            </div>

            {/* ── 3 Resizable columns ── */}
            <div
                ref={containerRef}
                className="flex-1 overflow-hidden grid divide-x divide-border relative group/outer"
                style={{ gridTemplateColumns: `${queueWidth}px 1fr` }}
            >

                {/* ════ LEFT — Issue Queue ════ */}
                <div className="flex flex-col overflow-hidden bg-background">

                    {/* Search + filter toggle */}
                    <div className="px-3 pt-3 pb-2 border-b border-border bg-card shrink-0 space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder={td.searchPlaceholder}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-8 pr-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                                />
                            </div>
                            <button
                                onClick={() => setShowFilters(v => !v)}
                                className={`relative shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${showFilters || activeFilterCount > 0
                                    ? 'bg-primary/10 border-primary/40 text-primary'
                                    : 'bg-muted/30 border-border text-muted-foreground hover:border-primary/30'
                                    }`}
                            >
                                <SlidersHorizontal size={13} />
                                Filters
                                {activeFilterCount > 0 && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[10px] font-bold flex items-center justify-center text-primary-foreground">
                                        {activeFilterCount}
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* Filter pills row */}
                        {showFilters && (
                            <div className="flex flex-wrap gap-1.5 items-center pt-1">
                                <FilterSelect label="Priority" options={allPriorities} value={filterPriority} onChange={setFilterPriority} />
                                <FilterSelect label="Type" options={allTypes} value={filterType} onChange={setFilterType} />
                                {allLabels.length > 0 && (
                                    <FilterSelect label="Label" options={allLabels} value={filterLabel} onChange={setFilterLabel} />
                                )}
                                {activeFilterCount > 0 && (
                                    <button
                                        onClick={clearFilters}
                                        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-destructive transition-colors"
                                    >
                                        <X size={11} /> Clear
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Issue list */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {loading && (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground text-sm p-8">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                <span>{td.loading || 'Fetching Jira tickets...'}</span>
                            </div>
                        )}
                        {error && (
                            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                <svg className="w-10 h-10 mb-3 text-destructive/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                </svg>
                                <p className="text-sm text-muted-foreground">{error}</p>
                                {error === td.jiraNotConfigured && (
                                    <button
                                        onClick={() => window.location.href = '/projects'}
                                        className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-xs font-bold hover:opacity-90 transition-opacity shadow-sm"
                                    >
                                        Configure Project Integration
                                    </button>
                                )}
                            </div>
                        )}
                        {!loading && !error && unassignedIssues.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                <svg className="w-10 h-10 mb-3 text-green-500/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <h3 className="text-sm font-semibold text-foreground mb-1">{td.allClear}</h3>
                                <p className="text-xs text-muted-foreground">{td.noUnassigned}</p>
                            </div>
                        )}
                        {!loading && !error && filteredIssues.length === 0 && unassignedIssues.length > 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                                <SlidersHorizontal className="w-8 h-8 mb-2 text-muted-foreground/30" />
                                <p className="text-sm text-muted-foreground">{td.noIssuesMatchFilters}</p>
                                <button onClick={clearFilters} className="mt-2 text-xs text-primary hover:underline">{td.clearFilters}</button>
                            </div>
                        )}

                        {/* ── Compact issue cards ── */}
                        <div className="p-2 space-y-1">
                            {filteredIssues.map(issue => {
                                const typeStyle = TYPE_STYLE[issue.type] ?? DEFAULT_TYPE;
                                const isSelected = selectedIssue === issue.key;

                                return (
                                    <div
                                        key={issue.key}
                                        onClick={() => handleSelectIssue(issue.key)}
                                        className={`group relative flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all duration-150 rounded-lg border ${isSelected
                                            ? 'bg-primary/5 border-primary/60 shadow-sm shadow-primary/5'
                                            : 'bg-card border-transparent hover:bg-muted/40 hover:border-border/60'
                                            }`}
                                    >
                                        {/* Selection indicator */}
                                        {isSelected && (
                                            <>
                                                <button onClick={() => calculateScores(selectedIssue!)} disabled={isCalculating} className="p-2 hover:bg-primary/10 rounded-md text-primary transition-all shadow-sm active:scale-95 disabled:opacity-50">
                                                    <Sparkles size={18} />
                                                </button>
                                            </>
                                        )}
                                        <span className={`text-[10px] font-bold tracking-wide shrink-0 font-mono ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                                            {issue.key}
                                        </span>

                                        {/* Summary */}
                                        <span className={`text-[13px] truncate leading-tight transition-colors ${isSelected ? 'text-foreground font-medium' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                            {issue.summary}
                                        </span>

                                        <div className="ml-auto flex items-center gap-2 shrink-0">
                                            {/* Priority badge */}
                                            <span className={`text-[9px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded ${PRIORITY_STYLE[issue.priority]?.bg || DEFAULT_PRIORITY.bg} ${PRIORITY_STYLE[issue.priority]?.color || DEFAULT_PRIORITY.color}`}>
                                                {issue.priority}
                                            </span>

                                            {/* Type badge */}
                                            <span className={`text-[9px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded ${typeStyle.bg} ${typeStyle.color}`}>
                                                {issue.type}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Left Resizer Handle */}
                <div
                    onMouseDown={handleMouseDownLeft}
                    className={`absolute z-20 w-1 h-full cursor-col-resize flex items-center justify-center group/handle transition-colors ${isResizingLeft ? 'bg-primary/20' : 'hover:bg-primary/10'}`}
                    style={{ left: `${queueWidth - 2}px` }}
                >
                    <div className={`w-[2px] h-full transition-colors ${isResizingLeft ? 'bg-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]' : 'bg-transparent group-hover/handle:bg-primary/40'}`} />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded p-0.5 opacity-0 group-hover/handle:opacity-100 transition-opacity pointer-events-none">
                        <GripVertical size={10} className="text-muted-foreground" />
                    </div>
                </div>

                {/* ════ MIDDLE — AI Recommendations ════ */}
                <div className="flex flex-col overflow-hidden bg-card">
                    {selectedIssue ? (
                        recommendations.length > 0 ? (
                                <RecommendationPanel
                                    issueKey={selectedIssue}
                                    recommendations={recommendations}
                                    priority={unassignedIssues.find(i => i.key === selectedIssue)?.priority}
                                    appliedWeights={appliedWeights}
                                    onAssignSuccess={() => {
                                        setSelectedIssue(null);
                                        setRecommendations([]);
                                        setUnassignedIssues(prev => prev.filter(i => i.key !== selectedIssue));
                                    }}
                                    onOpenMatrix={() => setShowMatrix(true)}
                                />
                        ) : isCalculating ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-card">
                                <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin mb-6" />
                                <h3 className="text-xl font-bold text-foreground mb-2">{td.analyzing}</h3>
                                <p className="text-sm text-muted-foreground max-w-md">{td.analyzingSub}</p>
                            </div>
                        ) : calcError ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-card">
                                <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
                                    <X className="text-destructive" size={40} />
                                </div>
                                <h3 className="text-xl font-bold text-foreground mb-2">{td.calculationFailed}</h3>
                                <p className="text-sm text-muted-foreground mb-6 max-w-md">{calcError}</p>
                                <button
                                    onClick={() => calculateScores(selectedIssue!)}
                                    className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-all shadow-sm"
                                >
                                    Try Again
                                </button>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-card">
                                <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mb-6">
                                    <Sparkles className="text-primary" size={40} />
                                </div>
                                <h3 className="text-xl font-bold text-foreground mb-2">{td.noCandidatesFound}</h3>
                                <p className="text-sm text-muted-foreground mb-8 max-w-md">{td.noCandidatesHint}</p>
                                <button
                                    onClick={() => calculateScores(selectedIssue!)}
                                    className="px-6 py-2 border border-primary/30 text-primary rounded-lg font-semibold hover:bg-primary/5 transition-all"
                                >
                                    Force Recalculate
                                </button>
                            </div>
                        )
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                            <svg className="w-14 h-14 mb-4 text-muted-foreground/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <h3 className="text-base font-semibold text-foreground mb-1">{td.noIssueSelected}</h3>
                            <p className="text-sm max-w-xs">{td.noIssueHint}</p>
                        </div>
                    )}
                </div>

                {/* ════ RIGHT — All Users Score Matrix (DRAWER) ════ */}
                {showMatrix && (
                    <div className="fixed inset-0 z-50 flex justify-end">
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setShowMatrix(false)} />
                        <div className="relative w-full max-w-4xl h-full bg-card shadow-2xl border-l border-border flex flex-col pt-4 animate-slide-in-right">
                            <button
                                onClick={() => setShowMatrix(false)}
                                className="absolute top-4 right-4 p-2 rounded-md hover:bg-muted text-muted-foreground transition-colors z-10"
                            >
                                <X size={20} />
                            </button>
                            <AllUsersTestingPanel
                                recommendations={recommendations}
                                appliedWeights={appliedWeights}
                                taskType={taskType}
                                selectedIssue={selectedIssue ? unassignedIssues.find(i => i.key === selectedIssue) || null : null}
                            />
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
