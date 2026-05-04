import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { AlertCircle, AlertTriangle, CheckCircle2, Tag, X, Search, Activity, Plus, FolderX, LayoutDashboard, Trash2, Globe, RotateCcw, Clock, Loader2 } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { useProject } from '../ProjectContext';
import WeightsEditor, { ADV_DEFAULTS } from './WeightsEditor';
import ProjectWizard from './ProjectWizard';
import { TagManager } from './TagManager';

export default function ProjectsPage() {
    const { t } = useLanguage();
    const tc = t.config;
    const { projects, activeProject, setActiveProject, refreshProjects } = useProject();

    // Auto-open Wizard if URL has ?add=true
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('add') === 'true') {
            setShowAddProjectModal(true);
            // Clean up URL without reload to avoid re-opening on refresh
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, []);

    // REFS for Auto-save
    const formDataRef = useRef<any>(null);
    const advSettingsRef = useRef<any>(null);
    const activeProjectRef = useRef<string | null>(null);
    const isDirtyRef = useRef(false);
    const isSavingRef = useRef(false);

    // UI state for dirty flag
    const [isDirty, setIsDirty] = useState(false);
    useEffect(() => {
        const t = setInterval(() => setIsDirty(isDirtyRef.current), 100);
        return () => clearInterval(t);
    }, []);

    const [loading, setLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [projectTab, setProjectTab] = useState<'general' | 'credentials' | 'sync' | 'leave'>('general');

    // PROJECT SETTINGS STATE
    const [formData, setFormData] = useState({
        key: '',
        name: '',
        server_url: '',
        user_email: '',
        api_token: '',
        active_strategy: 'BALANCED',
        override_labels: '',
        scheduler_enabled: false,
        daily_sync_enabled: true,
        weekly_sync_enabled: true,
        monthly_sync_enabled: true
    });
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'warning', message: string } | null>(null);

    // NEW PROJECT / DELETE PROJECT
    const [showAddProjectModal, setShowAddProjectModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
    const [deletePassword, setDeletePassword] = useState('');

    // LABELS STATE
    const [allLabels, setAllLabels] = useState<string[]>([]);

    // ADVANCED STRATEGY STATE
    const [advSettings, setAdvSettings] = useState(ADV_DEFAULTS);

    // SYNC STATE
    const [savingSettings, setSavingSettings] = useState(false);
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [pendingSyncMode, setPendingSyncMode] = useState('daily');
    const [syncStatus, setSyncStatus] = useState<any>(null);

    // SCHEDULER STATE
    const [schedulerStatus, setSchedulerStatus] = useState<any>(null);

    // ACTIVE PROJECT LOAD
    useEffect(() => {
        if (!activeProject) {
            const resetData = {
                key: '',
                name: '',
                server_url: '',
                user_email: '',
                api_token: '',
                active_strategy: 'BALANCED',
                override_labels: 'documentation,general,minor-bug,typo',
                scheduler_enabled: false,
                daily_sync_enabled: true,
                weekly_sync_enabled: true,
                monthly_sync_enabled: true
            };
            setFormData(resetData);
            formDataRef.current = resetData;
            setStatus(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        activeProjectRef.current = activeProject;

        // Advanced Settings, Labels & Scheduler
        Promise.all([
            api.get(`/api/projects/${activeProject}`),
            api.get('/api/settings/advanced', { headers: { 'x-project-key': activeProject } }),
            api.get('/api/jira/labels', { headers: { 'x-project-key': activeProject } }),
            api.get('/api/scheduler/status', { headers: { 'x-project-key': activeProject } })
        ]).then(([res, advRes, labelsRes, schedRes]) => {
            setFormData({
                key: activeProject,
                name: res.data.name || '',
                server_url: res.data.server_url || '',
                user_email: res.data.user_email || '',
                api_token: res.data.has_token ? '********' : '',
                active_strategy: res.data.active_strategy || 'BALANCED',
                override_labels: res.data.override_labels || '',
                scheduler_enabled: res.data.scheduler_enabled || false,
                daily_sync_enabled: res.data.daily_sync_enabled ?? true,
                weekly_sync_enabled: res.data.weekly_sync_enabled ?? true,
                monthly_sync_enabled: res.data.monthly_sync_enabled ?? true,
            });
            formDataRef.current = {
                key: activeProject,
                name: res.data.name || '',
                server_url: res.data.server_url || '',
                user_email: res.data.user_email || '',
                api_token: res.data.has_token ? '********' : '',
                active_strategy: res.data.active_strategy || 'BALANCED',
                override_labels: res.data.override_labels || '',
                scheduler_enabled: res.data.scheduler_enabled || false,
                daily_sync_enabled: res.data.daily_sync_enabled ?? true,
                weekly_sync_enabled: res.data.weekly_sync_enabled ?? true,
                monthly_sync_enabled: res.data.monthly_sync_enabled ?? true,
            };
            setAdvSettings(advRes.data);
            advSettingsRef.current = advRes.data;
            setAllLabels(labelsRes.data);
            setSchedulerStatus(schedRes.data);
            isDirtyRef.current = false;
        }).catch(err => {
            console.error("Failed to load project details", err);
        }).finally(() => {
            setLoading(false);
        });

    }, [activeProject]);

    useEffect(() => {
        if (!activeProject) return;
        let interval: any;
        const checkStatus = async () => {
            try {
                const res = await api.get(`/api/projects/${activeProject}/sync-status`);
                setSyncStatus(res.data);
                const stat = res.data?.status;
                if (stat === 'running' || stat === 'fetching_jira' || stat === 'processing_embeddings' || stat === 'syncing_activity') {
                    if (!interval) interval = setInterval(checkStatus, 2000);
                } else {
                    if (interval) {
                        clearInterval(interval);
                        interval = null;
                        if (stat === 'completed') await refreshProjects();
                    }
                }
            } catch (err) { }
        };
        checkStatus();
        return () => { if (interval) clearInterval(interval); };
    }, [activeProject]);

    const performProjectAutoSave = async () => {
        if (!isDirtyRef.current || !activeProjectRef.current || isSavingRef.current) return;

        const projKey = activeProjectRef.current;
        const data = formDataRef.current;
        const adv = advSettingsRef.current;

        const payload: any = {
            key: projKey,
            name: data.name,
            server_url: data.server_url || '',
            user_email: data.user_email || '',
            active_strategy: data.active_strategy,
            override_labels: data.override_labels,
            scheduler_enabled: data.scheduler_enabled,
            daily_sync_enabled: data.daily_sync_enabled,
            weekly_sync_enabled: data.weekly_sync_enabled,
            monthly_sync_enabled: data.monthly_sync_enabled
        };

        // Only send api_token if it was actually changed/set (not the mask)
        if (data.api_token !== '********') {
            payload.api_token = data.api_token || '';
        }

        isSavingRef.current = true;
        try {
            await api.put(`/api/projects/${projKey}`, payload);

            if (adv && Object.keys(adv).length > 0) {
                // Only sum the top-level criterion weights to check for 1.0
                const sum = (adv.w_expertise || 0) + (adv.w_workload || 0) + (adv.w_success_rate || 0) + (adv.w_category_experience || 0) + (adv.w_recent_activity || 0);
                if (Math.abs(sum - 1.0) < 0.01) {
                    await api.post('/api/settings/advanced', adv, { headers: { 'x-project-key': projKey } });
                } else {
                    console.warn("Advanced settings weights do not sum up to 1.0. Skipping save.");
                }
            }

            await refreshProjects();
            isDirtyRef.current = false;
        } catch (e) {
            console.error("Project Auto-save failed", e);
        } finally {
            isSavingRef.current = false;
        }
    };

    const handleManualSaveSettings = async () => {
        if (!activeProjectRef.current) return;
        setSavingSettings(true);
        setStatus(null);
        try {
            isDirtyRef.current = true; // force save
            await performProjectAutoSave();
            setStatus({ type: 'success', message: tc.settingsSaved || 'Settings saved successfully.' });
        } catch (e) {
            setStatus({ type: 'error', message: 'Failed to save project settings.' });
        } finally {
            setSavingSettings(false);
        }
    };



    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const next = { ...prev, [name]: value };
            formDataRef.current = next;
            return next;
        });
        isDirtyRef.current = true;

        // If it's the strategy, it used to save immediately, now it waits for manual save.
    };



    const handleDeleteProject = async () => {
        if (!activeProject) return;
        if (deleteStep === 1) {
            setDeleteStep(2);
            return;
        }

        if (!deletePassword) return;

        setIsDeleting(true);
        setStatus(null);
        try {
            await api.delete(`/api/projects/${activeProject}`, {
                data: { password: deletePassword }
            });
            await refreshProjects();
            setActiveProject(null);
            setStatus({ type: 'success', message: 'Project deleted successfully' });
            setShowDeleteModal(false);
            setDeleteStep(1);
            setDeletePassword('');
        } catch (err: any) {
            const msg = err.response?.data?.detail || 'Failed to delete project.';
            setStatus({ type: 'error', message: msg });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSyncClick = (mode: string) => {
        setPendingSyncMode(mode);
        setShowSyncModal(true);
    };

    const handleSyncConfirm = async () => {
        if (!activeProject) return;
        setStatus(null);
        
        // Optimistic UI Update: Show the bar immediately
        setSyncStatus({ 
            status: 'fetching_jira', 
            mode: pendingSyncMode, 
            current: 0, 
            total: 0, 
            eta: 'Calculating...' 
        });

        try {
            await api.post(`/api/projects/${activeProject}/sync`, { mode: pendingSyncMode });
            setStatus({ type: 'success', message: 'Sync started measuring progress in background.' });

            // Initial poll to kickstart the progress bar smoothly
            const res = await api.get(`/api/projects/${activeProject}/sync-status`);
            setSyncStatus(res.data);
        } catch (err: any) {
            setStatus({ type: 'error', message: err.response?.data?.detail || tc.syncError || 'An error occurred during sync.' });
            setSyncStatus(null);
        } finally {
            setShowSyncModal(false);
        }
    };

    const handleToggleScheduler = async (enable: boolean) => {
        setFormData(prev => {
            const next = { ...prev, scheduler_enabled: enable };
            formDataRef.current = next;
            return next;
        });
        isDirtyRef.current = true;
        // Manual save required

        try {
            const res = await api.post(`/api/scheduler/toggle?project_key=${activeProject}&enable=${enable}`);
            setSchedulerStatus(res.data);
        } catch (err) {
            console.error("Failed to toggle project scheduler", err);
        }
    };

    const handleToggleFrequency = (key: 'daily_sync_enabled' | 'weekly_sync_enabled' | 'monthly_sync_enabled') => {
        setFormData(prev => {
            const next = { ...prev, [key]: !prev[key] };
            formDataRef.current = next;
            return next;
        });
        isDirtyRef.current = true;
        // Manual save required
    };

    const overrideLabelsArray = (formData.override_labels || '').split(',').filter(l => l.trim());
    const activeProjectData = projects.find((p: any) => p.key === activeProject);

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-12">
            {projects.length === 0 ? (
                <div className="w-full flex-1 flex items-center justify-center py-20 animate-in fade-in zoom-in-95 duration-700">
                    <div className="relative p-12 bg-gradient-to-br from-slate-50 to-indigo-50/30 dark:from-slate-900 dark:to-indigo-950/30 rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-xl overflow-hidden max-w-2xl w-full text-center group">
                        {/* Decorative background shapes */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4"></div>

                        {/* Vector Illustration */}
                        <div className="relative mx-auto w-48 h-48 mb-8">
                            <div className="absolute inset-0 bg-emerald-100 dark:bg-emerald-900/30 rounded-full scale-0 group-hover:scale-100 transition-transform duration-700 ease-out origin-center opacity-50"></div>
                            <svg className="relative z-10 w-full h-full text-emerald-600/80 drop-shadow-sm" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M40 70C40 64.4772 44.4772 60 50 60H84.1421C86.7943 60 89.3381 61.0536 91.2132 62.9289L108.787 80.5025C110.662 82.3777 113.206 83.4313 115.858 83.4313H150C155.523 83.4313 160 87.9085 160 93.4313V140C160 145.523 155.523 150 150 150H50C44.4772 150 40 145.523 40 140V70Z" fill="currentColor" opacity="0.2"/>
                                <path d="M40 70C40 64.4772 44.4772 60 50 60H84.1421C86.7943 60 89.3381 61.0536 91.2132 62.9289L108.787 80.5025C110.662 82.3777 113.206 83.4313 115.858 83.4313H150C155.523 83.4313 160 87.9085 160 93.4313V140C160 145.523 155.523 150 150 150H50C44.4772 150 40 145.523 40 140V70Z" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                                <circle cx="100" cy="115" r="20" stroke="currentColor" strokeWidth="4" strokeDasharray="4 4" className="animate-[spin_10s_linear_infinite]" opacity="0.5"/>
                                <rect x="75" y="85" width="20" height="20" rx="4" fill="currentColor" className="animate-bounce" style={{animationDuration: '3s'}}/>
                                <polygon points="125,95 135,110 115,110" fill="currentColor" opacity="0.6" className="animate-pulse"/>
                            </svg>
                        </div>

                        {/* Texts */}
                        <div className="relative z-10 space-y-3 mb-10">
                            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
                                {t.projects.emptyStateTitle || "Henüz bir projeniz yok"}
                            </h2>
                            <p className="text-base md:text-lg text-slate-500 dark:text-slate-400 font-medium max-w-md mx-auto leading-relaxed">
                                {t.projects.emptyStateSub || "Jira projelerinizi entegre ederek otomatize atama ayarlarına hemen başlayın."}
                            </p>
                        </div>

                        {/* Button */}
                        <button 
                            onClick={() => setShowAddProjectModal(true)} 
                            className="relative z-10 inline-flex items-center justify-center px-8 py-4 text-base font-bold text-white transition-all bg-emerald-600 rounded-xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0"
                        >
                            <Plus size={20} className="mr-2" />
                            {t.projects.emptyStateBtn || "+ Yeni Proje Ekle"}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-8">
                    <div className="mb-2">
                        <h1 className="text-3xl font-bold tracking-tight mb-2">Projects</h1>
                        <p className="text-muted-foreground">{t.projects.subtitle}</p>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* LEFT COLUMN: PROJECT LIST */}
                <div className="lg:col-span-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold">Projects</h2>
                        <button onClick={() => setShowAddProjectModal(true)} className="px-3 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-1 transition-colors shadow-sm">
                            <Plus size={14} /> Add Project
                        </button>
                    </div>

                    {false ? (
                        <div className="text-center py-12 px-4 border border-dashed rounded-xl bg-card">
                            <div className="flex justify-center mb-3 text-muted-foreground"><FolderX size={32} /></div>
                            <p className="text-sm text-muted-foreground">{t.projects.noProjectsHint}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {projects.map((p: any) => (
                                <div key={p.key} onClick={() => setActiveProject(p.key)} className={`cursor-pointer border rounded-xl p-4 transition-all ${activeProject === p.key ? 'border-primary border-l-4 bg-primary/5 shadow-sm' : 'border-border bg-card hover:border-primary/40'}`}>
                                    <h3 className="font-bold flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground font-mono bg-background px-1.5 py-0.5 rounded border border-border">{p.key}</span>
                                        {p.name}
                                    </h3>
                                    {!p.last_sync_date && (
                                        <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                            <AlertCircle size={10} /> Never synced
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: PROJECT DETAILS */}
                <div className="lg:col-span-8">
                    {activeProject && activeProjectData ? (
                        <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col min-h-[500px]">
                            {loading ? (
                                <div className="p-12 flex flex-col items-center justify-center space-y-4">
                                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                    <p className="text-sm text-muted-foreground">{t.projects.loadingData}</p>
                                </div>
                            ) : (
                                <>
                                    <div className="px-6 py-5 border-b border-border bg-muted/10">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-xl font-bold flex items-baseline gap-2">
                                                {activeProjectData?.name || activeProject}
                                                <span className="text-sm text-muted-foreground font-mono font-normal tracking-wide px-2 py-0.5 bg-background rounded border border-border">{activeProject}</span>
                                            </h2>
                                            <div className="flex items-center gap-3">
                                                {isDirty && (
                                                    <span className="flex items-center gap-1.5 text-amber-500 text-xs font-semibold animate-pulse border border-amber-500/20 bg-amber-500/10 px-2 py-1 rounded-md">
                                                        <AlertTriangle size={13} /> Unsaved changes
                                                    </span>
                                                )}
                                                <button onClick={() => handleSyncClick('daily')} disabled={syncStatus?.status === 'running' || syncStatus?.status === 'fetching_jira' || syncStatus?.status === 'processing_embeddings' || syncStatus?.status === 'syncing_activity'} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 transition-all">
                                                    <Globe size={14} /> Quick Sync
                                                </button>
                                                <button onClick={handleManualSaveSettings} disabled={savingSettings} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm ml-2">
                                                    {savingSettings ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} {tc.saveSettings || 'Save Settings'}
                                                </button>
                                            </div>
                                        </div>
                                        {status && (
                                            <div className={`mt-3 px-3 py-2 rounded flex items-center gap-2 text-xs font-medium border ${status.type === 'success' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                                                {status.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                                                {status.message}
                                            </div>
                                        )}
                                    </div>

                                    <div className="px-6 border-b border-border flex gap-6">
                                        <button type="button" onClick={() => setProjectTab('general')} className={`py-4 text-sm font-semibold border-b-2 transition-colors ${projectTab === 'general' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t.projects.general}</button>
                                        <button type="button" onClick={() => setProjectTab('leave')} className={`py-4 text-sm font-semibold border-b-2 transition-colors ${projectTab === 'leave' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t.projects.leaveTracking}</button>
                                        <button type="button" onClick={() => setProjectTab('sync')} className={`py-4 text-sm font-semibold border-b-2 transition-colors ${projectTab === 'sync' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t.projects.syncScheduler}</button>
                                        <button type="button" onClick={() => setProjectTab('credentials')} className={`py-4 text-sm font-semibold border-b-2 transition-colors ${projectTab === 'credentials' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t.projects.credentials}</button>
                                    </div>

                                    <form className="flex-1 flex flex-col">
                                        <div className="p-6 flex-1">
                                            {projectTab === 'general' ? (
                                                <div className="space-y-8">
                                                    {/* ... general content ... */}
                                                    <div className="space-y-2 max-w-md">
                                                        <label className="text-sm font-medium">{tc.projectName || 'Project Name'}</label>
                                                        <input
                                                            type="text" required name="name" placeholder="Project Name"
                                                            className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                            value={formData.name || ''} onChange={handleChange}
                                                        />
                                                    </div>

                                                    <div className="space-y-4">
                                                        <div>
                                                            <h3 className="text-sm font-medium">{tc.strategy}</h3>
                                                            <p className="text-xs text-muted-foreground">{tc.strategySub}</p>
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                            {(['BALANCED', 'SPEED', 'QUALITY', 'GROWTH', 'PERSONALIZED'] as const).map((id) => {
                                                                const strategy = tc.strategies[id as keyof typeof tc.strategies];
                                                                return (
                                                                    <label key={id} className={`relative flex cursor-pointer rounded-lg border bg-background p-3 hover:bg-muted/50 transition-colors ${formData.active_strategy === id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border'} ${id === 'PERSONALIZED' ? 'md:col-span-2 lg:col-span-1' : ''}`}>
                                                                        <input type="radio" name="active_strategy" value={id} className="sr-only" checked={formData.active_strategy === id} onChange={handleChange as any} />
                                                                        <span className="flex flex-col flex-1">
                                                                            <span className={`block text-sm font-bold ${formData.active_strategy === id ? 'text-primary' : 'text-foreground'}`}>{strategy?.label || id}</span>
                                                                            <span className="block text-xs opacity-60 mt-0.5 leading-relaxed">{strategy?.desc}</span>
                                                                        </span>
                                                                        {formData.active_strategy === id && <CheckCircle2 className="h-4 w-4 text-primary ml-2 shrink-0" />}
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>

                                                        {formData.active_strategy === 'PERSONALIZED' && (
                                                            <div className="mt-6 space-y-4 animate-in slide-in-from-top-1 fade-in duration-200">
                                                                <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">{t.projects.criterionWeights}</h4>
                                                                <WeightsEditor
                                                                    advSettings={advSettings}
                                                                    setAdvSettings={setAdvSettings}
                                                                    advSettingsRef={advSettingsRef}
                                                                    isDirtyRef={isDirtyRef}
                                                                    tc={tc}
                                                                />
                                                                <div className="flex items-center justify-end pt-4 border-t border-border/50">
                                                                    <button type="button" onClick={() => { setAdvSettings(ADV_DEFAULTS); isDirtyRef.current = true; }} className="text-xs font-bold text-muted-foreground hover:text-amber-500 flex items-center gap-1.5 transition-colors">
                                                                        <RotateCcw size={12} /> {tc.advResetAll}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <TagManager
                                                        title={tc.overrideLabels}
                                                        description={tc.overrideLabelsHint}
                                                        availableTags={allLabels}
                                                        selectedTags={overrideLabelsArray}
                                                        onTagsChange={(newTags) => {
                                                            const val = newTags.join(',');
                                                            setFormData((f: any) => ({ ...f, override_labels: val }));
                                                            formDataRef.current = { ...formDataRef.current, override_labels: val };
                                                            isDirtyRef.current = true;
                                                        }}
                                                        searchPlaceholder={tc.overrideLabelsPlaceholder}
                                                        libraryTitle={tc.availableLabels || 'Mevcut Etiketler'}
                                                        dropZonePlaceholder="Etiketleri buraya sürükleyin"
                                                    />
                                                </div>
                                            ) : projectTab === 'leave' ? (
                                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                    <TagManager
                                                        title={tc.advLeaveLabel || 'Leave Labels'}
                                                        description={tc.leaveLabelsHint || 'Issues with ANY of these labels will be tracked for absence check.'}
                                                        availableTags={allLabels}
                                                        selectedTags={(advSettings.leave_label || '').split(',').filter((l: string) => l.trim())}
                                                        onTagsChange={(newTags) => {
                                                            const val = newTags.join(',');
                                                            setAdvSettings((s: any) => ({ ...s, leave_label: val }));
                                                            advSettingsRef.current = { ...advSettingsRef.current, leave_label: val };
                                                            isDirtyRef.current = true;
                                                        }}
                                                        searchPlaceholder={tc.leaveLabelsPlaceholder || 'Search labels...'}
                                                        libraryTitle={tc.availableLabels || 'Mevcut Etiketler'}
                                                        dropZonePlaceholder="Etiketleri buraya sürükleyin"
                                                    />

                                                    <div className="pt-6 border-t border-border/50">
                                                        <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-widest mb-4">Thresholds & Logic</h3>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-3xl">
                                                            <div className="space-y-4">
                                                                <div className="flex justify-between items-baseline">
                                                                    <label className="text-[11px] font-bold text-foreground/70 uppercase tracking-wider">{tc.advLeaveThreshold}</label>
                                                                    <span className="text-[11px] font-mono font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">{advSettings.leave_threshold_days} days</span>
                                                                </div>
                                                                <input type="range" min="1" max="30" value={advSettings.leave_threshold_days} onChange={e => {
                                                                    const v = parseInt(e.target.value);
                                                                    setAdvSettings((s: any) => {
                                                                        const next = { ...s, leave_threshold_days: v };
                                                                        advSettingsRef.current = next;
                                                                        return next;
                                                                    });
                                                                    isDirtyRef.current = true;
                                                                }} className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-amber-500" />
                                                                <p className="text-[10px] text-muted-foreground leading-relaxed italic">{tc.advLeaveThresholdHint}</p>
                                                            </div>
                                                            <div className="space-y-4">
                                                                <div className="flex justify-between items-baseline">
                                                                    <label className="text-[11px] font-bold text-foreground/70 uppercase tracking-wider">{tc.advLeaveWindow}</label>
                                                                    <span className="text-[11px] font-mono font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">{advSettings.leave_window_days} days</span>
                                                                </div>
                                                                <input type="range" min="7" max="90" value={advSettings.leave_window_days} onChange={e => {
                                                                    const v = parseInt(e.target.value);
                                                                    setAdvSettings((s: any) => {
                                                                        const next = { ...s, leave_window_days: v };
                                                                        advSettingsRef.current = next;
                                                                        return next;
                                                                    });
                                                                    isDirtyRef.current = true;
                                                                }} className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-amber-500" />
                                                                <p className="text-[10px] text-muted-foreground leading-relaxed italic">{tc.advLeaveWindowHint}</p>
                                                            </div>

                                                            <div className="flex items-center gap-4 bg-muted/20 p-4 rounded-xl border border-border/50 md:col-span-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setAdvSettings((s: any) => {
                                                                            const next = { ...s, leave_exclude_weekends: !s.leave_exclude_weekends };
                                                                            advSettingsRef.current = next;
                                                                            return next;
                                                                        });
                                                                        isDirtyRef.current = true;
                                                                    }}
                                                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${advSettings.leave_exclude_weekends ? 'bg-amber-500' : 'bg-muted-foreground/30'}`}
                                                                >
                                                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${advSettings.leave_exclude_weekends ? 'translate-x-5' : 'translate-x-0'}`} />
                                                                </button>
                                                                <div className="space-y-0.5">
                                                                    <span className="text-sm font-bold">{tc.leaveExcludeWeekends || 'Exclude Weekends'}</span>
                                                                    <p className="text-[10px] text-muted-foreground italic">{t.projects.weekendsNotCounted}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : projectTab === 'credentials' ? (
                                                <div className="space-y-6 max-w-xl">


                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">{tc.serverUrl}</label>
                                                        <input type="url" name="server_url" placeholder="https://jira.yourcompany.com  or  https://your-domain.atlassian.net" className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={formData.server_url || ''} onChange={handleChange} />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">User Email <span className="text-xs text-muted-foreground">(Cloud: required · Server: for Basic Auth)</span></label>
                                                        <input type="email" name="user_email" placeholder="admin@example.com" className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={formData.user_email || ''} onChange={handleChange} />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">API Token / Personal Access Token</label>
                                                        <input type="password" name="api_token" placeholder="••••••••••••••••" className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono" value={formData.api_token || ''} onChange={handleChange} />
                                                        <p className="text-xs text-muted-foreground italic">{t.projects.tokenLeaveBlank}</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-8">
                                                    {/* MANUAL SYNC ACTIONS */}
                                                    <div className="bg-blue-500/5 border border-blue-500/10 p-5 rounded-xl">
                                                        <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
                                                            <Activity size={16} className="text-blue-500" />
                                                            {t.projects.manualSync}
                                                        </h3>
                                                        <p className="text-xs text-muted-foreground mb-4">{t.projects.updateLocalCache}</p>
                                                        <div className="flex gap-3">
                                                            <button type="button" onClick={() => handleSyncClick('daily')} disabled={syncStatus?.status === 'running' || syncStatus?.status === 'fetching_jira' || syncStatus?.status === 'processing_embeddings' || syncStatus?.status === 'syncing_activity'} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 transition-all shadow-sm">
                                                                <Globe size={14} /> {t.projects.dailyQuickSync}
                                                            </button>
                                                            <button type="button" onClick={() => handleSyncClick('monthly')} disabled={syncStatus?.status === 'running' || syncStatus?.status === 'fetching_jira' || syncStatus?.status === 'processing_embeddings' || syncStatus?.status === 'syncing_activity'} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold border border-blue-500/50 text-blue-600 rounded-md hover:bg-blue-500/10 disabled:opacity-50 transition-all">
                                                                <RotateCcw size={14} /> {t.projects.monthlyReconciliation}
                                                            </button>
                                                        </div>
                                                        <div className="mt-4 pt-4 border-t border-blue-500/10 flex justify-end">
                                                            <button type="button" onClick={() => handleSyncClick('full')} disabled={syncStatus?.status === 'running' || syncStatus?.status === 'fetching_jira' || syncStatus?.status === 'processing_embeddings' || syncStatus?.status === 'syncing_activity'} className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold border border-amber-500/50 text-amber-600 rounded-md hover:bg-amber-500/10 disabled:opacity-50 transition-all">
                                                                <Activity size={14} /> {t.projects.fullReEmbed}
                                                            </button>
                                                        </div>

                                                        {(syncStatus?.status === 'running' || syncStatus?.status === 'fetching_jira' || syncStatus?.status === 'processing_embeddings' || syncStatus?.status === 'syncing_activity') && (
                                                            <div className="mt-4 p-4 bg-background border border-border rounded-xl shadow-lg animate-in fade-in zoom-in duration-300">
                                                                <div className="flex justify-between items-center mb-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                                                                        <span className="text-xs font-black uppercase tracking-tight text-foreground">Syncing {syncStatus.mode || 'project'}</span>
                                                                    </div>
                                                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-muted text-muted-foreground rounded-full uppercase">
                                                                        {syncStatus.status.replace('_', ' ')}
                                                                    </span>
                                                                </div>
                                                                
                                                                <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
                                                                    <div 
                                                                        className={`absolute h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-700 ease-out shadow-[0_0_8px_rgba(59,130,246,0.5)] ${syncStatus.total === 0 ? 'w-1/3 animate-shimmer' : ''}`}
                                                                        style={{ width: syncStatus.total > 0 ? `${(syncStatus.current / syncStatus.total) * 100}%` : undefined }}
                                                                    />
                                                                </div>
                                                                
                                                                <div className="flex justify-between mt-3">
                                                                    <div className="text-[10px] font-mono font-bold text-muted-foreground">
                                                                        {syncStatus.total > 0 ? (
                                                                            <><span className="text-foreground">{syncStatus.current}</span> / {syncStatus.total} issues</>
                                                                        ) : (
                                                                            'Discovering scope...'
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                                                                        <Clock size={10} />
                                                                        <span>ETA: {syncStatus.eta || 'Calculating...'}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* AUTOMATED SCHEDULER */}
                                                    <div className="bg-emerald-500/5 border border-emerald-500/10 p-5 rounded-xl">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="flex items-center gap-2">
                                                                <Clock size={16} className="text-emerald-500" />
                                                                <h3 className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{t.projects.automatedSyncScheduler}</h3>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${schedulerStatus?.enabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                                                                    {schedulerStatus?.enabled ? t.projects.active : t.projects.disabled}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleToggleScheduler(!formData.scheduler_enabled)}
                                                                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${formData.scheduler_enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
                                                                >
                                                                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${formData.scheduler_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* GRANULAR FREQUENCY TOGGLES & JOBS */}
                                                        <div className="space-y-2 mb-6">
                                                            {[
                                                                { key: 'daily_sync_enabled', label: t.projects.dailyIncrementalSync, icon: <Clock size={14} />, jobIdPrefix: 'nightly_', freqType: 'daily' },
                                                                { key: 'weekly_sync_enabled', label: t.projects.weeklyReconciliation, icon: <RotateCcw size={14} />, jobIdPrefix: 'weekly_', freqType: 'weekly' },
                                                                { key: 'monthly_sync_enabled', label: t.projects.monthlyReEmbed, icon: <Activity size={14} />, jobIdPrefix: 'monthly_', freqType: 'monthly' }
                                                            ].map(freq => {
                                                                const isActive = formData[freq.key as keyof typeof formData];
                                                                const job = schedulerStatus?.jobs?.find((j: any) => j.id.startsWith(freq.jobIdPrefix));
                                                                
                                                                let fallbackDate = '';
                                                                if (isActive) {
                                                                    const now = new Date();
                                                                    let next = new Date(now);
                                                                    next.setHours(2, 0, 0, 0);
                                                                    if (freq.freqType === 'daily') {
                                                                        if (now.getHours() >= 2) next.setDate(next.getDate() + 1);
                                                                    } else if (freq.freqType === 'weekly') {
                                                                        const d = 7 - next.getDay();
                                                                        next.setDate(next.getDate() + (d === 0 && now.getHours() >= 2 ? 7 : d));
                                                                    } else if (freq.freqType === 'monthly') {
                                                                        if (next.getDate() > 1 || (next.getDate() === 1 && now.getHours() >= 2)) {
                                                                            next.setMonth(next.getMonth() + 1);
                                                                            next.setDate(1);
                                                                        }
                                                                    }
                                                                    fallbackDate = next.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                                                                }

                                                                return (
                                                                    <div key={freq.key} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${!formData.scheduler_enabled ? 'opacity-40 grayscale border-border bg-muted/10' : isActive ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-background'}`}>
                                                                        <div className="flex items-center gap-4">
                                                                            <button
                                                                                type="button"
                                                                                disabled={!formData.scheduler_enabled}
                                                                                onClick={() => handleToggleFrequency(freq.key as any)}
                                                                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${!formData.scheduler_enabled ? 'bg-muted-foreground/30' : isActive ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
                                                                            >
                                                                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                                                                            </button>
                                                                            <div className="flex items-center gap-2 text-foreground">
                                                                                <span className={isActive && formData.scheduler_enabled ? 'text-emerald-500' : 'text-muted-foreground'}>{freq.icon}</span>
                                                                                <span className="text-[12px] font-bold">{freq.label}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-[11px] text-muted-foreground font-mono bg-background/50 px-2 py-1 rounded border border-border/50">
                                                                            {job?.next_run ? new Date(job.next_run).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : (isActive ? fallbackDate : t.projects.notScheduled)}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>

                                                        {schedulerStatus?.last_run && (
                                                            <div className="pt-3 border-t border-border/30 flex justify-between items-center text-[10px] font-bold uppercase tracking-wider bg-background/50 p-2 rounded-lg mt-2">
                                                                <span className="text-muted-foreground">{t.projects.lastRunResult}</span>
                                                                <span className={schedulerStatus.last_run.status === 'success' ? 'text-emerald-500' : 'text-rose-500'}>
                                                                    {schedulerStatus.last_run.status === 'success' ? 'SUCCESS' : 'FAILED'} ({new Date(schedulerStatus.last_run.timestamp).toLocaleTimeString()})
                                                                </span>
                                                            </div>
                                                        )}
                                                        <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
                                                            {t.projects.automatedSyncDescription}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="px-6 py-4 border-t border-border bg-muted/10 flex items-center justify-between">
                                            <button type="button" disabled={isDeleting} onClick={() => setShowDeleteModal(true)} className="px-4 py-2 text-sm font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 hover:text-red-600 rounded-md transition-colors flex items-center gap-2 disabled:opacity-50">
                                                {isDeleting ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-500 border-t-transparent" /> : <Trash2 size={16} />}
                                                {isDeleting ? 'Deleting...' : 'Delete Project'}
                                            </button>
                                        </div>
                                    </form>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="h-full border border-dashed border-border rounded-xl bg-card flex flex-col items-center justify-center text-muted-foreground p-8 text-center min-h-[500px]">
                            <LayoutDashboard size={48} className="mb-4 opacity-30" />
                            <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                                <h3 className="text-xl font-medium mb-2">{t.projects.selectProjectTitle}</h3>
                                <p className="text-base opacity-70">{t.projects.selectProjectSub}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            </div>
            )}

            {/* MODALS */}
            {showAddProjectModal && (
                <ProjectWizard
                    onClose={() => setShowAddProjectModal(false)}
                    onComplete={() => {
                        setShowAddProjectModal(false);
                        refreshProjects();
                    }}
                />
            )}

            {showDeleteModal && activeProject && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="bg-card border border-rose-500/30 rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3 text-rose-500">
                                <div className="p-3 bg-rose-500/10 rounded-full"><AlertCircle size={24} /></div>
                                <h3 className="text-lg font-bold">
                                    {deleteStep === 1 ? (tc.deleteProject || 'Delete Project') : (tc.confirmButton || 'Confirm Deletion')}
                                </h3>
                            </div>
                            
                            {deleteStep === 1 ? (
                                <div className="space-y-4">
                                    <p className="text-sm font-medium">{t.projects.deleteConfirm} <span className="font-bold text-rose-500">{activeProjectData?.name} ({activeProject})</span>?</p>
                                    <div className="bg-rose-500/5 border border-rose-500/20 p-4 rounded-lg">
                                        <p className="text-xs text-rose-600 leading-relaxed font-semibold">
                                            {t.projects.deleteEmbeddingsWarn}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground">{t.projects.enterPassword}</p>
                                    <input 
                                        type="password" 
                                        autoFocus
                                        placeholder="••••••••" 
                                        className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        value={deletePassword}
                                        onChange={(e) => setDeletePassword(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && deletePassword) handleDeleteProject();
                                        }}
                                    />
                                    {status?.type === 'error' && (
                                        <p className="text-xs font-bold text-rose-500 animate-pulse">{t.projects.wrongPassword || status.message}</p>
                                    )}
                                </div>
                            )}

                            <div className="pt-4 flex justify-end gap-3 border-t border-border/50 mt-6">
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        setShowDeleteModal(false);
                                        setDeleteStep(1);
                                        setDeletePassword('');
                                    }} 
                                    className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-md transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="button" 
                                    disabled={isDeleting || (deleteStep === 2 && !deletePassword)}
                                    onClick={() => handleDeleteProject()} 
                                    className={`px-6 py-2 text-white text-sm font-bold rounded-md shadow-sm transition-all flex items-center gap-2 ${isDeleting ? 'bg-rose-400' : 'bg-rose-500 hover:bg-rose-600'}`}
                                >
                                    {isDeleting ? <Loader2 size={14} className="animate-spin" /> : deleteStep === 1 ? 'Yes, Continue' : 'Confirm & Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showSyncModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
                                {pendingSyncMode === 'full' ? <Activity size={20} className="text-amber-500" /> : <Globe size={20} className="text-blue-500" />}
                                {pendingSyncMode === 'full' ? 'Full Re-Embed' : pendingSyncMode === 'monthly' ? 'Monthly Reconciliation' : 'Daily Quick Sync'}
                            </h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                {pendingSyncMode === 'full'
                                    ? 'WARNING: This will wipe all cached data, re-fetch everything from Jira, and completely re-encode semantics. It may take several minutes/hours depending on issue count.'
                                    : pendingSyncMode === 'monthly'
                                        ? 'This will fetch all current IDs and timestamps to repair any missed deletions or stray states.'
                                        : 'This fetches only issues updated since the last sync. Fast and safe for daily use.'}
                            </p>
                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                                <button type="button" onClick={() => setShowSyncModal(false)} className="px-4 py-2 rounded-md text-sm font-medium hover:bg-muted transition-colors">{t.projects.cancelBtn}</button>
                                <button type="button" onClick={handleSyncConfirm} className="px-6 py-2 rounded-md text-sm font-bold bg-blue-500 text-white hover:bg-blue-600 transition-colors shadow-sm">
                                    Start Sync
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
