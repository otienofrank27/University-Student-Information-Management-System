import { useState, type ReactNode } from 'react';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  Database,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  Users,
  UserSquare2,
  X,
} from 'lucide-react';
import type { AuthUser, NavSection, ThemeMode } from '../types.ts';
import { BrandLogo } from './BrandLogo.tsx';

interface LayoutProps {
  user: AuthUser;
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onLogout: () => void;
  institutionName?: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  children: ReactNode;
}

interface NavItem {
  id: NavSection;
  label: string;
  icon: typeof LayoutDashboard;
  group: 'academics' | 'operations';
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'academics' },
  { id: 'students', label: 'Students', icon: Users, group: 'academics' },
  { id: 'lecturers', label: 'Lecturers', icon: UserSquare2, group: 'academics' },
  { id: 'courses', label: 'Courses', icon: BookOpen, group: 'academics' },
  { id: 'semesters', label: 'Semesters', icon: CalendarDays, group: 'academics' },
  { id: 'registrations', label: 'Registrations', icon: ClipboardCheck, group: 'operations' },
  { id: 'examinations', label: 'Examinations', icon: FileSpreadsheet, group: 'operations' },
  { id: 'payments', label: 'Fee Payments', icon: CreditCard, group: 'operations' },
  { id: 'db-lab', label: 'Database & SQL Lab', icon: Database, group: 'operations' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'operations' },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function Layout({
  user,
  activeSection,
  onSelectSection,
  onLogout,
  institutionName,
  theme,
  onToggleTheme,
  children,
}: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const displayPortalName =
    institutionName?.trim() || 'University Students Information Management System';

  const activeItem = NAV_ITEMS.find((i) => i.id === activeSection) ?? NAV_ITEMS[0];
  const academicItems = NAV_ITEMS.filter((i) => i.group === 'academics');
  const operationItems = NAV_ITEMS.filter((i) => i.group === 'operations');

  const handleSelect = (id: NavSection) => {
    onSelectSection(id);
    setMobileOpen(false);
  };

  const renderNavGroup = (title: string, items: NavItem[]) => (
    <div>
      <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-400">
        {title}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeSection;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`group flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                isActive
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </span>
              {isActive && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-blue-200" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  const sidebarContent = (
    <div className="flex h-full flex-col border-r border-slate-800 bg-slate-900 text-slate-200">
      <div className="flex min-h-16 items-center border-b border-slate-800 px-5 py-3.5">
        <BrandLogo size="sm" theme="dark" />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Primary Navigation">
        {renderNavGroup('Academic Directory', academicItems)}
        {renderNavGroup('Operations & SQL', operationItems)}
      </nav>

      <div className="border-t border-slate-800 bg-slate-950/40 p-4">
        <button
          type="button"
          onClick={() => handleSelect('settings')}
          className="flex w-full items-center gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-slate-800/70"
          title="Open profile and system settings"
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-blue-700/60 bg-blue-900/70 text-xs font-semibold text-white"
            aria-hidden="true"
          >
            {getInitials(user.fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{user.fullName}</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">
              @{user.username} · {user.department}
            </p>
          </div>
          <Settings className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 lg:flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-64">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-72">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 rounded p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
              aria-label="Close navigation menu"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden max-w-xs truncate text-slate-500 dark:text-slate-400 sm:inline whitespace-nowrap">
                {displayPortalName}
              </span>
              <span className="hidden text-slate-300 dark:text-slate-700 sm:inline" aria-hidden="true">
                /
              </span>
              <span className="truncate font-semibold text-slate-900 dark:text-white">
                {activeItem.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden text-xs text-slate-500 dark:text-slate-400 md:inline whitespace-nowrap">
              {user.fullName} · {user.department}
            </span>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white p-1.5 text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700"
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleSelect('settings')}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                activeSection === 'settings'
                  ? 'border-blue-900 bg-blue-900 text-white dark:border-blue-500 dark:bg-blue-600'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700'
              }`}
            >
              <Settings className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Settings</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-5 lg:p-8">
          <div key={activeSection} className="animate-panel-enter mx-auto max-w-7xl">
            {children}
          </div>
        </main>

        <footer className="border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <p>&copy; {new Date().getFullYear()} {displayPortalName}</p>
            <nav className="flex flex-wrap items-center gap-4" aria-label="Footer navigation">
              <button
                type="button"
                onClick={() => handleSelect('dashboard')}
                className="transition-colors hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => handleSelect('courses')}
                className="transition-colors hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
              >
                Courses
              </button>
              <button
                type="button"
                onClick={() => handleSelect('db-lab')}
                className="transition-colors hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
              >
                Database &amp; SQL Lab
              </button>
              <button
                type="button"
                onClick={() => handleSelect('settings')}
                className="transition-colors hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
              >
                Settings
              </button>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}
