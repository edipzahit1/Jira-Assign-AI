import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api';
import { useLanguage } from '../LanguageContext';
import { LogIn, Lock, User, AlertCircle, Eye, EyeOff } from 'lucide-react';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lockoutTimer, setLockoutTimer] = useState(0);

  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  const from = (location.state as any)?.from?.pathname || "/";

  // Handle countdown timer
  useEffect(() => {
    let interval: any = null;
    if (lockoutTimer > 0) {
      interval = setInterval(() => {
        setLockoutTimer((prev) => prev - 1);
      }, 1000);
    } else if (interval) {
      clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [lockoutTimer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', new URLSearchParams({
        username: username.trim(),
        password: password
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      // The backend now securely delegates an HttpOnly Set-Cookie header.
      // Therefore, we no longer touch localStorage for tokens.
      window.dispatchEvent(new Event('auth-change'));
      navigate(from, { replace: true });
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError(t.auth.invalidCredentials);
      } else if (err.response?.status === 429) {
        setError(t.auth.rateLimited);
        setLockoutTimer(60); // Set 60 second lockout
      } else {
        setError(t.auth.serverError);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full animate-in fade-in zoom-in duration-500">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-6 group hover:scale-105 transition-transform duration-300">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary fill-current transition-all">
              <path d="M11.5 1.5L20.5 6V18L11.5 22.5L2.5 18V6L11.5 1.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M11.5 12L20.5 6M11.5 12L2.5 6M11.5 12V22.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-2 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Jira Assign AI
          </h1>
          <p className="text-muted-foreground font-medium">
            {t.auth.loginDescription}
          </p>
        </div>

        <div className="bg-card border border-border shadow-2xl rounded-3xl p-8 backdrop-blur-sm bg-card/50">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium animate-in slide-in-from-top-2 duration-300">
                <AlertCircle size={18} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-bold ml-1 text-foreground/80">
                {t.auth.username}
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3.5 bg-background border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                  placeholder={t.auth.usernamePlaceholder}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold ml-1 text-foreground/80">
                {t.auth.password}
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-11 pr-11 py-3.5 bg-background border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || lockoutTimer > 0}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-4 rounded-2xl font-bold text-base shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : lockoutTimer > 0 ? (
                <>
                   <Lock size={20} className="mr-1" />
                   <span>Wait {lockoutTimer}s...</span>
                </>
              ) : (
                <>
                  <LogIn size={20} />
                  <span>{t.auth.signIn}</span>
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground font-medium uppercase tracking-widest">
          &copy; {new Date().getFullYear()} Jira Assign AI
        </p>
      </div>
    </div>
  );
};

export default Login;
