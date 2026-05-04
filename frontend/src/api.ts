import axios from 'axios';

const baseURL = import.meta.env.PROD ? "" : "http://localhost:8000";

const api = axios.create({
  baseURL,
  withCredentials: true, // Crucial for HttpOnly cookies
});

// Request Interceptor: Attach Project Key
api.interceptors.request.use(
  (config) => {
    const activeProject = localStorage.getItem('activeProject');
    if (activeProject) {
      config.headers['x-project-key'] = activeProject;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Catch 401 Unauthorized and force logout
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
