import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export const ADV_DEFAULTS = {
    w_expertise: 0.35, w_workload: 0.30, w_success_rate: 0.05,
    w_category_experience: 0.15, w_recent_activity: 0.15,
    expertise_nlp_weight: 0.60, expertise_label_weight: 0.40,
    workload_task_saturation: 10, workload_sp_saturation: 20,
    success_deadline_weight: 0.70, success_reopen_weight: 0.30,
    activity_window_days: 14, activity_neutral_score: 50,
    leave_label: "izin",
    leave_threshold_days: 15, leave_window_days: 30, leave_exclude_weekends: true,
};

interface WeightsEditorProps {
    advSettings: typeof ADV_DEFAULTS;
    setAdvSettings: (settings: any) => void;
    advSettingsRef: React.MutableRefObject<any>;
    isDirtyRef: React.MutableRefObject<boolean>;
    tc: any;
}

const WeightsEditor = ({ advSettings, setAdvSettings, advSettingsRef, isDirtyRef, tc }: WeightsEditorProps) => {
    const [expandedCriteria, setExpandedCriteria] = useState<Record<string, boolean>>({});

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                    { key: 'w_expertise', label: tc.criterionLabels.expertise, hasExtra: true, extraKey: 'expertise' },
                    { key: 'w_workload', label: tc.criterionLabels.workload, hasExtra: true, extraKey: 'workload' },
                    { key: 'w_success_rate', label: tc.criterionLabels.success_rate, hasExtra: true, extraKey: 'success_rate' },
                    { key: 'w_category_experience', label: tc.criterionLabels.category_experience, hasExtra: false, extraKey: '' },
                    { key: 'w_recent_activity', label: tc.criterionLabels.recent_activity, hasExtra: true, extraKey: 'recent_activity' },
                ] as const).map(({ key, label, hasExtra, extraKey }) => {
                    const val = (advSettings as any)[key] as number;
                    return (
                        <div key={key} className="bg-muted/30 rounded-xl border border-border p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-foreground">{label}</label>
                                <span className="text-xs font-mono font-bold text-primary">{(val * 100).toFixed(0)}%</span>
                            </div>
                            <input type="range" min="0" max="100" value={val * 100}
                                onChange={e => {
                                    const newRaw = parseInt(e.target.value);
                                    setAdvSettings((prev: any) => {
                                        const updated = { ...prev, [key]: newRaw / 100 };
                                        const otherKeys = ['w_expertise', 'w_workload', 'w_success_rate', 'w_category_experience', 'w_recent_activity'].filter(k => k !== key);
                                        const otherSum = otherKeys.reduce((s, k) => s + (prev[k] as number), 0);
                                        const remaining = 1.0 - newRaw / 100;
                                        if (otherSum > 0) {
                                            otherKeys.forEach(k => {
                                                (updated as any)[k] = parseFloat((((prev[k] as number) / otherSum) * remaining).toFixed(4));
                                            });
                                        } else {
                                            otherKeys.forEach(k => {
                                                (updated as any)[k] = parseFloat((remaining / otherKeys.length).toFixed(4));
                                            });
                                        }
                                        isDirtyRef.current = true;
                                        advSettingsRef.current = updated;
                                        return updated;
                                    });
                                }}
                                className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                            />

                            {hasExtra && (
                                <div className="pt-1">
                                    <button type="button" onClick={() => setExpandedCriteria(prev => ({ ...prev, [extraKey]: !prev[extraKey] }))} className="text-xs font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-colors">
                                        {expandedCriteria[extraKey as keyof typeof expandedCriteria] ? <ChevronDown size={10} /> : <ChevronRight size={10} />} {tc.extraSettings}
                                    </button>
                                    {expandedCriteria[extraKey as keyof typeof expandedCriteria] && extraKey === 'expertise' && (
                                        <div className="mt-2 pl-3 border-l-2 border-amber-500/30 space-y-3 animate-in slide-in-from-top-1 fade-in duration-150">
                                            <p className="text-xs text-muted-foreground">{tc.advExpertiseDesc}</p>
                                            <div className="grid grid-cols-1 gap-3">
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-sm uppercase font-bold text-muted-foreground tracking-wider">{tc.advNlpWeight}</label>
                                                        <span className="text-xs font-mono font-bold text-amber-500">{advSettings.expertise_nlp_weight.toFixed(2)}</span>
                                                    </div>
                                                    <input type="range" min="0" max="100" value={advSettings.expertise_nlp_weight * 100} onChange={e => {
                                                        const v = parseInt(e.target.value) / 100;
                                                        setAdvSettings((s: any) => {
                                                            const next = { ...s, expertise_nlp_weight: v, expertise_label_weight: parseFloat((1 - v).toFixed(2)) };
                                                            advSettingsRef.current = next;
                                                            isDirtyRef.current = true;
                                                            return next;
                                                        });
                                                    }} className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-amber-500" />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-sm uppercase font-bold text-muted-foreground tracking-wider">{tc.advLabelWeight}</label>
                                                        <span className="text-xs font-mono font-bold text-amber-500">{advSettings.expertise_label_weight.toFixed(2)}</span>
                                                    </div>
                                                    <input type="range" min="0" max="100" value={advSettings.expertise_label_weight * 100} onChange={e => {
                                                        const v = parseInt(e.target.value) / 100;
                                                        setAdvSettings((s: any) => {
                                                            const next = { ...s, expertise_label_weight: v, expertise_nlp_weight: parseFloat((1 - v).toFixed(2)) };
                                                            advSettingsRef.current = next;
                                                            isDirtyRef.current = true;
                                                            return next;
                                                        });
                                                    }} className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-amber-500" />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {expandedCriteria[extraKey as keyof typeof expandedCriteria] && extraKey === 'workload' && (
                                        <div className="mt-2 pl-3 border-l-2 border-amber-500/30 space-y-3 animate-in slide-in-from-top-1 fade-in duration-150">
                                            <p className="text-xs text-muted-foreground">{tc.advWorkloadDesc}</p>
                                            <div className="grid grid-cols-1 gap-3">
                                                <div className="space-y-1 text-right">
                                                    <label className="text-sm uppercase font-bold text-muted-foreground tracking-wider block text-left mb-1">{tc.advTaskSat}</label>
                                                    <input type="number" min="1" max="50" value={advSettings.workload_task_saturation} onChange={e => {
                                                        const v = Math.max(1, parseInt(e.target.value) || 1);
                                                        setAdvSettings((s: any) => {
                                                            const next = { ...s, workload_task_saturation: v };
                                                            advSettingsRef.current = next;
                                                            isDirtyRef.current = true;
                                                            return next;
                                                        });
                                                    }} className="w-full h-8 rounded-lg border border-border bg-muted/10 px-2 text-xs font-mono focus:ring-1 focus:ring-amber-500/30 outline-none transition-all" />
                                                </div>
                                                <div className="space-y-1 text-right">
                                                    <label className="text-sm uppercase font-bold text-muted-foreground tracking-wider block text-left mb-1">{tc.advSpSat}</label>
                                                    <input type="number" min="1" max="100" value={advSettings.workload_sp_saturation} onChange={e => {
                                                        const v = Math.max(1, parseInt(e.target.value) || 1);
                                                        setAdvSettings((s: any) => {
                                                            const next = { ...s, workload_sp_saturation: v };
                                                            advSettingsRef.current = next;
                                                            isDirtyRef.current = true;
                                                            return next;
                                                        });
                                                    }} className="w-full h-8 rounded-lg border border-border bg-muted/10 px-2 text-xs font-mono focus:ring-1 focus:ring-amber-500/30 outline-none transition-all" />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {expandedCriteria[extraKey as keyof typeof expandedCriteria] && extraKey === 'success_rate' && (
                                        <div className="mt-2 pl-3 border-l-2 border-amber-500/30 space-y-3 animate-in slide-in-from-top-1 fade-in duration-150">
                                            <p className="text-xs text-muted-foreground">{tc.advSuccessDesc}</p>
                                            <div className="grid grid-cols-1 gap-3">
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-sm uppercase font-bold text-muted-foreground tracking-wider">{tc.advDeadlineWeight}</label>
                                                        <span className="text-xs font-mono font-bold text-amber-500">{advSettings.success_deadline_weight.toFixed(2)}</span>
                                                    </div>
                                                    <input type="range" min="0" max="100" value={advSettings.success_deadline_weight * 100} onChange={e => {
                                                        const v = parseInt(e.target.value) / 100;
                                                        setAdvSettings((s: any) => {
                                                            const next = { ...s, success_deadline_weight: v, success_reopen_weight: parseFloat((1 - v).toFixed(2)) };
                                                            advSettingsRef.current = next;
                                                            isDirtyRef.current = true;
                                                            return next;
                                                        });
                                                    }} className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-amber-500" />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-sm uppercase font-bold text-muted-foreground tracking-wider">{tc.advReopenWeight}</label>
                                                        <span className="text-xs font-mono font-bold text-amber-500">{advSettings.success_reopen_weight.toFixed(2)}</span>
                                                    </div>
                                                    <input type="range" min="0" max="100" value={advSettings.success_reopen_weight * 100} onChange={e => {
                                                        const v = parseInt(e.target.value) / 100;
                                                        setAdvSettings((s: any) => {
                                                            const next = { ...s, success_reopen_weight: v, success_deadline_weight: parseFloat((1 - v).toFixed(2)) };
                                                            advSettingsRef.current = next;
                                                            isDirtyRef.current = true;
                                                            return next;
                                                        });
                                                    }} className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-amber-500" />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {expandedCriteria[extraKey as keyof typeof expandedCriteria] && extraKey === 'recent_activity' && (
                                        <div className="mt-2 pl-3 border-l-2 border-amber-500/30 space-y-3 animate-in slide-in-from-top-1 fade-in duration-150">
                                            <p className="text-xs text-muted-foreground">{tc.advActivityDesc}</p>
                                            <div className="grid grid-cols-1 gap-3">
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-sm uppercase font-bold text-muted-foreground tracking-wider">{tc.advActivityWindow}</label>
                                                        <span className="text-xs font-mono font-bold text-amber-500">{advSettings.activity_window_days}</span>
                                                    </div>
                                                    <input type="range" min="1" max="60" value={advSettings.activity_window_days} onChange={e => {
                                                        const v = parseInt(e.target.value);
                                                        setAdvSettings((s: any) => {
                                                            const next = { ...s, activity_window_days: v };
                                                            advSettingsRef.current = next;
                                                            isDirtyRef.current = true;
                                                            return next;
                                                        });
                                                    }} className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-amber-500" />
                                                    <p className="text-[10px] text-muted-foreground italic">{tc.advActivityWindowHint}</p>
                                                </div>
                                                <div className="space-y-1 text-right">
                                                    <label className="text-sm uppercase font-bold text-muted-foreground tracking-wider block text-left mb-1">{tc.advActivityNeutral || 'Neutral activity score (0-100)'}</label>
                                                    <input type="number" min="0" max="100" value={advSettings.activity_neutral_score} onChange={e => {
                                                        const v = parseInt(e.target.value) || 0;
                                                        setAdvSettings((s: any) => {
                                                            const next = { ...s, activity_neutral_score: v };
                                                            advSettingsRef.current = next;
                                                            isDirtyRef.current = true;
                                                            return next;
                                                        });
                                                    }} className="w-full h-8 rounded-lg border border-border bg-muted/10 px-2 text-xs font-mono focus:ring-1 focus:ring-amber-500/30 outline-none transition-all" />
                                                </div>

                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WeightsEditor;
