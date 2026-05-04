    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-12">
            <div className="mb-2">
                <h1 className="text-3xl font-bold tracking-tight mb-2">{tc.title}</h1>
                <p className="text-muted-foreground">{tc.subtitle}</p>
            </div>

            {/* GLOBAL JIRA CREDENTIALS */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden transition-all duration-300">
                <div className="px-6 py-4 border-b border-border bg-emerald-500/5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold flex items-center gap-2 text-emerald-600">
                            <Globe size={18} />
                            Global Jira Credentials
                            {globalStatus?.type === 'success' && <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase font-bold bg-green-500/10 text-green-500 border border-green-500/20"><CheckCircle2 size={12}/> {globalStatus.message}</span>}
                            {globalStatus?.type === 'error' && <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase font-bold bg-red-500/10 text-red-500 border border-red-500/20"><AlertCircle size={12}/> {globalStatus.message}</span>}
                        </h2>
                        <p className="text-sm text-muted-foreground text-emerald-600/70">All projects use these credentials unless a per-project override is configured.</p>
                    </div>
                </div>
                <div className="p-6">
                    <form onSubmit={handleGlobalSubmit} className="space-y-4">
                        {/* TOGGLE: CLOUD VS SERVER */}
                        <div className="flex gap-4 p-1 bg-muted/30 rounded-lg w-fit border border-border">
                            <label className={`cursor-pointer px-4 py-2 rounded-md text-sm font-semibold transition-colors ${connectionType === 'cloud' ? 'bg-background text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
                                <input type="radio" name="connectionType" value="cloud" checked={connectionType === 'cloud'} onChange={() => setConnectionType('cloud')} className="hidden" />
                                {tc.jiraCloud}
                            </label>
                            <label className={`cursor-pointer px-4 py-2 rounded-md text-sm font-semibold transition-colors ${connectionType === 'server' ? 'bg-background text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
                                <input type="radio" name="connectionType" value="server" checked={connectionType === 'server'} onChange={() => setConnectionType('server')} className="hidden" />
                                {tc.jiraServer}
                            </label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider ml-1">{tc.serverUrl}</label>
                                <input type="url" required minLength={5} placeholder={connectionType === 'cloud' ? "https://your-domain.atlassian.net" : "https://jira.yourcompany.com"} value={globalSettings.server_url} onChange={e => setGlobalSettings({ ...globalSettings, server_url: e.target.value })} className="w-full h-10 rounded-lg border border-border bg-background px-3 py-1 text-sm focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all" />
                            </div>
                            {connectionType === 'cloud' && (
                                <div className="space-y-1.5">
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider ml-1">{tc.userEmail}</label>
                                    <input type="email" required minLength={3} placeholder={tc.userEmailPlaceholder} value={globalSettings.user_email} onChange={e => setGlobalSettings({ ...globalSettings, user_email: e.target.value })} className="w-full h-10 rounded-lg border border-border bg-background px-3 py-1 text-sm focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all" />
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider ml-1">{connectionType === 'cloud' ? tc.apiToken : tc.pat}</label>
                                <input type="password" placeholder={connectionType === 'cloud' ? tc.apiTokenPlaceholder : tc.patPlaceholder} value={globalSettings.api_token} onChange={e => setGlobalSettings({ ...globalSettings, api_token: e.target.value })} className="w-full h-10 rounded-lg border border-border bg-background px-3 py-1 text-sm focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all" />
                            </div>
                            <div className="md:col-span-3 flex justify-end pt-2">
                                <button type="submit" disabled={globalSaving} className="h-10 px-8 rounded-md bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 disabled:opacity-50 transition-colors shadow-sm">
                                    {globalSaving ? tc.saving : tc.save} Global Credentials
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            {/* TWO-COLUMN LAYOUT */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LEFT COLUMN: PROJECT LIST */}
                <div className="lg:col-span-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold">Projects</h2>
                        <button onClick={() => setShowAddProjectModal(true)} className="px-3 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-1 transition-colors shadow-sm">
                            <Plus size={14}/> Add Project
                        </button>
                    </div>

                    {projects.length === 0 ? (
                        <div className="text-center py-12 px-4 border border-dashed rounded-xl bg-card">
                            <div className="flex justify-center mb-3 text-muted-foreground"><FolderX size={32}/></div>
                            <p className="text-sm text-muted-foreground">No projects yet. Add your first project to get started.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {projects.map(p => (
                                <div key={p.key} onClick={() => setActiveProject(p.key)} className={`cursor-pointer border rounded-xl p-4 transition-all ${activeProject === p.key ? 'border-primary border-l-4 bg-primary/5 shadow-sm' : 'border-border bg-card hover:border-primary/40'}`}>
                                    <h3 className="font-bold flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground font-mono bg-background px-1.5 py-0.5 rounded border border-border">{p.key}</span>
                                        {p.name}
                                    </h3>
                                    {!p.last_sync_date && (
                                        <div className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                            <AlertCircle size={10}/> Never synced
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
                            <div className="px-6 py-5 border-b border-border bg-muted/10">
                                <h2 className="text-xl font-bold flex items-baseline gap-2">
                                    {activeProjectData.name}
                                    <span className="text-sm text-muted-foreground font-mono font-normal tracking-wide px-2 py-0.5 bg-background rounded border border-border">{activeProject}</span>
                                </h2>
                                {status && (
                                    <div className={`mt-3 px-3 py-2 rounded flex items-center gap-2 text-xs font-medium border ${status.type === 'success' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                                        {status.type === 'success' ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
                                        {status.message}
                                    </div>
                                )}
                            </div>
                            
                            {/* TABS */}
                            <div className="px-6 border-b border-border flex gap-6">
                                <button type="button" onClick={() => setProjectTab('general')} className={`py-4 text-sm font-semibold border-b-2 transition-colors ${projectTab === 'general' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>General</button>
                                <button type="button" onClick={() => setProjectTab('credentials')} className={`py-4 text-sm font-semibold border-b-2 transition-colors ${projectTab === 'credentials' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Credentials</button>
                            </div>

                            <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
                                <div className="p-6 flex-1">
                                    {projectTab === 'general' ? (
                                        <div className="space-y-8">
                                            {/* Project Name */}
                                            <div className="space-y-2 max-w-md">
                                                <label className="text-sm font-medium">{tc.projectName || 'Project Name'}</label>
                                                <input
                                                    type="text" required name="name" placeholder="Project Name"
                                                    className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    value={formData.name || ''} onChange={handleChange}
                                                />
                                            </div>

                                            {/* Strategy Presets */}
                                            <div className="space-y-4">
                                                <div>
                                                    <h3 className="text-sm font-medium">{tc.strategy}</h3>
                                                    <p className="text-xs text-muted-foreground">{tc.strategySub}</p>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {(['BALANCED', 'SPEED', 'QUALITY', 'GROWTH', 'PERSONALIZED'] as const).map((id) => {
                                                        const strategy = tc.strategies[id as keyof typeof tc.strategies];
                                                        return (
                                                            <label
                                                                key={id}
                                                                className={`relative flex cursor-pointer rounded-lg border bg-background p-3 hover:bg-muted/50 transition-colors ${formData.active_strategy === id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border'} ${id === 'PERSONALIZED' ? 'md:col-span-2 lg:col-span-1' : ''}`}
                                                            >
                                                                <input type="radio" name="active_strategy" value={id} className="sr-only" checked={formData.active_strategy === id} onChange={handleChange as any} />
                                                                <span className="flex flex-col flex-1">
                                                                    <span className={`block text-xs font-bold ${formData.active_strategy === id ? 'text-primary' : 'text-foreground'}`}>{strategy?.label || id}</span>
                                                                    <span className="mt-0.5 block text-[10px] text-muted-foreground leading-tight">{strategy?.desc || ''}</span>
                                                                </span>
                                                                {formData.active_strategy === id && <CheckCircle2 className="h-4 w-4 text-primary ml-2 shrink-0" />}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                                
                                                {/* Advanced Settings for PERSONALIZED */}
                                                {formData.active_strategy === 'PERSONALIZED' && (
                                                    <div className="mt-6 space-y-4 animate-in slide-in-from-top-1 fade-in duration-200">
                                                        <div className="flex items-center justify-between">
                                                            <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Criterion Weights</h4>
                                                            <div className="text-[10px] font-mono opacity-60">sum = {(advSettings.w_expertise + advSettings.w_workload + advSettings.w_success_rate + advSettings.w_urgency + advSettings.w_category_experience + advSettings.w_recent_activity).toFixed(2)}</div>
                                                        </div>
                                                        
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {([
                                                            { key: 'w_expertise', label: tc.criterionLabels.expertise, hasExtra: true, extraKey: 'expertise' },
                                                            { key: 'w_workload', label: tc.criterionLabels.workload, hasExtra: true, extraKey: 'workload' },
                                                            { key: 'w_success_rate', label: tc.criterionLabels.success_rate, hasExtra: true, extraKey: 'success_rate' },
                                                            { key: 'w_urgency', label: tc.criterionLabels.urgency, hasExtra: false, extraKey: '' },
                                                            { key: 'w_category_experience', label: tc.criterionLabels.category_experience, hasExtra: false, extraKey: '' },
                                                            { key: 'w_recent_activity', label: tc.criterionLabels.recent_activity, hasExtra: true, extraKey: 'recent_activity' },
                                                        ] as const).map(({ key, label, hasExtra, extraKey }) => {
                                                            const val = advSettings[key as keyof typeof advSettings] as number;
                                                            return (
                                                                <div key={key} className="bg-muted/30 rounded-xl border border-border p-4 space-y-2">
                                                                    <div className="flex items-center justify-between">
                                                                        <label className="text-xs font-bold text-foreground">{label}</label>
                                                                        <span className="text-xs font-mono font-bold text-primary">{(val * 100).toFixed(0)}%</span>
                                                                    </div>
                                                                    <input type="range" min="0" max="100" value={val * 100}
                                                                        onChange={e => {
                                                                            const newRaw = parseInt(e.target.value);
                                                                            setAdvSettings(prev => {
                                                                                const updated = { ...prev, [key]: newRaw / 100 };
                                                                                const otherKeys = ['w_expertise', 'w_workload', 'w_success_rate', 'w_urgency', 'w_category_experience', 'w_recent_activity'].filter(k => k !== key);
                                                                                const otherSum = otherKeys.reduce((s, k) => s + (prev[k as keyof typeof prev] as number), 0);
                                                                                const remaining = 1.0 - newRaw / 100;
                                                                                if (otherSum > 0) {
                                                                                    otherKeys.forEach(k => {
                                                                                        (updated as any)[k] = parseFloat((((prev[k as keyof typeof prev] as number) / otherSum) * remaining).toFixed(4));
                                                                                    });
                                                                                } else {
                                                                                    otherKeys.forEach(k => {
                                                                                        (updated as any)[k] = parseFloat((remaining / otherKeys.length).toFixed(4));
                                                                                    });
                                                                                }
                                                                                return updated;
                                                                            });
                                                                        }}
                                                                        className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                                                                    />
                                                                    
                                                                    {hasExtra && (
                                                                        <div className="pt-1">
                                                                            <button type="button" onClick={() => setExpandedCriteria(prev => ({ ...prev, [extraKey]: !prev[extraKey] }))} className="text-[10px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-colors">
                                                                                {expandedCriteria[extraKey as keyof typeof expandedCriteria] ? <ChevronDown size={10} /> : <ChevronRight size={10} />} {tc.extraSettings}
                                                                            </button>
                                                                            {expandedCriteria[extraKey as keyof typeof expandedCriteria] && extraKey === 'expertise' && (
                                                                                <div className="mt-2 pl-3 border-l-2 border-amber-500/30 space-y-3 animate-in slide-in-from-top-1 fade-in duration-150">
                                                                                    <p className="text-[10px] text-muted-foreground">{tc.advExpertiseDesc}</p>
                                                                                    <div className="grid grid-cols-1 gap-3">
                                                                                        <div className="space-y-1">
                                                                                            <div className="flex items-center justify-between">
                                                                                                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{tc.advNlpWeight}</label>
                                                                                                <span className="text-[10px] font-mono font-bold text-amber-500">{advSettings.expertise_nlp_weight.toFixed(2)}</span>
                                                                                            </div>
                                                                                            <input type="range" min="0" max="100" value={advSettings.expertise_nlp_weight * 100} onChange={e => { const v = parseInt(e.target.value) / 100; setAdvSettings(s => ({ ...s, expertise_nlp_weight: v, expertise_label_weight: parseFloat((1 - v).toFixed(2)) })); }} className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-amber-500" />
                                                                                        </div>
                                                                                        <div className="space-y-1">
                                                                                            <div className="flex items-center justify-between">
                                                                                                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{tc.advLabelWeight}</label>
                                                                                                <span className="text-[10px] font-mono font-bold text-amber-500">{advSettings.expertise_label_weight.toFixed(2)}</span>
                                                                                            </div>
                                                                                            <input type="range" min="0" max="100" value={advSettings.expertise_label_weight * 100} onChange={e => { const v = parseInt(e.target.value) / 100; setAdvSettings(s => ({ ...s, expertise_label_weight: v, expertise_nlp_weight: parseFloat((1 - v).toFixed(2)) })); }} className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-amber-500" />
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                            {expandedCriteria[extraKey as keyof typeof expandedCriteria] && extraKey === 'workload' && (
                                                                                <div className="mt-2 pl-3 border-l-2 border-amber-500/30 space-y-3 animate-in slide-in-from-top-1 fade-in duration-150">
                                                                                    <p className="text-[10px] text-muted-foreground">{tc.advWorkloadDesc}</p>
                                                                                    <div className="grid grid-cols-1 gap-3">
                                                                                        <div className="space-y-1 text-right">
                                                                                            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block text-left mb-1">{tc.advTaskSat}</label>
                                                                                            <input type="number" min="1" max="50" value={advSettings.workload_task_saturation} onChange={e => setAdvSettings(s => ({ ...s, workload_task_saturation: Math.max(1, parseInt(e.target.value) || 1) }))} className="w-full h-8 rounded-lg border border-border bg-muted/10 px-2 text-xs font-mono focus:ring-1 focus:ring-amber-500/30 outline-none transition-all" />
                                                                                        </div>
                                                                                        <div className="space-y-1 text-right">
                                                                                            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block text-left mb-1">{tc.advSpSat}</label>
                                                                                            <input type="number" min="1" max="100" value={advSettings.workload_sp_saturation} onChange={e => setAdvSettings(s => ({ ...s, workload_sp_saturation: Math.max(1, parseInt(e.target.value) || 1) }))} className="w-full h-8 rounded-lg border border-border bg-muted/10 px-2 text-xs font-mono focus:ring-1 focus:ring-amber-500/30 outline-none transition-all" />
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                            {expandedCriteria[extraKey as keyof typeof expandedCriteria] && extraKey === 'success_rate' && (
                                                                                <div className="mt-2 pl-3 border-l-2 border-amber-500/30 space-y-3 animate-in slide-in-from-top-1 fade-in duration-150">
                                                                                    <p className="text-[10px] text-muted-foreground">{tc.advSuccessDesc}</p>
                                                                                    <div className="grid grid-cols-1 gap-3">
                                                                                        <div className="space-y-1">
                                                                                            <div className="flex items-center justify-between">
                                                                                                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{tc.advDeadlineWeight}</label>
                                                                                                <span className="text-[10px] font-mono font-bold text-amber-500">{advSettings.success_deadline_weight.toFixed(2)}</span>
                                                                                            </div>
                                                                                            <input type="range" min="0" max="100" value={advSettings.success_deadline_weight * 100} onChange={e => { const v = parseInt(e.target.value) / 100; setAdvSettings(s => ({ ...s, success_deadline_weight: v, success_reopen_weight: parseFloat((1 - v).toFixed(2)) })); }} className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-amber-500" />
                                                                                        </div>
                                                                                        <div className="space-y-1">
                                                                                            <div className="flex items-center justify-between">
                                                                                                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{tc.advReopenWeight}</label>
                                                                                                <span className="text-[10px] font-mono font-bold text-amber-500">{advSettings.success_reopen_weight.toFixed(2)}</span>
                                                                                            </div>
                                                                                            <input type="range" min="0" max="100" value={advSettings.success_reopen_weight * 100} onChange={e => { const v = parseInt(e.target.value) / 100; setAdvSettings(s => ({ ...s, success_reopen_weight: v, success_deadline_weight: parseFloat((1 - v).toFixed(2)) })); }} className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-amber-500" />
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                            {expandedCriteria[extraKey as keyof typeof expandedCriteria] && extraKey === 'recent_activity' && (
                                                                                <div className="mt-2 pl-3 border-l-2 border-amber-500/30 space-y-3 animate-in slide-in-from-top-1 fade-in duration-150">
                                                                                    <p className="text-[10px] text-muted-foreground">{tc.advActivityDesc}</p>
                                                                                    <div className="grid grid-cols-1 gap-3">
                                                                                        <div className="space-y-1 text-right">
                                                                                            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block text-left mb-1">{tc.advActivityHours}</label>
                                                                                            <input type="number" min="1" max="200" value={advSettings.activity_saturation_hours} onChange={e => setAdvSettings(s => ({ ...s, activity_saturation_hours: Math.max(1, parseInt(e.target.value) || 1) }))} className="w-full h-8 rounded-lg border border-border bg-muted/10 px-2 text-xs font-mono focus:ring-1 focus:ring-amber-500/30 outline-none transition-all" />
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
                                                        <div className="flex items-center justify-between pt-2">
                                                            <button type="button" onClick={() => { setAdvSettings(ADV_DEFAULTS); setAdvStatus(null); }} className="text-[10px] font-bold text-muted-foreground hover:text-amber-500 flex items-center gap-1.5 transition-colors">
                                                                <RotateCcw size={12} /> {tc.advResetAll}
                                                            </button>
                                                            <button type="button" onClick={async () => {
                                                                setAdvSaving(true); setAdvStatus(null);
                                                                try {
                                                                    await api.post('http://localhost:8000/api/settings/advanced', advSettings, { headers: { 'x-project-key': activeProject } });
                                                                    setAdvStatus({ type: 'success', message: tc.advSaved });
                                                                } catch { setAdvStatus({ type: 'error', message: tc.advError }); }
                                                                finally { setAdvSaving(false); }
                                                            }} disabled={advSaving || saving} className="inline-flex items-center justify-center rounded-lg text-xs font-bold transition-all bg-amber-500 text-white hover:bg-amber-600 h-9 px-6 disabled:opacity-50 shadow-sm">
                                                                <Save size={14} className="mr-2" />
                                                                {advSaving ? tc.saving : tc.save}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Override Labels */}
                                            <div className="space-y-4">
                                                <div>
                                                    <h3 className="text-sm font-medium flex items-center justify-between">
                                                        <span>{tc.overrideLabels}</span>
                                                    </h3>
                                                    <p className="text-xs text-muted-foreground">{tc.overrideLabelsHint}</p>
                                                </div>
                                                
                                                <div className="flex flex-wrap gap-2 min-h-[36px] p-2 rounded-lg border border-dashed border-border bg-muted/10">
                                                    {overrideLabelsArray.length === 0 ? (
                                                        <span className="text-xs text-muted-foreground italic flex items-center px-2 py-1">No labels selected.</span>
                                                    ) : (
                                                        overrideLabelsArray.map((label: string) => (
                                                            <button
                                                                key={label} type="button" onClick={() => toggleLabel(label)}
                                                                className="group flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded text-xs font-semibold hover:bg-primary/20 transition-all"
                                                            >
                                                                <Tag size={10} /> {label} <X size={10} className="opacity-50 group-hover:opacity-100" />
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                                
                                                <div className="border border-border rounded-lg overflow-hidden bg-background">
                                                    <div className="relative border-b border-border">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={12} />
                                                        <input type="text" placeholder={tc.overrideLabelsPlaceholder} className="w-full h-8 bg-transparent pl-8 pr-3 text-xs focus:outline-none" value={labelSearch} onChange={(e) => setLabelSearch(e.target.value)} />
                                                    </div>
                                                    <div className="p-2 max-h-32 overflow-y-auto custom-scrollbar flex flex-wrap gap-1.5 bg-muted/5">
                                                        {filteredLabels.length === 0 ? (
                                                            <p className="text-[10px] text-muted-foreground p-2 w-full text-center">{tc.noLabelsFound}</p>
                                                        ) : (
                                                            filteredLabels.map((label: string) => {
                                                                const isSelected = overrideLabelsArray.includes(label);
                                                                return (
                                                                    <button
                                                                        key={label} type="button" onClick={() => toggleLabel(label)}
                                                                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all border ${isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}
                                                                    >
                                                                        {label}
                                                                    </button>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                        </div>
                                    ) : (
                                        <div className="space-y-6 max-w-xl">
                                            <div className="bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 p-4 rounded-lg text-sm flex gap-3">
                                                <AlertCircle size={18} className="shrink-0 mt-0.5"/>
                                                <div>
                                                    <p className="font-semibold mb-1">Project-Specific Credentials</p>
                                                    <p className="text-xs opacity-90">Leave these fields blank to use the Global Jira Credentials for this project. Fill them strictly if this project resides on a different instance or requires a different account.</p>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">{tc.serverUrl}</label>
                                                <input
                                                    type="url" name="server_url"
                                                    placeholder="Using global default"
                                                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    value={formData.server_url || ''} onChange={handleChange}
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">User Email (Cloud only)</label>
                                                <input
                                                    type="email" name="user_email" placeholder="Using global default"
                                                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    value={formData.user_email || ''} onChange={handleChange}
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-sm font-medium">API Token / PAT</label>
                                                <input
                                                    type="password" name="api_token" placeholder="Using global default"
                                                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    value={formData.api_token || ''} onChange={handleChange}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="px-6 py-4 border-t border-border bg-muted/10 flex items-center justify-between">
                                    <button type="button" onClick={() => setShowDeleteModal(true)} className="px-4 py-2 text-sm font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 hover:text-red-600 rounded-md transition-colors flex items-center gap-2">
                                        <Trash2 size={16}/> Delete Project
                                    </button>

                                    <button type="submit" disabled={saving} className="px-6 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-md shadow-sm transition-all flex items-center gap-2 disabled:opacity-50">
                                        {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save size={16}/>}
                                        {saving ? tc.saving : tc.save + ' Settings'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div className="h-full border border-dashed border-border rounded-xl bg-card flex flex-col items-center justify-center text-muted-foreground p-8 text-center min-h-[500px]">
                            <LayoutDashboard size={48} className="mb-4 opacity-30"/>
                            <p className="font-medium">Select a project</p>
                            <p className="text-sm opacity-70 mt-1">Choose a project from the left sidebar to edit its configuration.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* DATA OPERATIONS CARD (SYNC + SCHEDULER) */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden border-blue-500/20 transition-all duration-300">
                <div
                    className="px-6 py-4 border-b border-border bg-blue-500/5 flex items-center justify-between cursor-pointer hover:bg-blue-500/10 transition-colors"
                    onClick={() => toggleSection('operations')}
                >
                    <div>
                        <h2 className="text-lg font-semibold text-blue-500 flex items-center gap-2">
                            <Globe size={18} />
                            {tc.syncData}
                            <span className="mx-2 text-muted-foreground/30 font-light">|</span>
                            <span className="text-emerald-500 flex items-center gap-2">
                                <Clock size={16} /> {tc.schedulerTitle || 'Auto-Sync'}
                            </span>
                        </h2>
                        <p className="text-sm text-muted-foreground">{tc.syncDataSub}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${schedulerStatus?.enabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                            {schedulerStatus?.enabled ? (tc.schedulerEnabled || 'Active') : (tc.schedulerDisabled || 'Manual Only')}
                        </span>
                        <button
                            type="button"
                            disabled={togglingScheduler}
                            onClick={(e) => { e.stopPropagation(); handleToggleScheduler(!schedulerStatus?.enabled); }}
                            className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${schedulerStatus?.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
                        >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${schedulerStatus?.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                        <div className="text-blue-500 p-2 rounded-full hover:bg-blue-500/20 transition-colors ml-2 border-l border-blue-500/20 pl-4">
                            {expandedSections.operations ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        </div>
                    </div>
                </div>
                {expandedSections.operations && (
                    <div className="p-6 space-y-6 animate-in slide-in-from-top-2 fade-in duration-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="text-sm text-muted-foreground">
                                    {syncStats ? (
                                        <span className="text-green-500 flex items-center gap-2">
                                            <CheckCircle2 size={16} />
                                            {tc.syncCompleteDetail
                                                ? tc.syncCompleteDetail
                                                    .replace('{mode}', syncStats.mode === 'full' ? (tc.syncModeFull || 'Full') : (tc.syncModeIncremental || 'Incremental'))
                                                    .replace('{fetched}', String(syncStats.fetched))
                                                    .replace('{inserted}', String(syncStats.inserted))
                                                    .replace('{updated}', String(syncStats.updated))
                                                    .replace('{time}', String(syncStats.time))
                                                : `${syncStats.mode === 'full' ? 'Full' : 'Incremental'} sync ok.`
                                            }
                                        </span>
                                    ) : (
                                        <div>{tc.syncHint}</div>
                                    )}
                                    <div className="text-xs font-medium mt-1 opacity-70">
                                        {tc.lastSynced} {lastSyncDate ? new Date(lastSyncDate).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US') : (tc.neverSynced)}
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        type="button" disabled={syncing || !activeProject}
                                        onClick={() => handleSyncClick(false)}
                                        className="inline-flex shrink-0 items-center justify-center rounded-md text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 h-9 px-4 gap-2 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        {syncing ? <><div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> {tc.syncing}</> : <><Globe size={14} /> {tc.syncIncremental}</>}
                                    </button>
                                    <button
                                        type="button" disabled={syncing || !activeProject}
                                        onClick={() => handleSyncClick(true)}
                                        className="inline-flex shrink-0 items-center justify-center rounded-md text-xs font-semibold border border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 h-9 px-4 gap-2 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        <Activity size={14} /> {tc.syncFull}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3 bg-muted/20 p-4 rounded-xl border border-border/50">
                                {schedulerStatus ? (
                                    <>
                                        {schedulerStatus.jobs?.map((job: any) => (
                                            <div key={job.id} className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2">
                                                    <Activity size={12} className={schedulerStatus.running ? 'text-emerald-500' : 'text-muted-foreground'} />
                                                    <span className="font-semibold">{job.name}</span>
                                                </div>
                                                <div className="text-[10px] text-muted-foreground font-mono">
                                                    {job.next_run ? new Date(job.next_run).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                                </div>
                                            </div>
                                        ))}
                                        {schedulerStatus.last_run && (
                                            <div className="pt-2 mt-2 border-t border-border/50 text-[10px] text-muted-foreground uppercase tracking-tight flex items-center justify-between">
                                                <span>Last Auto-Sync:</span>
                                                <span className={schedulerStatus.last_run.status === 'success' ? 'text-emerald-500' : 'text-rose-500'}>
                                                    {schedulerStatus.last_run.status === 'success' ? 'Success' : 'Failed'}
                                                </span>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-[10px] text-muted-foreground text-center py-2">{tc.schedulerNoRuns}</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* PREFERENCES (Language + Theme) */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden transition-all duration-300">
                <div
                    className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleSection('preferences')}
                >
                    <div>
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <SlidersHorizontal size={18} className="text-primary" />
                            App Preferences
                        </h2>
                    </div>
                    <div className="text-muted-foreground p-2 rounded-full hover:bg-background transition-colors">
                        {expandedSections.preferences ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                </div>
                {expandedSections.preferences && (
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 fade-in duration-200">
                        {/* Language */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground"><Globe size={14} />{tc.language}</h3>
                            <div className="flex gap-2 p-1 bg-muted/20 rounded-lg w-fit border border-border/50">
                                {['en', 'tr'].map(l => (
                                    <button key={l} type="button" onClick={() => setLang(l as any)} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${lang === l ? 'bg-background text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'}`}>
                                        {l === 'en' ? 'EN' : 'TR'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Theme */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">{theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />} Theme</h3>
                            <div className="flex gap-2 p-1 bg-muted/20 rounded-lg w-fit border border-border/50">
                                {['dark', 'light'].map(t => (
                                    <button key={t} type="button" onClick={() => setTheme(t as any)} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${theme === t ? 'bg-background text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'}`}>
                                        {t === 'dark' ? <Moon size={12} /> : <Sun size={12} />} {t.charAt(0).toUpperCase() + t.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ACCOUNT MANAGEMENT CARD */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden border-rose-500/10 transition-all duration-300">
                <div
                    className="px-6 py-4 border-b border-border bg-rose-500/5 flex items-center justify-between cursor-pointer hover:bg-rose-500/10 transition-colors"
                    onClick={() => toggleSection('account')}
                >
                    <div>
                        <h2 className="text-base font-bold text-rose-500 flex items-center gap-2">
                            <User size={16} /> {tc.accountSettings}
                        </h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleLogout(); }} className="px-3 py-1.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border border-rose-500/20">
                            <LogOut size={14} /> {t.auth.logout}
                        </button>
                        <div className="text-rose-500 p-2 rounded-full hover:bg-rose-500/20 transition-colors ml-2 border-l border-rose-500/20 pl-4">
                            {expandedSections.account ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        </div>
                    </div>
                </div>
                {expandedSections.account && (
                    <div className="p-6 animate-in slide-in-from-top-2 fade-in duration-200">
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider ml-1">{tc.currentPassword}</label>
                                    <input type="password" value={credData.current_password} onChange={e => setCredData({ ...credData, current_password: e.target.value })} className="w-full flex h-9 rounded-lg border border-border bg-muted/10 px-3 py-1 text-sm focus:ring-1 focus:ring-rose-500/30 focus:border-rose-500/50 outline-none transition-all" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider ml-1">{tc.newUsername}</label>
                                    <input type="text" value={credData.new_username} onChange={e => setCredData({ ...credData, new_username: e.target.value })} className="w-full flex h-9 rounded-lg border border-border bg-muted/10 px-3 py-1 text-sm focus:ring-1 focus:ring-rose-500/30 focus:border-rose-500/50 outline-none transition-all" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider ml-1">{tc.newPassword}</label>
                                    <input type="password" value={credData.new_password} onChange={e => setCredData({ ...credData, new_password: e.target.value })} className="w-full flex h-9 rounded-lg border border-border bg-muted/10 px-3 py-1 text-sm focus:ring-1 focus:ring-rose-500/30 focus:border-rose-500/50 outline-none transition-all" />
                                </div>
                            </div>
                            <div className="flex justify-end pt-2">
                                <button type="button" onClick={handleCredsUpdate} disabled={credUpdating || !credData.current_password} className="inline-flex items-center justify-center rounded-lg text-xs font-bold transition-all bg-rose-500 text-white hover:bg-rose-600 h-9 px-6 disabled:opacity-50 shadow-lg shadow-rose-500/20">
                                    {credUpdating ? tc.saving : tc.updateCredentials}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ADD PROJECT MODAL */}
            {showAddProjectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Add New Project</h3>
                            <button type="button" onClick={() => setShowAddProjectModal(false)} className="text-muted-foreground hover:text-foreground"><X size={18}/></button>
                        </div>
                        <form onSubmit={handleCreateProject} className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Project Key</label>
                                <input required type="text" value={newProject.key} onChange={e => setNewProject({...newProject, key: e.target.value.toUpperCase()})} className="w-full h-10 rounded-md border border-input bg-background px-3 font-mono text-sm focus:ring-2 focus:ring-primary outline-none uppercase" placeholder="e.g. ASAI" />
                                <p className="text-[10px] text-muted-foreground">This is the Jira project key. It cannot be changed later.</p>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Display Name</label>
                                <input required type="text" value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Frontend Board" />
                            </div>
                            <div className="pt-4 flex justify-end gap-3 border-t border-border/50">
                                <button type="button" onClick={() => setShowAddProjectModal(false)} className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-md transition-colors">Cancel</button>
                                <button type="submit" disabled={creatingProject || !newProject.key || !newProject.name} className="px-6 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm">
                                    {creatingProject ? 'Adding...' : 'Add Project'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DELETE PROJECT MODAL */}
            {showDeleteModal && activeProject && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="bg-card border border-rose-500/30 rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3 text-rose-500">
                                <div className="p-3 bg-rose-500/10 rounded-full">
                                    <AlertCircle size={24} />
                                </div>
                                <h3 className="text-lg font-bold">Delete Project</h3>
                            </div>
                            <p className="text-sm text-foreground">
                                Are you sure you want to delete <span className="font-bold">{activeProjectData?.name} ({activeProject})</span>?
                            </p>
                            <p className="text-xs text-muted-foreground">
                                This action will delete all configuration and team constraints specific to this project. This cannot be undone.
                            </p>
                            
                            <div className="pt-4 flex justify-end gap-3 border-t border-border/50 mt-6">
                                <button type="button" onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-md transition-colors">Cancel</button>
                                <button type="button" onClick={() => { setShowDeleteModal(false); handleDeleteProject(activeProject); }} className="px-6 py-2 bg-rose-500 text-white text-sm font-bold rounded-md hover:bg-rose-600 shadow-sm transition-colors">
                                    Yes, Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SYNC CONFIRMATION MODAL */}
            {showSyncModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
                                {pendingSyncFull ? <Activity size={20} className="text-amber-500"/> : <Globe size={20} className="text-blue-500"/>}
                                {pendingSyncFull ? (tc.fullSyncWarningTitle || 'Full Re-Sync') : (tc.syncWarningTitle || 'Incremental Sync')}
                            </h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                {pendingSyncFull
                                    ? (tc.fullSyncWarningMsg || 'This will wipe all cached data for this project and re-fetch everything from Jira. Use this for weekly/monthly full rebuilds. It may take several minutes.')
                                    : (tc.syncWarningMsg || 'This will fetch only issues updated since the last sync and merge them into the cache. This is fast and safe for daily use.')}
                            </p>
                            {pendingSyncFull && (
                                <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs rounded-md">
                                    {tc.fullSyncCaution || 'All existing cached data will be deleted and rebuilt from scratch.'}
                                </div>
                            )}

                            {syncing && (
                                <div className="mb-6 mt-4 p-4 border border-border rounded-lg bg-muted/10">
                                    <div className="flex justify-between text-xs font-semibold text-blue-500 mb-2">
                                        <span className="flex items-center gap-2"><div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />{tc.syncing || 'Syncing...'}</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 rounded-full animate-[progress_20s_ease-out_infinite] w-full origin-left" style={{ animationName: 'progress-bar' }} />
                                    </div>
                                    <style>{`
                                        @keyframes progress-bar {
                                            0% { transform: scaleX(0); }
                                            15% { transform: scaleX(0.4); }
                                            50% { transform: scaleX(0.7); }
                                            80% { transform: scaleX(0.85); }
                                            100% { transform: scaleX(1); }
                                        }
                                    `}</style>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                                <button
                                    type="button" disabled={syncing} onClick={() => setShowSyncModal(false)}
                                    className="px-4 py-2 rounded-md text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                                >
                                    {tc.syncCancel || 'Cancel'}
                                </button>
                                <button
                                    type="button" disabled={syncing} onClick={handleSyncConfirm}
                                    className="px-6 py-2 rounded-md text-sm font-bold bg-blue-500 text-white hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                                >
                                    {syncing ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Syncing...</> : (tc.syncConfirm || 'Start Sync')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                                    <h3 className="text-xl font-bold">{tc.schedulerDisableTitle || 'Stop Automated Scheduler?'}</h3>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {tc.schedulerDisableMsg || 'Are you sure? Nightly incremental and weekly full syncs will stop until manually re-enabled.'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end mt-8">
                                <button type="button" onClick={() => setShowSchedulerModal(false)} className="px-4 py-2 text-sm font-medium rounded-md hover:bg-muted transition-colors">
                                    {tc.syncCancel || 'Cancel'}
                                </button>
                                <button type="button" onClick={() => executeSchedulerToggle(false)} disabled={togglingScheduler} className="px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-md hover:bg-amber-600 transition-colors flex items-center gap-2 shadow-sm">
                                    {togglingScheduler ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <X size={16} />}
                                    {tc.schedulerConfirmDisable || 'Stop Automated Sync'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
