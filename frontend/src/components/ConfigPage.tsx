import { useState, useEffect } from 'react';
import api from '../api';
import {
    AlertCircle, CheckCircle2, Globe, Lock,
    User, LogOut, Moon, Sun, Clock, SlidersHorizontal,
    Activity, ChevronDown, ChevronRight, Eye, EyeOff,
    Folder, Calendar, PowerOff, Plus, Loader2, Trash2
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { useTheme } from '../ThemeContext';
import { useProject } from '../ProjectContext';

export default function ConfigPage() {
    const { lang, setLang, t } = useLanguage();
    const { theme, setTheme } = useTheme();
    const tc = t.config;
    useProject();

    // ACCOUNT MANAGEMENT STATE
    const [credData, setCredData] = useState({ current_password: '', new_username: '', new_password: '' });
    const [credUpdating, setCredUpdating] = useState(false);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);

    // SCHEDULER STATE
    const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
    const [showSchedulerModal, setShowSchedulerModal] = useState(false);

    // UI STATE
    const [expandedSections, setExpandedSections] = useState({
        operations: true,
        preferences: true,
        account: false
    });
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'warning', message: string } | null>(null);

    // LOAD GLOBAL SCHEDULER STATUS
    useEffect(() => {
        const loadStatus = async () => {
            try {
                const schedRes = await api.get('/api/scheduler/global-status');
                setSchedulerStatus(schedRes.data);
            } catch (err) {
                console.error("Failed to load global scheduler status", err);
            }
        };
        loadStatus();
    }, []);


    const handleCredsUpdate = async () => {
        setCredUpdating(true);
        setStatus(null);
        try {
            await api.put('/auth/credentials', credData);
            setStatus({ type: 'success', message: tc.credsUpdateSuccess || 'Credentials updated successfully' });
            setCredData({ current_password: '', new_username: '', new_password: '' });
        } catch (err: any) {
            setStatus({ type: 'error', message: err.response?.data?.detail || 'Update failed' });
        } finally {
            setCredUpdating(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('token');
        window.dispatchEvent(new Event('auth-change'));
        window.location.href = '/login';
    };

    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-2">System Configuration</h1>
                    <p className="text-muted-foreground">
                        Global application settings. Jira credentials are configured per-project on the{' '}
                        <a href="/projects" className="text-primary underline-offset-4 hover:underline font-medium">Projects</a> page.
                    </p>
                </div>
            </div>

            {status && (
                <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium border animate-in fade-in slide-in-from-top-2 duration-300 ${status.type === 'success' ? 'bg-green-500/10 text-green-500 border-green-500/20 shadow-sm shadow-green-500/5' : 'bg-red-500/10 text-red-500 border-red-500/20 shadow-sm shadow-red-500/5'}`}>
                    {status.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    {status.message}
                </div>
            )}

            {/* PROJECT CREDENTIALS INFO BANNER */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 flex gap-4 items-start">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Lock size={20} />
                </div>
                <div>
                    <h2 className="text-base font-semibold mb-1">{tc.credsPerProject}</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Each project manages its own Jira server URL, email, and API token independently.
                        Go to <a href="/projects" className="text-primary font-semibold hover:underline underline-offset-4">Projects → Credentials tab</a> to configure them.
                    </p>
                </div>
            </div>

            {/* AUTOMATED SCHEDULER */}

            {/* PREFERENCES (Language + Theme) */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden transition-all duration-300">
                <div
                    className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleSection('preferences')}
                >
                    <div className="flex items-center gap-3">
                        <SlidersHorizontal size={18} className="text-primary" />
                        <h2 className="text-lg font-semibold">{tc.appPrefs}</h2>
                    </div>
                    <div className="text-muted-foreground p-2 rounded-full hover:bg-background transition-colors">
                        {expandedSections.preferences ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                </div>
                {expandedSections.preferences && (
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-top-2 fade-in duration-200">
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground"><Globe size={14} />{tc.language}</h3>
                            <div className="flex gap-2 p-1 bg-muted/20 rounded-lg w-fit border border-border/50">
                                {['en', 'tr'].map(l => (
                                    <button key={l} type="button" onClick={() => setLang(l as any)} className={`px-5 py-2 rounded-md text-xs font-bold transition-all ${lang === l ? 'bg-background text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'}`}>
                                        {l === 'en' ? 'ENGLISH' : 'TÜRKÇE'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">{theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />} Appearance Theme</h3>
                            <div className="flex gap-2 p-1 bg-muted/20 rounded-lg w-fit border border-border/50">
                                {['dark', 'light'].map(t => (
                                    <button key={t} type="button" onClick={() => setTheme(t as any)} className={`px-5 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${theme === t ? 'bg-background text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'}`}>
                                        {t === 'dark' ? <Moon size={12} /> : <Sun size={12} />} {t.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ACCOUNT MANAGEMENT */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden border-rose-500/10 transition-all duration-300">
                <div
                    className="px-6 py-4 border-b border-border bg-rose-500/5 flex items-center justify-between cursor-pointer hover:bg-rose-500/10 transition-colors"
                    onClick={() => toggleSection('account')}
                >
                    <div className="flex items-center gap-3">
                        <User size={18} className="text-rose-500" />
                        <h2 className="text-lg font-semibold text-rose-500">{tc.accountSettings}</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleLogout(); }} className="px-4 py-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border border-rose-500/20">
                            <LogOut size={14} /> {t.auth.logout}
                        </button>
                        <div className="text-rose-500 p-2 rounded-full hover:bg-rose-500/20 transition-colors ml-2 border-l border-rose-500/20 pl-4">
                            {expandedSections.account ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        </div>
                    </div>
                </div>
                {expandedSections.account && (
                    <div className="p-6 animate-in slide-in-from-top-2 fade-in duration-200">
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider ml-1">{tc.currentPassword}</label>
                                    <div className="relative">
                                        <input type={showCurrentPassword ? "text" : "password"} value={credData.current_password} onChange={e => setCredData({ ...credData, current_password: e.target.value })} className="w-full flex h-10 rounded-lg border border-border bg-background pl-3 pr-10 py-1 text-sm focus:ring-1 focus:ring-rose-500/30 outline-none transition-all" />
                                        <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground">
                                            {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider ml-1">{tc.newUsername}</label>
                                    <input type="text" value={credData.new_username} onChange={e => setCredData({ ...credData, new_username: e.target.value })} className="w-full flex h-10 rounded-lg border border-border bg-background px-3 py-1 text-sm focus:ring-1 focus:ring-rose-500/30 outline-none transition-all" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider ml-1">{tc.newPassword}</label>
                                    <div className="relative">
                                        <input type={showNewPassword ? "text" : "password"} value={credData.new_password} onChange={e => setCredData({ ...credData, new_password: e.target.value })} className="w-full flex h-10 rounded-lg border border-border bg-background pl-3 pr-10 py-1 text-sm focus:ring-1 focus:ring-rose-500/30 outline-none transition-all" />
                                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground">
                                            {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end pt-2 border-t border-border/50">
                                <button type="button" onClick={handleCredsUpdate} disabled={credUpdating || !credData.current_password} className="inline-flex items-center justify-center rounded-lg text-xs font-bold transition-all bg-rose-500 text-white hover:bg-rose-600 h-10 px-8 disabled:opacity-50 shadow-lg shadow-rose-500/20">
                                    {credUpdating ? tc.saving : tc.updateCredentials}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* SCHEDULER DISABLE MODAL */}
            {showSchedulerModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                                    <AlertCircle size={28} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold">{tc.schedulerPerProject}</h3>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        To enable or disable the scheduler, go to the individual project's <strong>Sync &amp; Scheduler</strong> tab.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3 justify-end mt-8">
                                <button type="button" onClick={() => setShowSchedulerModal(false)} className="px-4 py-2 text-sm font-medium rounded-md hover:bg-muted transition-colors">
                                    Close
                                </button>
                                <a href="/projects" className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-md hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm">
                                    Go to Projects
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
