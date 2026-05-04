import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from "react-router-dom";
import { Settings, LayoutDashboard, LogOut, Users, Plus, ChevronDown, ChevronUp, FolderKanban, RotateCcw, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import Dashboard from "./components/Dashboard.tsx";
import ConfigPage from "./components/ConfigPage.tsx";
import ProjectsPage from "./components/ProjectsPage.tsx";
import TeamConfig from "./components/TeamConfig.tsx";
import Login from "./components/Login.tsx";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import { useLanguage } from "./LanguageContext.tsx";
import { ProjectProvider, useProject } from "./ProjectContext.tsx";
import api from './api.ts';

const ProjectSelector = () => {
  const { projects, activeProject, setActiveProject, isLoading, refreshProjects } = useProject();
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refreshProjects();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  if (isLoading && !isRefreshing) return (
    <div className="text-xs text-muted-foreground px-6 py-4 flex items-center gap-2 animate-pulse font-medium">
      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
      <span>{t.app.loadingProjects}</span>
    </div>
  );

  if (projects.length === 0) {
    return (
      <div className="px-6 py-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{t.app.projectsTitle}</span>
          <button onClick={() => navigate('/projects?add=true')} className="p-1 hover:bg-muted rounded-md text-muted-foreground transition-colors group" title={t.app.addProjectTitle}>
            <Plus size={14} className="group-hover:text-primary" />
          </button>
        </div>
      </div>
    );
  }

  const visibleProjects = isExpanded ? projects : projects.slice(0, 4);
  const hasMore = projects.length > 5;
  const moreCount = projects.length - 4;

  return (
    <div className="mb-6 px-2 md:px-0">
      <div className="flex items-center justify-between px-4 md:px-6 mb-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{t.app.projectsTitle}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleManualRefresh}
            className={`p-1 hover:bg-muted rounded-md text-muted-foreground transition-all group ${isRefreshing ? 'animate-spin text-primary' : ''}`}
            title={t.app.refreshProjectsTitle}
          >
            <RotateCcw size={13} className="group-hover:text-primary" />
          </button>
          <button
            onClick={() => navigate('/projects?add=true')}
            className="p-1 hover:bg-muted rounded-md text-muted-foreground transition-colors group"
            title={t.app.addProjectTitle}
          >
            <Plus size={14} className="group-hover:text-primary" />
          </button>
        </div>
      </div>

      <div className="space-y-1 px-2 md:px-3">
        {visibleProjects.map((p) => {
          const isActive = activeProject === p.key;
          const isUnsynced = !p.last_sync_date;

          return (
            <button
              key={p.key}
              onClick={() => setActiveProject(p.key)}
              className={`w-full group flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left relative ${isActive
                ? 'bg-primary/10 text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
            >
              {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-r-md" />}

              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border leading-none shrink-0 ${isActive
                  ? 'bg-primary/20 border-primary/30 text-primary'
                  : 'bg-muted border-border text-muted-foreground'
                  }`}>
                  {p.key}
                </span>
                <span className={`text-xs font-medium truncate ${isActive ? 'font-bold text-foreground' : ''}`}>
                  {p.name}
                </span>
                {isUnsynced && (
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] shrink-0" title="Never synced" />
                )}
              </div>
            </button>
          );
        })}

        {hasMore && projects.length > 4 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all group"
          >
            <span className="text-[10px] font-bold uppercase tracking-widest pl-1">
              {isExpanded ? t.app.showLess : `+${moreCount} ${t.app.more}`}
            </span>
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      <div className="mt-4 px-4 md:px-6">
        <div className="h-px bg-border/50 w-full" />
      </div>
    </div>
  );
};

const Sidebar = ({ isCollapsed, setIsCollapsed }: { isCollapsed: boolean, setIsCollapsed: (v: boolean) => void }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { projects } = useProject();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error("Logout failed", e);
    }
    navigate("/login");
  };

  return (
    <aside className={`transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'} border-r border-border bg-card flex flex-col items-center md:items-stretch py-6 shrink-0 z-20 relative`}>
      {/* Collapse Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-all z-30 shadow-sm"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-start px-6'} gap-3 mb-10 text-primary font-bold text-xl transition-all`}>
        <div className="p-2 bg-primary/10 rounded-xl shrink-0">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary fill-current">
            <path d="M11.5 1.5L20.5 6V18L11.5 22.5L2.5 18V6L11.5 1.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11.5 12L20.5 6M11.5 12L2.5 6M11.5 12V22.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {!isCollapsed && <span className="tracking-tight whitespace-nowrap overflow-hidden">Jira Assign AI</span>}
      </div>

      <div className={isCollapsed ? "hidden" : "block"}>
        <ProjectSelector />
      </div>

      <nav className="flex flex-col gap-1.5 px-3 w-full flex-1 mt-4">
        <SidebarLink to="/" icon={<LayoutDashboard size={20} />} label={t.nav.dashboard} isCollapsed={isCollapsed} />
        <SidebarLink to="/teams" icon={<Users size={20} />} label={t.nav.teamConstraints} isCollapsed={isCollapsed} />
        <SidebarLink to="/projects" icon={<FolderKanban size={20} />} label={t.nav.projects} isCollapsed={isCollapsed} />
        <SidebarLink to="/settings" icon={<Settings size={20} />} label={t.nav.settings} isCollapsed={isCollapsed} />
      </nav>

      <div className="mt-auto px-3 border-t border-border/50 pt-4">
        <button
          onClick={handleLogout}
          className={`group flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-all w-full`}
          title={isCollapsed ? t.auth.logout : ""}
        >
          <LogOut size={20} className={`shrink-0 transition-transform ${!isCollapsed && 'group-hover:-translate-x-1'}`} />
          {!isCollapsed && <span className="whitespace-nowrap overflow-hidden">{t.auth.logout}</span>}
        </button>
      </div>
    </aside>
  );
};

const SidebarLink = ({ to, icon, label, isCollapsed }: { to: string, icon: React.ReactNode, label: string, isCollapsed: boolean }) => (
  <Link
    to={to}
    className={`group flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all`}
    title={isCollapsed ? label : ""}
  >
    <div className="shrink-0 group-hover:text-primary transition-colors">{icon}</div>
    {!isCollapsed && <span className="whitespace-nowrap overflow-hidden">{label}</span>}
  </Link>
);


function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <Router>
      <ProjectProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
                  <Sidebar isCollapsed={isSidebarCollapsed} setIsCollapsed={setIsSidebarCollapsed} />
                  {/* Main Content Area */}
                  <main className="flex-1 flex flex-col overflow-hidden bg-background relative">
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/teams" element={
                        <div className="flex-1 overflow-hidden h-full w-full">
                          <TeamConfig />
                        </div>
                      } />
                      <Route path="/settings" element={
                        <div className="container mx-auto p-4 md:p-8 overflow-y-auto">
                          <ConfigPage />
                        </div>
                      } />
                      <Route path="/projects" element={
                        <div className="container mx-auto p-4 md:p-8 overflow-y-auto">
                          <ProjectsPage />
                        </div>
                      } />
                    </Routes>
                  </main>
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </ProjectProvider>
    </Router>
  );
}

export default App;

