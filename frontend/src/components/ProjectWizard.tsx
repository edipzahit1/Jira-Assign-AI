import { useState, useEffect, useMemo } from 'react';
import { Network, Search, Trash2, ArrowRight, ArrowLeft, Play, X, CheckCircle2, AlertCircle, Hash, Globe, Clock, Plus, Users as UsersIcon, UserCheck, Tag, AlertTriangle } from 'lucide-react';
import { useProject } from '../ProjectContext';
import { useLanguage } from '../LanguageContext';
import api from '../api';

interface TeamMember {
    account_id: string;
    display_name: string;
    avatar_url?: string;
}

interface Team {
    name: string;
    label: string;
    members: TeamMember[];
}

interface ProjectWizardProps {
    onClose: () => void;
    onComplete: () => void;
}

export default function ProjectWizard({ onClose, onComplete }: ProjectWizardProps) {
    const { projects } = useProject();
    const { t } = useLanguage();
    const tw = t.wizard;
    const [step, setStep] = useState(1);
    
    // Step 1 State
    const [projectData, setProjectData] = useState({
        key: '',
        name: '',
        server_url: '',
        user_email: '',
        api_token: '',
        connection_type: 'cloud' as 'cloud' | 'server',
        copy_credentials_from: ''
    });
    const [useExistingCredentials, setUseExistingCredentials] = useState(false);
    const [testResult, setTestResult] = useState<{success: boolean, message: string} | null>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [step1Error, setStep1Error] = useState<string | null>(null);

    // Step 2 State
    const [teams, setTeams] = useState<Team[]>([]);
    const [activeTeamIdx, setActiveTeamIdx] = useState<number | null>(null);
    const [newTeam, setNewTeam] = useState({ name: '', label: '' });
    const [userSearchText, setUserSearchText] = useState('');
    const [availableUsers, setAvailableUsers] = useState<TeamMember[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [availableLabels, setAvailableLabels] = useState<string[]>([]);

    // Step 3 State
    const [countData, setCountData] = useState<{total: number, eta_seconds: number} | null>(null);
    const [isCounting, setIsCounting] = useState(false);
    const [isTriggering, setIsTriggering] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [pollActive, setPollActive] = useState(false);
    const [syncStatus, setSyncStatus] = useState<any>(null);
    const [showSkipWarning, setShowSkipWarning] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    // ---- Step 1 Functions ----
    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        setStep1Error(null);
        try {
            const payload = useExistingCredentials ? {
                server_url: "",
                user_email: "",
                api_token: "",
                project_key: projectData.key,
                copy_credentials_from: projectData.copy_credentials_from
            } : {
                server_url: projectData.server_url,
                user_email: projectData.user_email,
                api_token: projectData.api_token,
                project_key: projectData.key
            };
            const res = await api.post('/api/jira/test-connection', payload);
            setTestResult({ success: true, message: res.data.message });
        } catch (err: any) {
            setTestResult({ success: false, message: err.response?.data?.detail || "Connection failed" });
        } finally {
            setIsTesting(false);
        }
    };

    const nextToStep2 = () => {
        if (!testResult?.success) {
            setStep1Error("Please test connection successfully before proceeding.");
            return;
        }
        if (!projectData.key || !projectData.name) {
            setStep1Error("Project key and name required.");
            return;
        }
        setStep(2);
    };

    // ---- Step 2 Functions ----
    useEffect(() => {
        if (step === 2) {
            const fetchData = async () => {
                setIsLoadingUsers(true);
                const creds = useExistingCredentials ? {
                    server_url: "",
                    user_email: "",
                    api_token: "",
                    project_key: projectData.key,
                    copy_credentials_from: projectData.copy_credentials_from
                } : {
                    server_url: projectData.server_url,
                    user_email: projectData.user_email,
                    api_token: projectData.api_token,
                    project_key: projectData.key
                };
                try {
                    const usersRes = await api.post('/api/jira/search-users', { ...creds, query: "" });
                    setAvailableUsers(usersRes.data);
                    const labelsRes = await api.post('/api/jira/labels', creds);
                    setAvailableLabels(labelsRes.data);
                } catch (err) {
                    console.error("Failed to fetch initial data for Step 2", err);
                } finally {
                    setIsLoadingUsers(false);
                }
            };
            fetchData();
        }
    }, [step, projectData]);

    const handleAddTeam = () => {
        if (!newTeam.name || !newTeam.label) return;
        setTeams([...teams, { ...newTeam, members: [] }]);
        const newIdx = teams.length;
        setNewTeam({ name: '', label: '' });
        if (activeTeamIdx === null) setActiveTeamIdx(newIdx);
    };

    const handleRemoveTeam = (idx: number) => {
        const t = [...teams];
        t.splice(idx, 1);
        setTeams(t);
        if (activeTeamIdx === idx) setActiveTeamIdx(null);
        else if (activeTeamIdx !== null && activeTeamIdx > idx) setActiveTeamIdx(activeTeamIdx - 1);
    };

    const handleAddMember = (teamIdx: number, user: TeamMember) => {
        setTeams(prevTeams => prevTeams.map((t, idx) => {
            if (idx === teamIdx) {
                if (t.members.find(m => m.account_id === user.account_id)) return t;
                return { ...t, members: [...t.members, { ...user }] };
            } else {
                return { ...t, members: t.members.filter(m => m.account_id !== user.account_id) };
            }
        }));
    };

    const handleRemoveMember = (teamIdx: number, accountId: string) => {
        setTeams(prevTeams => prevTeams.map((t, idx) => {
            if (idx !== teamIdx) return t;
            return { ...t, members: t.members.filter(m => m.account_id !== accountId) };
        }));
    };

    const filteredUsers = useMemo(() => {
        if (!userSearchText) return availableUsers;
        const q = userSearchText.toLowerCase();
        return availableUsers.filter(u => u.display_name.toLowerCase().includes(q) || u.account_id.toLowerCase().includes(q));
    }, [availableUsers, userSearchText]);

    const getUserTeam = (accountId: string) => {
        const team = teams.find(t => t.members.some(m => m.account_id === accountId));
        return team ? team.name : null;
    };

    const nextToStep3 = async () => {
        setStep(3);
        setIsCounting(true);
        try {
            const creds = useExistingCredentials ? {
                server_url: "",
                user_email: "",
                api_token: "",
                project_key: projectData.key,
                copy_credentials_from: projectData.copy_credentials_from
            } : {
                server_url: projectData.server_url,
                user_email: projectData.user_email,
                api_token: projectData.api_token,
                project_key: projectData.key
            };
            const res = await api.post('/api/jira/count', creds);
            setCountData(res.data);
        } catch (err: any) {
            setSyncError(err.response?.data?.detail || "Failed to count issues");
        } finally {
            setIsCounting(false);
        }
    };

    const getInitials = (name: string) => {
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    };

    const handleStartSync = async () => {
        setIsTriggering(true);
        setSyncError(null);
        try {
            const teamsPayload = teams.map(t => ({
                name: t.name,
                label: t.label,
                members: t.members.map(m => m.account_id)
            }));
            await api.post('/api/projects/create-with-teams', {
                key: projectData.key,
                name: projectData.name,
                server_url: projectData.server_url,
                user_email: projectData.user_email,
                api_token: projectData.api_token,
                connection_type: projectData.connection_type,
                copy_credentials_from: useExistingCredentials ? projectData.copy_credentials_from : undefined,
                teams: teamsPayload
            });
            setPollActive(true);
        } catch (err: any) {
            setSyncError(err.response?.data?.detail || "Failed to start sync");
        } finally {
            setIsTriggering(false);
        }
    };

    const handleSkipMigration = async () => {
        setIsTriggering(true);
        setSyncError(null);
        try {
            const teamsPayload = teams.map(t => ({
                name: t.name,
                label: t.label,
                members: t.members.map(m => m.account_id)
            }));
            await api.post('/api/projects/create-with-teams', {
                key: projectData.key,
                name: projectData.name,
                server_url: projectData.server_url,
                user_email: projectData.user_email,
                api_token: projectData.api_token,
                connection_type: projectData.connection_type,
                copy_credentials_from: useExistingCredentials ? projectData.copy_credentials_from : undefined,
                teams: teamsPayload,
                skip_migration: true
            });
            setIsSuccess(true);
        } catch (err: any) {
            setSyncError(err.response?.data?.detail || "Failed to create project");
        } finally {
            setIsTriggering(false);
        }
    };

    useEffect(() => {
        if (!pollActive) return;
        const interval = setInterval(async () => {
            try {
                const res = await api.get(`/api/projects/${projectData.key}/sync-status`);
                setSyncStatus(res.data);
                if (res.data.status === 'completed' || res.data.status === 'error') {
                    setPollActive(false);
                    if (res.data.status === 'completed') {
                        setIsSuccess(true);
                    }
                    if (res.data.status === 'error') {
                        setSyncError(res.data.error_msg || 'Migration failed.');
                    }
                }
            } catch (err) {
                console.error("Failed to poll status", err);
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [pollActive, projectData.key, onComplete]);

    const progressPercent = syncStatus
        ? Math.min(100, ((syncStatus.current || 0) / Math.max(1, syncStatus.total || 1)) * 100)
        : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <div className="bg-card w-[95vw] md:w-full max-w-6xl h-auto max-h-[92vh] border border-border shadow-2xl rounded-2xl flex flex-col overflow-hidden relative">
                <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/10 relative">
                    <h2 className="text-lg font-bold tracking-tight">{tw.wizardTitle}</h2>
                    {(!pollActive && syncStatus?.status !== 'completed') && (
                        <button onClick={onClose} className="p-2 hover:bg-muted text-muted-foreground rounded-full transition"><X size={20}/></button>
                    )}
                </div>

                <div className="flex items-center px-4 md:px-12 py-3 md:py-4 bg-muted/5 shadow-sm z-10 border-b border-border">
                    <div className={`flex flex-col gap-1.5 flex-1 relative ${step >= 1 ? 'opacity-100' : 'opacity-40 transition-opacity'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm transition-all duration-300 ${step > 1 ? 'bg-emerald-500 text-white border-emerald-600' : step === 1 ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : 'bg-muted text-muted-foreground border border-border'}`}>
                                {step > 1 ? <CheckCircle2 size={16} /> : "1"}
                            </div>
                            <span className={`text-sm font-bold tracking-tight ${step === 1 ? 'text-primary' : 'text-foreground'}`}>{tw.step1}</span>
                        </div>
                        {step === 1 && <div className="absolute -bottom-6 left-4 right-0 h-1 bg-gradient-to-r from-primary/80 to-transparent rounded-full" />}
                    </div>
                    
                    <div className={`h-1 mx-4 transition-all duration-500 flex-1 rounded-full ${step >= 2 ? 'bg-gradient-to-r from-emerald-500/50 to-primary/50' : 'bg-border'}`}></div>
                    
                    <div className={`flex flex-col gap-1.5 flex-1 relative pl-2 ${step >= 2 ? 'opacity-100' : 'opacity-40 transition-opacity'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm transition-all duration-300 ${step > 2 ? 'bg-emerald-500 text-white border-emerald-600' : step === 2 ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : 'bg-muted text-muted-foreground border border-border'}`}>
                                {step > 2 ? <CheckCircle2 size={16} /> : "2"}
                            </div>
                            <span className={`text-sm font-bold tracking-tight ${step === 2 ? 'text-primary' : 'text-foreground'}`}>{tw.step2}</span>
                        </div>
                        {step === 2 && <div className="absolute -bottom-6 left-4 right-0 h-1 bg-gradient-to-r from-primary/80 to-transparent rounded-full" />}
                    </div>
                    
                    <div className={`h-1 mx-4 transition-all duration-500 flex-1 rounded-full ${step >= 3 ? 'bg-gradient-to-r from-emerald-500/50 to-primary/50' : 'bg-border'}`}></div>
                    
                    <div className={`flex flex-col gap-1.5 flex-1 relative pl-2 ${step >= 3 ? 'opacity-100' : 'opacity-40 transition-opacity'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm transition-all duration-300 ${step === 3 ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : 'bg-muted text-muted-foreground border border-border'}`}>
                                3
                            </div>
                            <span className={`text-sm font-bold tracking-tight ${step === 3 ? 'text-primary' : 'text-foreground'}`}>{tw.step3}</span>
                        </div>
                        {step === 3 && <div className="absolute -bottom-6 left-4 right-0 h-1 bg-gradient-to-r from-primary/80 to-transparent rounded-full" />}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-muted/5 relative">
                    {isSuccess ? (
                        <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center space-y-6 py-12">
                            <div className="h-24 w-24 bg-emerald-500/10 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
                                <CheckCircle2 size={48} className="text-emerald-500" />
                            </div>
                            <div className="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
                                <h3 className="text-2xl font-bold text-foreground">{t.projects.wizardSuccessTitle || "Proje başarıyla oluşturuldu!"}</h3>
                            </div>
                            <div className="animate-in fade-in duration-500 delay-300 mt-8">
                                <button onClick={onComplete} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-md transition-colors flex items-center gap-2">
                                    {t.projects.wizardSuccessBtn || "Kapat ve Projeye Git"} <ArrowRight size={18} />
                                </button>
                            </div>
                        </div>
                    ) : step === 1 ? (
                        <div className="max-w-xl mx-auto space-y-4">
                            <div className="space-y-1 text-center">
                                <h3 className="text-lg font-bold">{tw.connectTitle}</h3>
                                <p className="text-muted-foreground text-xs">{tw.connectSubtitle}</p>
                            </div>
                            {step1Error && <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm rounded-lg flex items-center gap-2"><AlertCircle size={16}/> {step1Error}</div>}
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-muted-foreground uppercase">{tw.projectKeyLabel}</label>
                                        <input required value={projectData.key} onChange={e => setProjectData({...projectData, key: e.target.value.trim().toUpperCase()})} className="w-full h-10 rounded-md border border-input bg-background px-3 font-mono text-sm focus:ring-2 focus:ring-primary outline-none" placeholder={tw.projectKeyPlaceholder}/>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-muted-foreground uppercase">{tw.projectNameLabel}</label>
                                        <input required value={projectData.name} onChange={e => setProjectData({...projectData, name: e.target.value})} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder={tw.projectNamePlaceholder}/>
                                    </div>
                                </div>
                                {projects.length > 0 && (
                                    <div className="flex items-center space-x-2 bg-muted/30 p-3 rounded-lg border border-border mt-2">
                                        <input 
                                            type="checkbox" 
                                            id="use-existing" 
                                            checked={useExistingCredentials} 
                                            onChange={(e) => setUseExistingCredentials(e.target.checked)}
                                            className="rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <label htmlFor="use-existing" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                                            {tw.useExisting}
                                        </label>
                                    </div>
                                )}
                                
                                {useExistingCredentials ? (
                                    <div className="space-y-1.5 bg-blue-500/5 p-4 rounded-xl border border-blue-500/20">
                                        <label className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase flex items-center gap-1.5"><Network size={14}/> {tw.selectRefProject}</label>
                                        <select 
                                            value={projectData.copy_credentials_from} 
                                            onChange={e => setProjectData({...projectData, copy_credentials_from: e.target.value})}
                                            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                                        >
                                            <option value="">{tw.chooseProject}</option>
                                            {projects.map((p: any) => (
                                                <option key={p.key} value={p.key}>{p.name} ({p.key})</option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-muted-foreground uppercase">{tw.jiraUrl}</label>
                                            <input required type="url" value={projectData.server_url} onChange={e => setProjectData({...projectData, server_url: e.target.value})} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder={tw.jiraUrlPlaceholder}/>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-tighter">{tw.emailLabel}</label>
                                                <input type="email" value={projectData.user_email} onChange={e => setProjectData({...projectData, user_email: e.target.value})} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder={tw.emailPlaceholder}/>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-muted-foreground uppercase">{tw.apiTokenLabel}</label>
                                                <input required type="password" value={projectData.api_token} onChange={e => setProjectData({...projectData, api_token: e.target.value})} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder={tw.apiTokenPlaceholder}/>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="pt-2 flex flex-col items-center">
                                {testResult && (
                                    <div className={`w-full p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${testResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'}`}>
                                        <div className="flex items-center gap-2">
                                            {testResult.success ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                                            <p className="font-semibold text-sm">{testResult.message}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : step === 2 ? (
                        <div className="h-full flex flex-col">
                            <div className="mb-3 space-y-1 text-center">
                                <h3 className="text-lg font-bold">{tw.configureTeams}</h3>
                                <p className="text-muted-foreground text-xs">{tw.configureTeamsSub}</p>
                            </div>
                            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
                                <div className="flex flex-col gap-4 min-h-0">
                                    <div className="border border-border rounded-xl bg-card flex flex-col overflow-hidden flex-1 shadow-sm">
                                        <div className="p-2 px-3 border-b border-border bg-muted/20 font-bold text-xs uppercase tracking-wider text-muted-foreground flex justify-between items-center">
                                            {tw.teamsList}
                                            <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[10px]">{teams.length} teams</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                            {teams.length === 0 && <div className="p-4 text-center text-muted-foreground text-xs font-medium italic opacity-50">{tw.noTeamsYet}</div>}
                                            {teams.map((t, idx) => (
                                                <div key={idx} onClick={() => setActiveTeamIdx(idx)} className={`p-2 rounded-lg border cursor-pointer transition flex items-center justify-between group ${activeTeamIdx === idx ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:bg-muted/50'}`}>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-bold text-sm tracking-tight">{t.name}</div>
                                                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                                            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded flex items-center gap-1 border border-border/50 font-mono text-muted-foreground"><Tag size={10}/>{t.label}</span>
                                                            <span className="text-[10px] font-bold text-muted-foreground ml-1">&bull; {t.members.length} members</span>
                                                        </div>
                                                    </div>
                                                    <button onClick={(e) => { e.stopPropagation(); handleRemoveTeam(idx); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all p-1"><Trash2 size={14}/></button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="p-3 border-t border-border bg-muted/5 space-y-2">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-black uppercase text-muted-foreground">{tw.teamNameLabel}</label>
                                                    <input value={newTeam.name} onChange={e=>setNewTeam({...newTeam, name: e.target.value})} placeholder={tw.teamNamePlaceholder} className="w-full h-9 text-sm rounded-md border border-input px-3 bg-background focus:ring-2 focus:ring-primary outline-none transition-all"/>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-black uppercase text-muted-foreground">{tw.assignedLabel}</label>
                                                    <select value={newTeam.label} onChange={e=>setNewTeam({...newTeam, label: e.target.value})} className="w-full h-9 text-sm rounded-md border border-input px-2 bg-background focus:ring-2 focus:ring-primary outline-none text-muted-foreground">
                                                        <option value="">{tw.selectLabel}</option>
                                                        {availableLabels.map(l => <option key={l} value={l}>{l}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <button onClick={handleAddTeam} disabled={!newTeam.name || !newTeam.label} className="w-full h-9 mt-1 bg-primary text-primary-foreground rounded-lg text-xs font-black hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md flex items-center justify-center gap-2 uppercase tracking-widest">
                                                <Plus size={14} /> {tw.createTeam}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="border border-border rounded-xl bg-card flex flex-col overflow-hidden shadow-sm">
                                    <div className="p-2 px-3 border-b border-border bg-muted/20 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <UsersIcon size={14} className="text-primary"/>
                                            <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground">{tw.userManagement}</span>
                                        </div>
                                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">{availableUsers.length} total</span>
                                    </div>
                                    <div className="p-2 px-3 border-b border-border bg-muted/5">
                                        <div className="relative">
                                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground opacity-60"/>
                                            <input value={userSearchText} onChange={e => setUserSearchText(e.target.value)} placeholder={tw.searchUsers} className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-input bg-background focus:ring-2 focus:ring-primary outline-none transition-all"/>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto px-1 py-1 custom-scrollbar">
                                        {isLoadingUsers ? (
                                            <div className="flex flex-col items-center justify-center h-full gap-2 opacity-50">
                                                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"/>
                                                <span className="text-[10px] font-bold">{tw.syncingUsers}</span>
                                            </div>
                                        ) : filteredUsers.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs py-10 opacity-40">{tw.noMatchingUsers}</div>
                                        ) : (
                                            filteredUsers.map(user => {
                                                const currentTeam = getUserTeam(user.account_id);
                                                const isInActiveTeam = activeTeamIdx !== null && teams[activeTeamIdx].members.some(m => m.account_id === user.account_id);
                                                
                                                return (
                                                    <div key={user.account_id} className={`flex items-center gap-2 p-1.5 mx-1 my-1 rounded-lg border transition-all ${isInActiveTeam ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/20 hover:bg-muted/30'}`}>
                                                        <div className="relative h-6 w-6 shrink-0">
                                                            {user.avatar_url ? (
                                                                <img src={user.avatar_url} alt="" className="h-full w-full rounded-full object-cover border border-border" onError={(e) => { (e.target as any).style.display = 'none'; (e.target as any).nextElementSibling.style.display = 'flex'; }}/>
                                                            ) : null}
                                                            <div className="h-full w-full rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold border border-primary/20" style={{ display: user.avatar_url ? 'none' : 'flex' }}>
                                                                {getInitials(user.display_name)}
                                                            </div>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-bold truncate leading-none mb-1">{user.display_name}</div>
                                                            <div className="text-[9px] text-muted-foreground flex items-center gap-1 font-mono">
                                                                {currentTeam ? (
                                                                    <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded-sm flex items-center gap-1 font-bold tracking-tight">
                                                                        <UserCheck size={9}/> {currentTeam}
                                                                    </span>
                                                                ) : (
                                                                    <span className="opacity-60 italic">{tw.noAllocation}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {activeTeamIdx !== null && (
                                                            <button 
                                                                onClick={() => isInActiveTeam ? handleRemoveMember(activeTeamIdx, user.account_id) : handleAddMember(activeTeamIdx, user)}
                                                                className={`p-1 rounded-md transition-all ${isInActiveTeam ? 'text-red-500 bg-red-500/5 hover:bg-red-500/10' : 'text-primary bg-primary/5 hover:bg-primary/10'}`}
                                                            >
                                                                {isInActiveTeam ? <Trash2 size={14}/> : <Plus size={16}/>}
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : step === 3 ? (
                        <div className="h-full flex items-center justify-center slide-in-from-right animate-in fade-in">
                            <div className="w-full max-w-lg bg-card border border-border shadow-2xl rounded-3xl p-10 text-center relative overflow-hidden">
                                {syncError && <div className="absolute top-0 left-0 right-0 p-3 bg-red-500 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 z-20 shadow-md"><AlertCircle size={14} />{syncError}</div>}
                                
                                {isCounting ? (
                                    <div className="py-10 flex flex-col items-center">
                                        <div className="w-16 h-16 border-4 border-primary/10 border-t-primary rounded-full animate-spin mb-6 shadow-xl"></div>
                                        <h3 className="text-2xl font-bold tracking-tight mb-2">{tw.analyzingProject}</h3>
                                        <p className="text-sm text-muted-foreground max-w-xs mx-auto">{tw.analyzingProjectSub}</p>
                                    </div>
                                ) : !pollActive && (!syncStatus || (syncStatus.status !== 'completed' && syncStatus.status !== 'error')) ? (
                                    <div className="py-2">
                                        {showSkipWarning ? (
                                            <div className="text-left animate-in fade-in slide-in-from-bottom-2">
                                                <div className="flex items-center gap-3 mb-4 text-orange-500">
                                                    <div className="p-2 bg-orange-500/10 rounded-full border border-orange-500/20"><AlertTriangle size={24}/></div>
                                                    <h3 className="text-2xl font-black uppercase tracking-tighter">{tw.areYouSure}</h3>
                                                </div>
                                                <p className="text-sm text-foreground mb-3 font-medium">
                                                    {tw.skipWarningMsg}
                                                </p>
                                                <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20 text-orange-600 dark:text-orange-400 text-xs shadow-inner mb-6 space-y-2">
                                                    <p>{tw.skipWarningDetail}</p>
                                                    <p className="opacity-80">{tw.skipWarningAccuracy}</p>
                                                    <p className="font-bold flex items-center gap-1"><Clock size={12}/> {tw.skipWarningNote}</p>
                                                </div>
                                                <div className="flex gap-3">
                                                    <button onClick={() => setShowSkipWarning(false)} disabled={isTriggering} className="flex-1 py-3.5 bg-secondary text-secondary-foreground font-bold rounded-xl hover:bg-secondary/80 flex justify-center uppercase text-xs tracking-widest transition-all focus:ring-2 focus:ring-primary outline-none">{tw.goBack}</button>
                                                    <button onClick={handleSkipMigration} disabled={isTriggering} className="flex-1 py-3.5 bg-orange-500/10 text-orange-600 dark:text-orange-500 border border-orange-500/20 font-black rounded-xl hover:bg-orange-500 hover:text-white transition-all shadow-sm disabled:opacity-50 uppercase text-xs tracking-widest flex items-center justify-center gap-2">
                                                        {isTriggering ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/> : tw.skipAnyway}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="w-20 h-20 bg-primary/5 rounded-3xl flex items-center justify-center mx-auto mb-6 text-primary shadow-inner border border-primary/10">
                                                    <Globe size={40} className="animate-pulse" />
                                                </div>
                                                <h3 className="text-3xl font-black tracking-tighter mb-4 uppercase">{t.wizard.migrationComplete || 'Project Finalized'}</h3>
                                                <div className="bg-muted/10 border border-border rounded-2xl p-5 mb-8 space-y-4 text-left shadow-sm">
                                                    <div className="flex justify-between items-center text-sm font-semibold">
                                                        <span className="text-muted-foreground flex items-center gap-2 uppercase text-[10px] font-black tracking-widest"><Hash size={16}/> {tw.identifier || 'Identifier'}</span>
                                                        <span className="font-mono bg-muted/30 px-2 py-0.5 rounded">{projectData.key}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm font-semibold">
                                                        <span className="text-muted-foreground flex items-center gap-2 uppercase text-[10px] font-black tracking-widest"><Tag size={16}/> {tw.workload || 'Workload'}</span>
                                                        <span className="text-foreground">{countData?.total.toLocaleString()} Tickets</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm font-semibold">
                                                        <span className="text-muted-foreground flex items-center gap-2 uppercase text-[10px] font-black tracking-widest"><Clock size={16}/> Sync ETA</span>
                                                        <span className="text-foreground tracking-tight">{countData?.eta_seconds ? `${Math.ceil(countData.eta_seconds / 60)} mins` : '—'}</span>
                                                    </div>
                                                </div>
                                                <button onClick={handleStartSync} disabled={isTriggering} className="w-full py-5 bg-primary text-primary-foreground font-black text-xl rounded-2xl hover:bg-primary/90 transition shadow-xl flex justify-center items-center gap-3 uppercase tracking-tighter focus:ring-4 focus:ring-primary/20 outline-none">
                                                    {isTriggering ? <div className="w-6 h-6 border-4 border-current border-t-transparent rounded-full animate-spin" /> : <><Play fill="currentColor" size={24}/> {tw.initializeCore}</>}
                                                </button>
                                                <button onClick={() => setShowSkipWarning(true)} disabled={isTriggering} className="w-full mt-4 py-3 bg-transparent text-muted-foreground font-bold text-xs hover:text-foreground transition flex justify-center items-center uppercase tracking-widest border border-transparent hover:border-border rounded-xl">
                                                    {tw.skipInitialMigration}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="py-2">
                                        <div className="mb-10 text-center">
                                            <h3 className="text-3xl font-black tracking-tighter uppercase mb-2">
                                                {syncStatus?.status === 'completed' ? tw.migrationComplete : tw.analyzingProject}
                                            </h3>
                                            <div className="text-xs font-black text-muted-foreground tracking-widest uppercase flex items-center justify-center gap-2">
                                                {syncStatus?.status === 'syncing_activity' ? tw.syncingUsers : tw.ticketsProcessed} <span className="text-foreground font-mono bg-muted px-2 py-0.5 rounded">{syncStatus?.current || 0} / {syncStatus?.total || countData?.total}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="relative w-full h-6 bg-muted/20 border border-border overflow-hidden rounded-full mb-6 shadow-inner">
                                            <div className="absolute inset-y-0 left-0 bg-primary bg-gradient-to-r from-primary to-indigo-500 transition-all duration-700 ease-out" style={{ width: `${progressPercent}%` }} />
                                            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black tracking-widest text-primary-foreground mix-blend-difference">{Math.round(progressPercent)}%</div>
                                        </div>

                                        <div className="flex justify-between items-center bg-muted/5 p-4 rounded-2xl border border-border mb-10 text-left">
                                            <div>
                                                <div className="text-[9px] font-black text-muted-foreground uppercase opacity-60 tracking-widest">{tw.activeProcess}</div>
                                                <div className="text-sm font-bold text-foreground capitalize">{syncStatus?.status.replace('_', ' ')}</div>
                                            </div>
                                            {syncStatus?.eta && syncStatus.status !== 'completed' && (
                                                <div className="text-right">
                                                    <div className="text-[9px] font-black text-muted-foreground uppercase opacity-60 tracking-widest">{tw.remaining}</div>
                                                    <div className="text-sm font-bold text-primary animate-pulse">{syncStatus.eta}</div>
                                                </div>
                                            )}
                                        </div>

                                        {syncStatus?.status === 'completed' && (
                                            <button onClick={onComplete} className="w-full py-5 bg-emerald-500 text-white font-black text-xl rounded-2xl hover:bg-emerald-600 transition shadow-xl flex justify-center items-center gap-3 uppercase tracking-tighter scale-105 active:scale-100">
                                                <CheckCircle2 size={24}/> {tw.goToDashboard}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>

                {(!pollActive && syncStatus?.status !== 'completed' && !isCounting && !isSuccess) && (
                    <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between shadow-inner">
                        {step === 1 ? (
                            <div className="flex gap-3 w-full justify-between items-center">
                                <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-muted-foreground flex items-center gap-2 rounded-lg hover:bg-muted transition-all active:scale-95 uppercase tracking-widest">{t.config.syncCancel || 'Cancel'}</button>
                                <div className="flex gap-2">
                                    <button onClick={handleTestConnection} disabled={isTesting || (!useExistingCredentials && (!projectData.server_url || !projectData.api_token)) || (useExistingCredentials && !projectData.copy_credentials_from) || !projectData.key} className="px-6 py-2.5 bg-secondary text-secondary-foreground text-xs font-bold rounded-lg hover:bg-secondary/80 disabled:opacity-50 transition flex justify-center items-center gap-2 uppercase tracking-widest">
                                        {isTesting ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/> : <Network size={16}/>}
                                        {testResult?.success ? tw.testAgain || 'Test Again' : tw.testConnection}
                                    </button>
                                    <button onClick={nextToStep2} disabled={!testResult?.success} className={`px-6 py-2.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg flex items-center gap-2 transition-all uppercase tracking-widest shadow-md ${testResult?.success ? 'hover:bg-primary/90 active:scale-95' : 'opacity-40 cursor-not-allowed'}`}>
                                        {tw.configureTeams} <ArrowRight size={16}/>
                                    </button>
                                </div>
                            </div>
                        ) : step > 1 ? (
                            <>
                                <button onClick={() => setStep(step - 1)} className="px-4 py-2.5 text-xs font-bold text-muted-foreground flex items-center gap-2 border border-border rounded-lg hover:bg-muted transition-all active:scale-95 uppercase tracking-widest"><ArrowLeft size={16}/> {t.config.syncCancel || 'Back'}</button>
                                {step === 2 && (
                                    <button onClick={nextToStep3} className="px-8 py-2.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg flex items-center gap-2 hover:bg-primary/90 transition-all uppercase tracking-widest shadow-md active:scale-95">
                                        {tw.step3} <ArrowRight size={18}/>
                                    </button>
                                )}
                            </>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}
