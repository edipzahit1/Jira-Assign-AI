import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../api';
import { Save, Plus, Trash2, Users, GitMerge, Tag, ChevronRight, X, Search, AlertTriangle, Check } from 'lucide-react';
import { useLanguage } from '../LanguageContext.tsx';
import { useProject } from '../ProjectContext.tsx';

interface TeamRule {
    id?: number;
    match_type: 'component' | 'label';
    match_value: string;
    allowed_team: string;
}
interface UserTeam {
    account_id: string;
    display_name: string;
    team_name: string;
}
interface JiraUser {
    account_id: string;
    display_name: string;
    avatar_url: string;
}

// ── Team Colors ──

// ── Stable color map for team badges ──
const BADGE_STYLES = [
    { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    { bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30' },
    { bg: 'bg-violet-500/15',  text: 'text-violet-400',  border: 'border-violet-500/30' },
    { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30' },
    { bg: 'bg-rose-500/15',    text: 'text-rose-400',    border: 'border-rose-500/30' },
    { bg: 'bg-cyan-500/15',    text: 'text-cyan-400',    border: 'border-cyan-500/30' },
    { bg: 'bg-pink-500/15',    text: 'text-pink-400',    border: 'border-pink-500/30' },
    { bg: 'bg-teal-500/15',    text: 'text-teal-400',    border: 'border-teal-500/30' },
];
const CARD_BORDERS = [
    'border-t-emerald-500',
    'border-t-blue-500',
    'border-t-violet-500',
    'border-t-amber-500',
    'border-t-rose-500',
    'border-t-cyan-500',
    'border-t-pink-500',
    'border-t-teal-500',
];
const DOT_COLORS = [
    'bg-emerald-500','bg-blue-500','bg-violet-500','bg-amber-500',
    'bg-rose-500','bg-cyan-500','bg-pink-500','bg-teal-500',
];

function getBadgeStyle(teamIdx: number) {
    return BADGE_STYLES[teamIdx % BADGE_STYLES.length];
}

/* ─── Generic Modal ─────────────────────────────────────────────── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
                    <h3 className="font-semibold text-sm">{title}</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"><X size={16} /></button>
                </div>
                <div className="px-6 py-5">{children}</div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */
export default function TeamConfig() {
    const { t } = useLanguage();
    const tc = t.teamConfig;
    const { activeProject } = useProject();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const [allLabels, setAllLabels] = useState<string[]>([]);
    const [jiraUsers, setJiraUsers] = useState<JiraUser[]>([]);
    const [createdTeams, setCreatedTeams] = useState<string[]>([]);
    const [teamRules, setTeamRules] = useState<TeamRule[]>([]);
    const [userMappings, setUserMappings] = useState<Record<string, string>>({});

    const initialSnapshot = useRef<string>('');

    const [teamModal, setTeamModal] = useState(false);
    const [ruleModal, setRuleModal] = useState(false);
    const [newTeamInput, setNewTeamInput] = useState('');
    const [selectedLabel, setSelectedLabel] = useState('');
    const [selectedTeam, setSelectedTeam] = useState('');
    const [labelSearch, setLabelSearch] = useState('');

    // ── Inline "add team to label" popover state ──
    const [inlineAddLabel, setInlineAddLabel] = useState<string | null>(null);
    const [inlineAddTeam, setInlineAddTeam] = useState('');

    // ── Dirty detection ──
    useEffect(() => {
        const current = JSON.stringify({ createdTeams, teamRules, userMappings });
        if (initialSnapshot.current && current !== initialSnapshot.current) {
            setIsDirty(true); setSaveSuccess(false);
        } else {
            setIsDirty(false);
        }
    }, [createdTeams, teamRules, userMappings]);

    // ── Data fetch ──
    useEffect(() => {
        if (!activeProject) {
            setAllLabels([]); setJiraUsers([]); setCreatedTeams([]);
            setTeamRules([]); setUserMappings({}); setLoading(false);
            return;
        }
        setLoading(true);
        const headers = { 'x-project-key': activeProject };
        Promise.all([
            api.get('/api/jira/labels', { headers }),
            api.get('/api/jira/users', { headers }),
            api.get('/api/settings/teams', { headers }),
            api.get('/api/settings/team-rules', { headers }),
            api.get('/api/settings/user-teams', { headers }),
        ]).then(([labelsRes, usersRes, teamsRes, rulesRes, userTeamsRes]) => {
            setAllLabels(labelsRes.data); setJiraUsers(usersRes.data);
            setCreatedTeams(teamsRes.data); setTeamRules(rulesRes.data);
            const uMap: Record<string, string> = {};
            (userTeamsRes.data as UserTeam[]).forEach(ut => { uMap[ut.account_id] = ut.team_name; });
            setUserMappings(uMap);
            initialSnapshot.current = JSON.stringify({ createdTeams: teamsRes.data, teamRules: rulesRes.data, userMappings: uMap });
            setLoading(false);
        }).catch(err => { console.error(err); setLoading(false); });
    }, [activeProject]);

    // ── Handlers ──
    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = Object.entries(userMappings).filter(([_, t]) => t?.trim()).map(([id, t]) => ({ account_id: id, team_name: t }));
            const headers = { 'x-project-key': activeProject };
            await Promise.all([
                api.post('/api/settings/teams', createdTeams, { headers }),
                api.post('/api/settings/team-rules', teamRules, { headers }),
                api.post('/api/settings/user-teams', payload, { headers }),
            ]);
            initialSnapshot.current = JSON.stringify({ createdTeams, teamRules, userMappings });
            setIsDirty(false); setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) { console.error(err); alert(tc.savedFail); }
        finally { setSaving(false); }
    };

    const handleAddTeam = (e: React.FormEvent) => {
        e.preventDefault();
        const name = newTeamInput.trim();
        if (!name || createdTeams.includes(name)) return;
        setCreatedTeams([...createdTeams, name]);
        setNewTeamInput(''); setTeamModal(false);
    };
    const handleDeleteTeam = (teamName: string) => {
        if (window.confirm(tc.deleteConfirm.replace('{name}', teamName)))
            setCreatedTeams(createdTeams.filter(t => t !== teamName));
    };
    const handleAddRule = () => {
        if (!selectedLabel || !selectedTeam) return;
        setTeamRules([...teamRules, { match_type: 'label', match_value: selectedLabel, allowed_team: selectedTeam }]);
        setSelectedLabel(''); setSelectedTeam(''); setRuleModal(false);
    };
    const handleInlineAddTeamToLabel = (label: string) => {
        if (!inlineAddTeam) return;
        setTeamRules([...teamRules, { match_type: 'label', match_value: label, allowed_team: inlineAddTeam }]);
        setInlineAddLabel(null); setInlineAddTeam('');
    };
    const removeRule = (index: number) => setTeamRules(teamRules.filter((_, i) => i !== index));
    const handleAssignUser = (accountId: string, teamName: string) =>
        setUserMappings({ ...userMappings, [accountId]: teamName });

    const filteredLabels = allLabels.filter(l => l.toLowerCase().includes(labelSearch.toLowerCase()));

    // ── Derived: counts ──
    const teamMemberCount = useMemo(() => {
        const c: Record<string, number> = {};
        createdTeams.forEach(t => { c[t] = 0; });
        Object.values(userMappings).forEach(t => { if (t && c[t] !== undefined) c[t]++; });
        return c;
    }, [createdTeams, userMappings]);
    const teamRuleCount = useMemo(() => {
        const c: Record<string, number> = {};
        createdTeams.forEach(t => { c[t] = 0; });
        teamRules.forEach(r => { if (c[r.allowed_team] !== undefined) c[r.allowed_team]++; });
        return c;
    }, [createdTeams, teamRules]);

    // ── Derived: label → teams map for table view ──
    const labelToTeams = useMemo(() => {
        const map: Record<string, { teams: string[]; indices: number[] }> = {};
        teamRules.forEach((rule, idx) => {
            if (!map[rule.match_value]) map[rule.match_value] = { teams: [], indices: [] };
            map[rule.match_value].teams.push(rule.allowed_team);
            map[rule.match_value].indices.push(idx);
        });
        return map;
    }, [teamRules]);

    // ── Derived: users grouped by team ──
    const usersGroupedByTeam = useMemo(() => {
        const groups: Record<string, JiraUser[]> = {};
        createdTeams.forEach(t => { groups[t] = []; });
        groups['__unassigned__'] = [];
        jiraUsers.forEach(u => {
            const t = userMappings[u.account_id];
            if (t && groups[t]) groups[t].push(u);
            else groups['__unassigned__'].push(u);
        });
        return groups;
    }, [createdTeams, jiraUsers, userMappings]);

    if (loading) return <div className="p-8 text-center animate-pulse text-muted-foreground">{tc.loading}</div>;

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">

            {/* ══════════ PAGE HEADER ══════════ */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
                <div>
                    <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
                        <Users size={18} className="text-primary" /> {tc.title}
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">{tc.subtitle}</p>
                </div>
                <div className="flex items-center gap-3">
                    {isDirty && (
                        <span className="flex items-center gap-1.5 text-amber-500 text-xs font-semibold animate-pulse">
                            <AlertTriangle size={13} /> Unsaved changes
                        </span>
                    )}
                    {saveSuccess && !isDirty && (
                        <span className="flex items-center gap-1.5 text-emerald-500 text-xs font-semibold">
                            <Check size={13} /> Saved
                        </span>
                    )}
                    <button onClick={handleSave} disabled={saving}
                        className={`px-5 py-2 rounded-lg font-semibold flex items-center gap-2 transition-all disabled:opacity-50 text-sm ${
                            isDirty ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20'
                                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                    >
                        {saving ? tc.saving : <><Save size={14} /> {tc.saveAll}</>}
                    </button>
                </div>
            </div>

            {/* ══════════ TOP ZONE — Team Cards (horizontal scroll) ══════════ */}
            <div className="shrink-0 border-b border-border bg-muted/10 px-4 py-4">
                <div className="flex items-center gap-2 mb-3 px-2">
                    <Users size={13} className="text-emerald-500" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{tc.teamsTab}</span>
                    <span className="text-[10px] text-muted-foreground/60">({createdTeams.length})</span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar px-1">
                    {createdTeams.map((teamName, idx) => (
                        <div key={teamName}
                            className={`group relative shrink-0 w-[180px] bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-all border-t-[3px] ${CARD_BORDERS[idx % CARD_BORDERS.length]}`}
                        >
                            <div className="px-3.5 py-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-bold truncate">{teamName}</span>
                                    <button onClick={() => handleDeleteTeam(teamName)}
                                        className="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1 rounded-md hover:bg-red-500/10 shrink-0"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-semibold text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md">
                                        {teamMemberCount[teamName] || 0} members
                                    </span>
                                    <span className="text-[10px] font-semibold text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md">
                                        {teamRuleCount[teamName] || 0} rules
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* + Create Team placeholder card */}
                    <button
                        onClick={() => { setNewTeamInput(''); setTeamModal(true); }}
                        className="shrink-0 w-[180px] border-2 border-dashed border-border rounded-xl flex items-center justify-center gap-2 text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-500 hover:bg-emerald-500/5 transition-all py-4"
                    >
                        <Plus size={16} />
                        <span className="text-xs font-semibold">{tc.create}</span>
                    </button>
                </div>
            </div>

            {/* ══════════ BOTTOM ZONE — Rules + Users side by side ══════════ */}
            <div className="flex-1 overflow-hidden grid grid-cols-[3fr_2fr] gap-4 p-4">

                {/* ════ LEFT PANEL — Label Routing Rules (table) ════ */}
                <div className="flex flex-col overflow-hidden bg-card border border-border rounded-xl">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20 shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-orange-500/15 flex items-center justify-center">
                                <GitMerge size={13} className="text-orange-500" />
                            </div>
                            <div>
                                <span className="text-sm font-semibold block leading-tight">{tc.labelMapping}</span>
                                <span className="text-[10px] text-muted-foreground">{Object.keys(labelToTeams).length} labels · {teamRules.length} rules</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="group/tip relative">
                                <button className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold transition-colors">
                                    <Tag size={10} /> {allLabels.length}
                                </button>
                                <div className="absolute right-0 top-full mt-2 w-56 p-3 bg-popover border border-border rounded-xl shadow-2xl opacity-0 group-hover/tip:opacity-100 pointer-events-none group-hover/tip:pointer-events-auto transition-opacity z-40">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 border-b pb-1">{tc.fetchedFrom}</p>
                                    <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto">
                                        {allLabels.length === 0
                                            ? <span className="text-xs text-muted-foreground">{tc.noLabels}</span>
                                            : allLabels.map(l => <span key={l} className="bg-secondary px-1.5 py-0.5 rounded text-[10px] font-mono">{l}</span>)}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => { setSelectedLabel(''); setSelectedTeam(''); setLabelSearch(''); setRuleModal(true); }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20 border border-orange-500/20 text-xs font-semibold transition-colors"
                            >
                                <Plus size={12} /> Add Rule
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {Object.keys(labelToTeams).length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <GitMerge className="w-10 h-10 mb-3 text-muted-foreground/15" />
                                <p className="text-sm text-muted-foreground font-medium">{tc.noRules}</p>
                                <p className="text-xs text-muted-foreground/60 mt-1">{tc.addFirstRule}</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border bg-muted/10 sticky top-0 z-10">
                                        <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-[35%]">Label</th>
                                        <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Assigned Team(s)</th>
                                        <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-[80px]">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(labelToTeams).map(([label, { teams, indices }]) => (
                                        <tr key={label} className="border-b border-border/50 hover:bg-muted/10 transition-colors group/row">
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1.5 bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-md text-xs font-mono font-bold border border-blue-500/20">
                                                    <Tag size={10} className="opacity-60" />
                                                    {label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {teams.map((team, i) => {
                                                        const tIdx = createdTeams.indexOf(team);
                                                        const style = getBadgeStyle(tIdx >= 0 ? tIdx : 0);
                                                        return (
                                                            <span key={i}
                                                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border ${style.bg} ${style.text} ${style.border}`}
                                                            >
                                                                {team}
                                                                <button
                                                                    onClick={() => removeRule(indices[i])}
                                                                    className="ml-0.5 hover:text-red-400 transition-colors opacity-60 hover:opacity-100"
                                                                >
                                                                    <X size={10} />
                                                                </button>
                                                            </span>
                                                        );
                                                    })}
                                                    {/* Inline add team */}
                                                    {inlineAddLabel === label ? (
                                                        <div className="flex items-center gap-1">
                                                            <select
                                                                autoFocus
                                                                value={inlineAddTeam}
                                                                onChange={e => setInlineAddTeam(e.target.value)}
                                                                className="bg-background border border-primary/30 rounded-md px-2 py-1 text-[11px] font-semibold outline-none focus:ring-2 focus:ring-primary/30"
                                                            >
                                                                <option value="">{tc.selectTeamBtn}</option>
                                                                {createdTeams.filter(t => !teams.includes(t)).map(t => (
                                                                    <option key={t} value={t}>{t}</option>
                                                                ))}
                                                            </select>
                                                            <button onClick={() => handleInlineAddTeamToLabel(label)}
                                                                className="p-1 rounded-md bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors disabled:opacity-30"
                                                                disabled={!inlineAddTeam}
                                                            >
                                                                <Check size={12} />
                                                            </button>
                                                            <button onClick={() => { setInlineAddLabel(null); setInlineAddTeam(''); }}
                                                                className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => { setInlineAddLabel(label); setInlineAddTeam(''); }}
                                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary text-[10px] font-semibold transition-colors opacity-0 group-hover/row:opacity-100"
                                                        >
                                                            <Plus size={10} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => { setTeamRules(prev => prev.filter(r => r.match_value !== label)); }}
                                                    className="text-muted-foreground hover:text-red-500 opacity-0 group-hover/row:opacity-100 transition-all p-1.5 rounded-md hover:bg-red-500/10"
                                                    title="Remove all rules for this label"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* ════ RIGHT PANEL — User Assignments (grouped by team) ════ */}
                <div className="flex flex-col overflow-hidden bg-card border border-border rounded-xl">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20 shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-blue-500/15 flex items-center justify-center">
                                <Users size={13} className="text-blue-500" />
                            </div>
                            <div>
                                <span className="text-sm font-semibold block leading-tight">{tc.userMapping}</span>
                                <span className="text-[10px] text-muted-foreground">{jiraUsers.length} {tc.users}</span>
                            </div>
                        </div>
                        {usersGroupedByTeam['__unassigned__']?.length > 0 && (
                            <span className="flex items-center gap-1 text-amber-500 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                                <AlertTriangle size={10} />
                                {usersGroupedByTeam['__unassigned__'].length} unassigned
                            </span>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
                        {jiraUsers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Users className="w-8 h-8 mb-3 text-muted-foreground/20" />
                                <p className="text-xs text-muted-foreground font-medium">{tc.noUsers}</p>
                            </div>
                        ) : (
                            <>
                                {createdTeams.map((team, teamIdx) => {
                                    const groupUsers = usersGroupedByTeam[team] || [];
                                    if (groupUsers.length === 0) return null;
                                    return (
                                        <div key={team}>
                                            <div className="flex items-center gap-2 mb-2 px-1">
                                                <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLORS[teamIdx % DOT_COLORS.length]}`} />
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{team}</span>
                                                <span className="text-[10px] text-muted-foreground/60">({groupUsers.length})</span>
                                            </div>
                                            <div className="space-y-1">
                                                {groupUsers.map(user => (
                                                    <UserRow key={user.account_id} user={user} teams={createdTeams}
                                                        currentTeam={userMappings[user.account_id] || ''}
                                                        onAssign={(t) => handleAssignUser(user.account_id, t)} />
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                                {usersGroupedByTeam['__unassigned__']?.length > 0 && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-2 px-1">
                                            <AlertTriangle size={11} className="text-amber-500 shrink-0" />
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500">{tc.unassigned}</span>
                                            <span className="text-[10px] text-amber-500/60">({usersGroupedByTeam['__unassigned__'].length})</span>
                                        </div>
                                        <div className="space-y-1">
                                            {usersGroupedByTeam['__unassigned__'].map(user => (
                                                <UserRow key={user.account_id} user={user} teams={createdTeams}
                                                    currentTeam={''} onAssign={(t) => handleAssignUser(user.account_id, t)}
                                                    isUnassigned />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ═══ MODAL: Create Team ═══ */}
            {teamModal && (
                <Modal title="Create a new team" onClose={() => setTeamModal(false)}>
                    <p className="text-sm text-muted-foreground mb-4">
                        Give your team a name. You'll use this name when creating label routing rules and assigning users.
                    </p>
                    <form onSubmit={handleAddTeam} className="flex flex-col gap-4">
                        <input autoFocus type="text" placeholder={tc.teamInput}
                            className="w-full border border-input bg-background rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            value={newTeamInput} onChange={e => setNewTeamInput(e.target.value)} required />
                        <div className="flex justify-end gap-3 pt-2">
                            <button type="button" onClick={() => setTeamModal(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-secondary text-secondary-foreground hover:bg-muted transition-all border border-border">
                                {tc.cancelBtn}
                            </button>
                            <button type="submit"
                                className="flex-[2] px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-500/20 transition-all flex items-center justify-center gap-2">
                                <Plus size={16} />
                                {tc.createTeamBtn}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* ═══ MODAL: Add Label → Team Rule ═══ */}
            {ruleModal && (
                <Modal title="Add label routing rule" onClose={() => setRuleModal(false)}>
                    <p className="text-sm text-muted-foreground mb-5">
                        Choose a Jira label and the team that should handle tickets carrying it.
                    </p>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{tc.label || 'Label'}</label>
                            <div className="relative mb-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                                <input type="text" placeholder={tc.selectLabelPlaceholder || 'Search labels...'}
                                    className="w-full flex h-9 rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    value={labelSearch} onChange={(e) => setLabelSearch(e.target.value)} />
                            </div>
                            <div className="border border-border rounded-lg overflow-hidden bg-background">
                                <div className="p-1 max-h-48 overflow-y-auto custom-scrollbar flex flex-wrap gap-1.5">
                                    {filteredLabels.length === 0 ? (
                                        <p className="text-xs text-muted-foreground p-4 w-full text-center">{tc.noMatchingLabels}</p>
                                    ) : filteredLabels.map(l => (
                                        <button key={l} type="button" onClick={() => setSelectedLabel(l)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                                selectedLabel === l ? 'bg-primary text-primary-foreground border-primary shadow-sm scale-105'
                                                : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/50 hover:bg-muted'
                                            }`}>{l}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-center text-muted-foreground"><ChevronRight size={18} /></div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assigned team</label>
                            <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}
                                className="bg-background border border-input rounded-lg px-3 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-primary/30 outline-none">
                                <option value="">{tc.selectTeam}</option>
                                {createdTeams.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                            <button type="button" onClick={() => setRuleModal(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-secondary text-secondary-foreground hover:bg-muted transition-all border border-border">
                                {tc.cancelBtn}
                            </button>
                            <button type="button" onClick={handleAddRule} disabled={!selectedLabel || !selectedTeam}
                                className="flex-[2] px-6 py-2.5 rounded-xl text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-orange-500/20 transition-all flex items-center justify-center gap-2">
                                <GitMerge size={16} />
                                {tc.addRuleBtn}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

/* ─── User Row Sub-component ────────────────────────────────────── */
function UserRow({ user, teams, currentTeam, onAssign, isUnassigned = false }: {
    user: JiraUser; teams: string[]; currentTeam: string;
    onAssign: (team: string) => void; isUnassigned?: boolean;
}) {
    return (
        <div className={`flex items-center gap-2.5 px-3 py-2 border rounded-lg transition-colors ${
            isUnassigned ? 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40'
                         : 'bg-background border-border hover:border-primary/30'
        }`}>
            {user.avatar_url
                ? <img src={user.avatar_url} alt="" className={`w-7 h-7 rounded-full ring-1 shrink-0 ${isUnassigned ? 'ring-amber-500/30 opacity-70' : 'ring-border'}`} />
                : <div className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[11px] text-white font-bold ${
                    isUnassigned ? 'bg-gradient-to-br from-amber-500 to-orange-600 opacity-70' : 'bg-gradient-to-br from-blue-500 to-indigo-600'
                }`}>{user.display_name.charAt(0)}</div>
            }
            <span className={`flex-1 text-xs font-medium truncate min-w-0 ${isUnassigned ? 'text-muted-foreground' : ''}`} title={user.display_name}>
                {user.display_name}
            </span>
            <select
                className={`shrink-0 w-[120px] border rounded-md px-2 py-1 text-[11px] font-semibold outline-none cursor-pointer transition-colors ${
                    isUnassigned ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 focus:ring-2 focus:ring-amber-500/30'
                                : 'bg-muted/30 border-input text-foreground focus:bg-background focus:ring-2 focus:ring-primary/30'
                }`}
                value={currentTeam} onChange={e => onAssign(e.target.value)}
            >
                <option value="">— No Team —</option>
                {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
        </div>
    );
}
