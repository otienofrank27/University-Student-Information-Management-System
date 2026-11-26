import { useCallback, useEffect, useState } from 'react';
import { apiRequest, setAuthToken, setUnauthorizedHandler } from './api.ts';
import { AuthView } from './components/AuthView.tsx';
import { CoursesView } from './components/CoursesView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { DatabaseLabView } from './components/DatabaseLabView.tsx';
import { ExaminationsView } from './components/ExaminationsView.tsx';
import { Layout } from './components/Layout.tsx';
import { LecturersView } from './components/LecturersView.tsx';
import { PaymentsView } from './components/PaymentsView.tsx';
import { RegistrationsView } from './components/RegistrationsView.tsx';
import { SemestersView } from './components/SemestersView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { StudentsView } from './components/StudentsView.tsx';
import { ToastStack } from './components/ToastStack.tsx';
import type {
  AuthStatus,
  AuthUser,
  NavSection,
  PortalSettings,
  ThemeMode,
  ToastMessage,
} from './types.ts';

function getInitialTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem('usims_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {
    // Ignore storage access restrictions
  }
  return 'light';
}

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [portalSettings, setPortalSettings] = useState<PortalSettings | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [section, setSection] = useState<NavSection>('dashboard');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem('usims_theme', theme);
    } catch {
      // Ignore storage access restrictions
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const notify = useCallback((type: 'success' | 'error', text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await apiRequest<AuthStatus>('/api/auth/status');
      setAuthStatus(status);
      setAuthError(null);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to reach authentication service.');
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthToken(null);
      setUser(null);
      setPortalSettings(null);
      void refreshStatus();
    });
    return () => setUnauthorizedHandler(null);
  }, [refreshStatus]);

  useEffect(() => {
    if (!user) return;
    apiRequest<{ portalSettings: PortalSettings }>('/api/settings')
      .then((res) => setPortalSettings(res.portalSettings))
      .catch(() => {});
  }, [user]);

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clear local memory session regardless
    }
    setAuthToken(null);
    setUser(null);
    setPortalSettings(null);
    setSection('dashboard');
    await refreshStatus();
  };

  if (!user) {
    if (authError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 dark:bg-slate-950">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h1 className="text-base font-semibold text-slate-900 dark:text-white">
              Connection Error
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{authError}</p>
            <button
              type="button"
              onClick={() => void refreshStatus()}
              className="mt-4 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    if (!authStatus) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
          <div className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-400">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-900 dark:border-slate-700 dark:border-t-blue-400"
              aria-hidden="true"
            />
            <span>Loading academic portal...</span>
          </div>
        </div>
      );
    }

    return (
      <AuthView
        status={authStatus}
        theme={theme}
        onToggleTheme={toggleTheme}
        onAuthenticated={(authenticatedUser) => {
          setUser(authenticatedUser);
          setSection('dashboard');
        }}
      />
    );
  }

  return (
    <>
      <Layout
        user={user}
        activeSection={section}
        onSelectSection={setSection}
        onLogout={() => void handleLogout()}
        institutionName={portalSettings?.institution_name}
        theme={theme}
        onToggleTheme={toggleTheme}
      >
        {section === 'dashboard' && (
          <DashboardView onNavigate={setSection} portalSettings={portalSettings} />
        )}
        {section === 'students' && (
          <StudentsView
            onNotify={notify}
            currencyLabel={portalSettings?.currency_label}
          />
        )}
        {section === 'lecturers' && <LecturersView onNotify={notify} />}
        {section === 'courses' && (
          <CoursesView
            onNotify={notify}
            defaultCreditHours={portalSettings?.default_credit_hours}
          />
        )}
        {section === 'semesters' && <SemestersView onNotify={notify} />}
        {section === 'registrations' && <RegistrationsView onNotify={notify} />}
        {section === 'examinations' && <ExaminationsView onNotify={notify} />}
        {section === 'payments' && (
          <PaymentsView
            onNotify={notify}
            defaultPaymentMethod={portalSettings?.default_payment_method}
            currencyLabel={portalSettings?.currency_label}
          />
        )}
        {section === 'db-lab' && <DatabaseLabView onNotify={notify} />}
        {section === 'settings' && (
          <SettingsView
            user={user}
            onUserUpdated={setUser}
            onSettingsUpdated={setPortalSettings}
            onNotify={notify}
          />
        )}
      </Layout>
      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </>
  );
}
