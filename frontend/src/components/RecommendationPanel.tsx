import { useState } from 'react';
import api from '../api';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { UserCheck, Star, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../LanguageContext.tsx';

export interface RecommendationType {
    user_id: string;
    display_name: string;
    total_score: number;
    expertise_score: number;
    workload_score: number;
    success_rate_score: number;
    category_experience_score: number;
    recent_activity_score: number;
    primary_label: string;
    secondary_label: string;
    is_eligible: boolean;
    filtered_reason: string | null;
    task_type: string;
    reasoning_data: {
        text: string;
        contributions: Record<string, number>;
    } | null;
    warnings?: string[];
}

interface RecommendationPanelProps {
    issueKey: string;
    recommendations: RecommendationType[];
    priority?: string;
    appliedWeights: Record<string, number> | null;
    onAssignSuccess?: () => void;
    onOpenMatrix?: () => void;
}

export default function RecommendationPanel({ issueKey, recommendations, priority, appliedWeights, onAssignSuccess, onOpenMatrix }: RecommendationPanelProps) {
    const { t } = useLanguage();
    const tr = t.recommendation;

    const [assigning, setAssigning] = useState<string | null>(null);

    const handleAssign = async (userId: string) => {
        setAssigning(userId);
        try {
            await api.post('/api/assign', {
                issue_id: issueKey,
                user_id: userId
            });
            alert(`Successfully assigned ${issueKey}!`);
            if (onAssignSuccess) onAssignSuccess();
        } catch (err) {
            console.error("Assignment failed", err);
            alert("Failed to assign ticket.");
        } finally {
            setAssigning(null);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background overflow-y-auto">

            {/* HEADER */}
            <div className="p-6 border-b border-border bg-card">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
                            <SparklesIcon className="text-primary" />
                            {tr.title} {issueKey}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">{tr.subtitle}</p>
                    </div>
                    {priority && (
                        <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full border border-primary/20">
                            {priority}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex-1 p-6 space-y-4 overflow-y-auto custom-scrollbar w-full">

                {recommendations.map((rec, idx) => (
                    <div key={rec.user_id} className={`p-6 rounded-2xl border-2 relative transition-all duration-300 ${!rec.is_eligible ? 'opacity-50 grayscale bg-muted/30 border-dashed' :
                        idx === 0 ? 'bg-primary/5 border-primary shadow-lg shadow-primary/5 ring-1 ring-primary/10' : 'bg-card border-border/60 hover:border-primary/20 hover:shadow-md'
                        }`}>

                        {rec.is_eligible && idx === 0 && (
                            <div className="absolute top-0 right-6 -translate-y-1/2 bg-primary text-primary-foreground text-[10px] font-bold px-4 py-1 rounded-full shadow-lg shadow-primary/20 uppercase tracking-widest">
                                {tr.topMatch}
                            </div>
                        )}
                        
                        <div className="flex justify-between items-start gap-4">
                            <div className="flex items-center gap-5">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shadow-inner transition-transform group-hover:scale-105 ${!rec.is_eligible ? 'bg-muted text-muted-foreground' : idx === 0 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                                    {rec.display_name.charAt(0)}
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="font-bold text-xl tracking-tight text-foreground">
                                            {rec.display_name}
                                        </h3>
                                        {rec.is_eligible && (
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg shadow-sm ${rec.task_type === 'specialist' ? 'bg-indigo-500 text-white' : 'bg-emerald-500 text-white'}`}>
                                                {rec.task_type === 'specialist' ? tr.specialistTask : tr.generalTask}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                        {rec.primary_label && (
                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted text-muted-foreground border border-border/50 uppercase tracking-wider">
                                                {rec.primary_label}
                                            </span>
                                        )}
                                        {rec.secondary_label && (
                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted/50 text-muted-foreground border border-border/30 uppercase tracking-wider">
                                                {rec.secondary_label}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs font-bold mt-3">
                                        {rec.is_eligible ? (
                                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                                                <Star size={13} className="fill-current" />
                                                <span>{(rec.total_score).toFixed(1)} {tr.aiMatch}</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                                                <AlertTriangle size={13} />
                                                <span>{tr.notEligible}</span>
                                            </div>
                                        )}
                                        {rec.is_eligible && onOpenMatrix && (
                                            <button 
                                                onClick={onOpenMatrix} 
                                                className="px-3 py-1 text-[10px] font-bold rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 hover:bg-blue-500/20 transition-colors uppercase tracking-widest flex items-center gap-1"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                                {tr.seeDetailedData || "See detailed data"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => handleAssign(rec.user_id)}
                                disabled={assigning === rec.user_id || !rec.is_eligible}
                                className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm ${!rec.is_eligible 
                                    ? 'bg-muted text-muted-foreground cursor-not-allowed border border-border/50' 
                                    : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50'
                                }`}
                            >
                                {assigning === rec.user_id ? (
                                    <span className="flex items-center gap-2">
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                        {tr.assigning}
                                    </span>
                                ) : <><UserCheck size={18} /> {tr.assign}</>}
                            </button>
                        </div>

                        {!rec.is_eligible && rec.filtered_reason && (
                            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md flex items-start gap-2">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                <p>{rec.filtered_reason}</p>
                            </div>
                        )}

                        {rec.is_eligible && rec.warnings && rec.warnings.length > 0 && (
                            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500 text-sm rounded-md flex items-start gap-2">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                <div className="flex flex-col gap-1">
                                    {rec.warnings.map((w, i) => (
                                        <p key={i}>{w}</p>
                                    ))}
                                </div>
                            </div>
                        )}

                        {rec.is_eligible && idx === 0 && rec.reasoning_data && (
                            <div className="mt-4 p-4 bg-primary/5 border-l-4 border-l-primary rounded-r-lg text-sm shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                    <SparklesIcon size={64} />
                                </div>
                                <h4 className="font-bold text-xs text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <SparklesIcon size={14} /> {tr.aiReasoning}
                                </h4>
                                <p className="whitespace-pre-wrap leading-relaxed font-medium text-foreground/85">
                                    {rec.reasoning_data.text}
                                </p>
                            </div>
                        )}

                        {rec.is_eligible && (
                            <div className="flex items-center mt-6">
                                <div className="h-[220px] min-h-[220px] w-full flex-1 relative group/chart">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={[
                                            { subject: 'Match', A: rec.expertise_score * (appliedWeights?.expertise || 0), fullMark: 100 },
                                            { subject: 'Capacity', A: rec.workload_score * (appliedWeights?.workload || 0), fullMark: 100 },
                                            { subject: 'Reliability', A: rec.success_rate_score * (appliedWeights?.success_rate || 0), fullMark: 100 },
                                            { subject: 'Domain', A: rec.category_experience_score * (appliedWeights?.category_experience || 0), fullMark: 100 },
                                            { subject: 'Momentum', A: rec.recent_activity_score * (appliedWeights?.recent_activity || 0), fullMark: 100 },
                                        ]}>
                                            <PolarGrid stroke="hsl(var(--muted-foreground))" strokeOpacity={0.1} />
                                            <PolarAngleAxis dataKey="subject" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontWeight: 600 }} />
                                            
                                            {/* Weighted Contribution Radar */}
                                            <Radar
                                                name="Weighted Contribution"
                                                dataKey="A"
                                                stroke={idx === 0 ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                                                strokeWidth={2}
                                                fill={idx === 0 ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                                                fillOpacity={0.4}
                                            />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                    <div className="absolute bottom-0 left-0 flex gap-4 text-[9px] font-bold text-muted-foreground uppercase tracking-widest pl-4">
                                        <div className="flex items-center gap-1.5">
                                            <div className={`w-2.5 h-2.5 border ${idx === 0 ? 'bg-primary/40 border-primary' : 'bg-muted/40 border-muted-foreground/30'}`} /> 
                                            Weighted Match Contribution
                                        </div>
                                    </div>
                                </div>

                                {idx === 0 && rec.reasoning_data && (
                                    <div className="w-1/3 pl-4 space-y-2 border-l border-border/50">
                                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-2">{tr.decisionImpact}</p>
                                        {Object.entries(rec.reasoning_data.contributions)
                                            .sort(([, a], [, b]) => (b as number) - (a as number))
                                            .slice(0, 4)
                                            .map(([key, val]) => {
                                                const labelMap: Record<string, string> = {
                                                    expertise_score: 'Match',
                                                    workload_score: 'Capacity',
                                                    success_rate_score: 'Reliability',
                                                    category_experience_score: 'Domain',
                                                    recent_activity_score: 'Momentum'
                                                };
                                                const cleanKey = labelMap[key] || key.split('_')[0];
                                                const weightKey = key.replace('_score', '');
                                                const weightVal = appliedWeights ? (appliedWeights[weightKey] || 0).toFixed(2) : '-';
                                                
                                                return (
                                                    <div key={key} className="flex flex-col gap-0.5">
                                                        <div className="flex justify-between items-center text-xs">
                                                            <span className="text-muted-foreground truncate pr-2 max-w-[80px]" title={cleanKey}>
                                                                {cleanKey}
                                                            </span>
                                                            <span className="font-bold text-foreground">%{val}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-[9px] text-muted-foreground/60 font-medium">
                                                            <span>Weight</span>
                                                            <span className="tabular-nums">{weightVal}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}

            </div>
        </div>
    );
}

function SparklesIcon(props: any) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            <path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" />
        </svg>
    );
}
