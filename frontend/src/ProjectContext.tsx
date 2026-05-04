import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from './api';

export interface Project {
  key: string;
  name: string;
  server_url?: string;
  user_email?: string;
  active_strategy?: string;
  override_labels?: string;
  last_sync_date?: string;
  scheduler_enabled: boolean;
  daily_sync_enabled: boolean;
  weekly_sync_enabled: boolean;
  monthly_sync_enabled: boolean;
  has_token: boolean;
}

interface ProjectContextType {
  projects: Project[];
  activeProject: string | null;
  setActiveProject: (key: string | null) => void;
  refreshProjects: () => Promise<void>;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<string | null>(
    localStorage.getItem('activeProject')
  );
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = useCallback(async (isPolling = false) => {
    if (!isPolling) setIsLoading(true);
    try {
      // HttpOnly Cookies are handled automatically by the browser/axios
      const res = await api.get('/api/projects');
      const fetchedProjects = Array.isArray(res.data) ? res.data : [];
      console.log(`[DEBUG] fetchProjects: Received ${fetchedProjects.length} projects.`, fetchedProjects);
      setProjects(fetchedProjects);

      const storedProject = localStorage.getItem('activeProject');
      console.log(`[DEBUG] fetchProjects: Stored activeProject from localStorage is "${storedProject}"`);
      
      if (fetchedProjects.length > 0) {
        const validProject = fetchedProjects.find((p: any) => p.key === storedProject);
        if (validProject) {
          console.log(`[DEBUG] fetchProjects: Stored project "${storedProject}" found. Setting activeProject.`);
          setActiveProjectState(storedProject);
        } else {
          console.log(`[DEBUG] fetchProjects: Stored project "${storedProject}" NOT found in DB. Selecting first available: "${fetchedProjects[0].key}"`);
          setActiveProject(fetchedProjects[0].key);
        }
      } else {
        console.log(`[DEBUG] fetchProjects: Database is empty. Clearing activeProject.`);
        setActiveProject(null);
      }
    } catch (err) {
      console.error("[DEBUG] fetchProjects: Critical Error", err);
      // If unauthorized, clear projects
      if ((err as any).response?.status === 401) {
        setProjects([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();

    // Background Polling: If projects list is empty, try again every 10s
    // This helps resolve race conditions during initial login/startup
    const pollInterval = setInterval(() => {
      // We use a functional update style or check the latest length if needed,
      // but since projects.length is in the dependency array, this effect
      // re-runs whenever it changes, so 'projects' here is fresh for this render.
      if (projects.length === 0) {
        console.log(`[DEBUG] ProjectContext: Projects list empty (len=${projects.length}). Polling...`);
        fetchProjects(true);
      }
    }, 10000);

    // Listen for storage changes (e.g. from Login/Logout in other tabs or same tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'access_token') {
        fetchProjects();
      }
    };

    // Custom event for same-tab login/logout notification
    const handleAuthChange = () => fetchProjects();

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('auth-change', handleAuthChange);
    
    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth-change', handleAuthChange);
    };
  }, [fetchProjects, projects.length]);

  const setActiveProject = (key: string | null) => {
    if (key) {
      localStorage.setItem('activeProject', key);
    } else {
      localStorage.removeItem('activeProject');
    }
    setActiveProjectState(key);

    // Dispatch a custom event so non-react code or other components could immediately know,
    // though the context state is usually enough. It's safe to just update state.
  };

  return (
    <ProjectContext.Provider value={{ projects, activeProject, setActiveProject, refreshProjects: fetchProjects, isLoading }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
