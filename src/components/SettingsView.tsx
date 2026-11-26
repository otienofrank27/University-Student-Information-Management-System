import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Building2,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  LogOut,
  Save,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { apiRequest } from '../api.ts';
import type { AuthUser, GradingConfig, PortalSettings } from '../types.ts';

interface SettingsViewProps {
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onSettingsUpdated: (settings: PortalSettings) => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

type SettingsTab = 'profile' | 'security' | 'institution' | 'grading';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getPasswordStrength(pw: string): { label: string; pct: number; color: string } {
  if (!pw) return { label: 'Enter password', pct: 0, color: 'bg-slate-200' };
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;

  if (score <= 2) return { label: 'Weak', pct: 33, color: 'bg-red-500' };
  if (score <= 3) return { label: 'Fair', pct: 66, color: 'bg-amber-500' };
  return { label: 'Strong', pct: 100, color: 'bg-emerald-600' };
}

export function SettingsView({
  user,
  onUserUpdated,
  onSettingsUpdated,
  onNotify,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [loading, setLoading] = useState(true);

  // Profile state
  const [fullName, setFullName] = useState(user.fullName);
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [department, setDepartment] = useState(user.department);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password & sessions state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [activeSessions, setActiveSessions] = useState<number>(1);
  const [revokingSessions, setRevokingSessions] = useState(false);

  // Recovery PIN state
  const [pinCurrentPassword, setPinCurrentPassword] = useState('');
  const [newRecoveryPin, setNewRecoveryPin] = useState('');
  const [showPinCurrentPw, setShowPinCurrentPw] = useState(false);
  const [showNewRecoveryPin, setShowNewRecoveryPin] = useState(false);
  const [savingRecoveryPin, setSavingRecoveryPin] = useState(false);

  // Institution & Portal defaults state
  const [portalForm, setPortalForm] = useState<PortalSettings>({
    id: 1,
    institution_name: 'University Students Information Management System',
    registry_email: '',
    reg_number_prefix: 'UNI',
    default_credit_hours: 3,
    default_payment_method: 'M-Pesa',
    currency_label: 'KSh',
    academic_calendar_note: '',
  });
  const [savingPortal, setSavingPortal] = useState(false);

  // Grading policy state
  const [gradingForm, setGradingForm] = useState<GradingConfig>({
    id: 1,
    exam_weight: 0.7,
    assignment_weight: 0.3,
    grade_a_min: 70,
    grade_b_min: 60,
    grade_c_min: 50,
    grade_d_min: 40,
    pass_min: 40,
  });
  const [savingGrading, setSavingGrading] = useState(false);

  useEffect(() => {
    setFullName(user.fullName);
    setUsername(user.username);
    setEmail(user.email);
    setDepartment(user.department);
  }, [user]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, sessionsRes] = await Promise.all([
        apiRequest<{ portalSettings: PortalSettings; gradingConfig: GradingConfig }>('/api/settings'),
        apiRequest<{ activeSessions: number }>('/api/auth/sessions'),
      ]);
      if (settingsRes.portalSettings) {
        setPortalForm(settingsRes.portalSettings);
      }
      if (settingsRes.gradingConfig) {
        setGradingForm(settingsRes.gradingConfig);
      }
      setActiveSessions(sessionsRes.activeSessions);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await apiRequest<{ user: AuthUser }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ fullName, username, email, department }),
      });
      onUserUpdated(res.user);
      onNotify('success', 'Your account profile has been updated.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to update profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      onNotify('error', 'New password and confirmation do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await apiRequest<{ message: string; revokedOtherSessions: number }>(
        '/api/auth/password',
        {
          method: 'PUT',
          body: JSON.stringify({ currentPassword, newPassword }),
        }
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setActiveSessions(1);
      onNotify(
        'success',
        res.revokedOtherSessions > 0
          ? `${res.message} Signed out ${res.revokedOtherSessions} other active session(s).`
          : res.message
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleRevokeOtherSessions() {
    setRevokingSessions(true);
    try {
      const res = await apiRequest<{ message: string; revokedCount: number }>(
        '/api/auth/sessions/others',
        { method: 'DELETE' }
      );
      setActiveSessions(1);
      onNotify('success', res.message);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to revoke other sessions.');
    } finally {
      setRevokingSessions(false);
    }
  }

  async function handleSaveRecoveryPin(e: FormEvent) {
    e.preventDefault();
    if (newRecoveryPin.trim().length < 4 || newRecoveryPin.trim().length > 24) {
      onNotify('error', 'Recovery PIN must be between 4 and 24 characters.');
      return;
    }
    setSavingRecoveryPin(true);
    try {
      const res = await apiRequest<{ message: string; hasRecoveryPin: boolean }>(
        '/api/auth/recovery-pin',
        {
          method: 'PUT',
          body: JSON.stringify({
            currentPassword: pinCurrentPassword,
            recoveryPin: newRecoveryPin.trim(),
          }),
        }
      );
      setPinCurrentPassword('');
      setNewRecoveryPin('');
      onUserUpdated({ ...user, hasRecoveryPin: res.hasRecoveryPin });
      onNotify('success', res.message);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to save Recovery PIN.');
    } finally {
      setSavingRecoveryPin(false);
    }
  }

  async function handleSavePortal(e: FormEvent) {
    e.preventDefault();
    setSavingPortal(true);
    try {
      const res = await apiRequest<{ portalSettings: PortalSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(portalForm),
      });
      setPortalForm(res.portalSettings);
      onSettingsUpdated(res.portalSettings);
      onNotify('success', 'Institution and portal preferences saved.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to save portal preferences.');
    } finally {
      setSavingPortal(false);
    }
  }

  async function handleSaveGrading(e: FormEvent) {
    e.preventDefault();
    setSavingGrading(true);
    try {
      const res = await apiRequest<{ gradingConfig: GradingConfig }>('/api/db-lab/grading-config', {
        method: 'PUT',
        body: JSON.stringify(gradingForm),
      });
      setGradingForm(res.gradingConfig);
      onNotify('success', 'Grading policy saved and existing examination totals recalculated.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to update grading policy.');
    } finally {
      setSavingGrading(false);
    }
  }

  const strength = getPasswordStrength(newPassword);
  const weightSum = Number((Number(gradingForm.exam_weight) + Number(gradingForm.assignment_weight)).toFixed(2));
  const currentYear = new Date().getFullYear();
  const previewPrefix =
    portalForm.reg_number_prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'UNI';

  const tabs: Array<{ id: SettingsTab; label: string; icon: typeof UserCog }> = [
    { id: 'profile', label: 'My Profile', icon: UserCog },
    { id: 'security', label: 'Security & Sessions', icon: KeyRound },
    { id: 'institution', label: 'Institution & Defaults', icon: Building2 },
    { id: 'grading', label: 'Grading Policy', icon: GraduationCap },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Account &amp; System Settings
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{user.fullName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">@{user.username}</span>
            <span aria-hidden="true">·</span>
            <span>{user.department}</span>
          </div>
        </div>
      </div>

      {/* Section Navigation Tabs */}
      <div
        className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1"
        role="tablist"
        aria-label="Settings sections"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-500">
          Loading account and portal configuration...
        </div>
      ) : (
        <>
          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-900 text-sm font-bold text-white"
                    aria-hidden="true"
                  >
                    {getInitials(fullName || user.fullName)}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Profile Details</h2>
                    <p className="text-xs text-slate-500">
                      Update your display name, username, contact email, and assigned department.
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  Account ID #{user.userId}
                </span>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-5 p-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="profile-fullname"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Full Name
                    </label>
                    <input
                      id="profile-fullname"
                      type="text"
                      required
                      minLength={2}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="profile-username"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Username
                    </label>
                    <input
                      id="profile-username"
                      type="text"
                      required
                      minLength={3}
                      maxLength={32}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="profile-email"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Email Address
                    </label>
                    <input
                      id="profile-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="profile-department"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Department / Office
                    </label>
                    <input
                      id="profile-department"
                      type="text"
                      required
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end border-t border-slate-200 pt-4">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="inline-flex items-center gap-2 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white whitespace-nowrap shrink-0 transition-colors hover:bg-blue-800 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{savingProfile ? 'Saving Profile...' : 'Save Profile Changes'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: SECURITY & SESSIONS */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-6 py-5">
                  <h2 className="text-base font-semibold text-slate-900">Change Password</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Updating your password verifies your current credential and terminates any other
                    signed-in browser sessions.
                  </p>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-5 p-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="sm:col-span-2 max-w-md">
                      <label
                        htmlFor="sec-current-pw"
                        className="block text-xs font-medium text-slate-700"
                      >
                        Current Password
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="sec-current-pw"
                          type={showCurrentPw ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white py-2 pr-10 pl-3 text-sm text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPw((v) => !v)}
                          className="absolute inset-y-0 right-2 flex items-center px-1.5 text-slate-400 hover:text-slate-700"
                          aria-label={showCurrentPw ? 'Hide current password' : 'Show current password'}
                        >
                          {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="sec-new-pw"
                        className="block text-xs font-medium text-slate-700"
                      >
                        New Password (minimum 8 characters)
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="sec-new-pw"
                          type={showNewPw ? 'text' : 'password'}
                          required
                          minLength={8}
                          autoComplete="new-password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white py-2 pr-10 pl-3 text-sm text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPw((v) => !v)}
                          className="absolute inset-y-0 right-2 flex items-center px-1.5 text-slate-400 hover:text-slate-700"
                          aria-label={showNewPw ? 'Hide new password' : 'Show new password'}
                        >
                          {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {newPassword && (
                        <div className="mt-2 space-y-1">
                          <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-100">
                            <div
                              className={`h-full transition-all duration-200 ${strength.color}`}
                              style={{ width: `${strength.pct}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-slate-500">Strength: {strength.label}</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="sec-confirm-pw"
                        className="block text-xs font-medium text-slate-700"
                      >
                        Confirm New Password
                      </label>
                      <input
                        id="sec-confirm-pw"
                        type={showNewPw ? 'text' : 'password'}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end border-t border-slate-200 pt-4">
                    <button
                      type="submit"
                      disabled={savingPassword}
                      className="inline-flex items-center gap-2 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white whitespace-nowrap shrink-0 transition-colors hover:bg-blue-800 disabled:opacity-60"
                    >
                      <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{savingPassword ? 'Updating...' : 'Update Password'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Recovery PIN Configuration */}
              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="flex flex-col gap-2 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      Self-Service Recovery PIN
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Allows you to verify your identity on the sign-in screen and reset a forgotten
                      password.
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      user.hasRecoveryPin ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{user.hasRecoveryPin ? 'Configured' : 'Not configured'}</span>
                  </span>
                </div>

                <form onSubmit={handleSaveRecoveryPin} className="space-y-5 p-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="pin-current-pw"
                        className="block text-xs font-medium text-slate-700"
                      >
                        Current Password
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="pin-current-pw"
                          type={showPinCurrentPw ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={pinCurrentPassword}
                          onChange={(e) => setPinCurrentPassword(e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white py-2 pr-10 pl-3 text-sm text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPinCurrentPw((v) => !v)}
                          className="absolute inset-y-0 right-2 flex items-center px-1.5 text-slate-400 hover:text-slate-700"
                          aria-label={
                            showPinCurrentPw ? 'Hide current password' : 'Show current password'
                          }
                        >
                          {showPinCurrentPw ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="pin-new-value"
                        className="block text-xs font-medium text-slate-700"
                      >
                        {user.hasRecoveryPin ? 'New Recovery PIN (4–24 chars)' : 'Recovery PIN (4–24 chars)'}
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="pin-new-value"
                          type={showNewRecoveryPin ? 'text' : 'password'}
                          required
                          minLength={4}
                          maxLength={24}
                          autoComplete="off"
                          value={newRecoveryPin}
                          onChange={(e) => setNewRecoveryPin(e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white py-2 pr-10 pl-3 font-mono text-sm text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewRecoveryPin((v) => !v)}
                          className="absolute inset-y-0 right-2 flex items-center px-1.5 text-slate-400 hover:text-slate-700"
                          aria-label={
                            showNewRecoveryPin ? 'Hide recovery PIN' : 'Show recovery PIN'
                          }
                        >
                          {showNewRecoveryPin ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end border-t border-slate-200 pt-4">
                    <button
                      type="submit"
                      disabled={savingRecoveryPin}
                      className="inline-flex items-center gap-2 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white whitespace-nowrap shrink-0 transition-colors hover:bg-blue-800 disabled:opacity-60"
                    >
                      <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        {savingRecoveryPin
                          ? 'Saving...'
                          : user.hasRecoveryPin
                            ? 'Update Recovery PIN'
                            : 'Set Recovery PIN'}
                      </span>
                    </button>
                  </div>
                </form>
              </div>

              <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Active Sessions</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Currently holding{' '}
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {activeSessions}
                    </span>{' '}
                    active session{activeSessions === 1 ? '' : 's'} for @{user.username}.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={revokingSessions || activeSessions <= 1}
                  onClick={() => void handleRevokeOtherSessions()}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 whitespace-nowrap shrink-0 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {revokingSessions ? 'Signing Out...' : 'Sign Out Other Devices'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: INSTITUTION & DEFAULTS */}
          {activeTab === 'institution' && (
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-6 py-5">
                <h2 className="text-base font-semibold text-slate-900">
                  Institution &amp; Academic Registry Defaults
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Configure institutional metadata, registration number generation prefix, and
                  default values applied when creating courses or recording KSh payments.
                </p>
              </div>

              <form onSubmit={handleSavePortal} className="space-y-5 p-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="inst-name"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Institution / Portal Display Name
                    </label>
                    <input
                      id="inst-name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={120}
                      value={portalForm.institution_name}
                      onChange={(e) =>
                        setPortalForm((prev) => ({ ...prev, institution_name: e.target.value }))
                      }
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="inst-email"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Registry Contact Email
                    </label>
                    <input
                      id="inst-email"
                      type="email"
                      value={portalForm.registry_email}
                      onChange={(e) =>
                        setPortalForm((prev) => ({ ...prev, registry_email: e.target.value }))
                      }
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="inst-prefix"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Student Registration Number Prefix
                    </label>
                    <input
                      id="inst-prefix"
                      type="text"
                      required
                      maxLength={10}
                      value={portalForm.reg_number_prefix}
                      onChange={(e) =>
                        setPortalForm((prev) => ({
                          ...prev,
                          reg_number_prefix: e.target.value.toUpperCase(),
                        }))
                      }
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                    <p className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
                      Generated format: {previewPrefix}-{currentYear}-001
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="inst-credits"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Default Course Credit Hours
                    </label>
                    <input
                      id="inst-credits"
                      type="number"
                      min={1}
                      max={12}
                      required
                      value={portalForm.default_credit_hours}
                      onChange={(e) =>
                        setPortalForm((prev) => ({
                          ...prev,
                          default_credit_hours: Number(e.target.value) || 3,
                        }))
                      }
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="inst-pay-method"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Default Fee Payment Method
                    </label>
                    <select
                      id="inst-pay-method"
                      value={portalForm.default_payment_method}
                      onChange={(e) =>
                        setPortalForm((prev) => ({
                          ...prev,
                          default_payment_method: e.target.value,
                        }))
                      }
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    >
                      <option value="M-Pesa">M-Pesa</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="EFT">EFT</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Card">Card</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="inst-currency"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Tuition Currency Label
                    </label>
                    <select
                      id="inst-currency"
                      value={portalForm.currency_label}
                      onChange={(e) =>
                        setPortalForm((prev) => ({ ...prev, currency_label: e.target.value }))
                      }
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    >
                      <option value="KSh">KSh (Kenyan Shilling)</option>
                      <option value="KES">KES (ISO Code)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="inst-note"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Academic Calendar / Registry Note
                    </label>
                    <input
                      id="inst-note"
                      type="text"
                      maxLength={200}
                      value={portalForm.academic_calendar_note}
                      onChange={(e) =>
                        setPortalForm((prev) => ({
                          ...prev,
                          academic_calendar_note: e.target.value,
                        }))
                      }
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end border-t border-slate-200 pt-4">
                  <button
                    type="submit"
                    disabled={savingPortal}
                    className="inline-flex items-center gap-2 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white whitespace-nowrap shrink-0 transition-colors hover:bg-blue-800 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{savingPortal ? 'Saving...' : 'Save Institution Defaults'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 4: GRADING POLICY */}
          {activeTab === 'grading' && (
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-6 py-5">
                <h2 className="text-base font-semibold text-slate-900">
                  Examination Weighting &amp; Grade Thresholds
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Adjust weighted scoring ratios and letter-grade thresholds. Saving automatically
                  recalculates all existing examination results.
                </p>
              </div>

              <form onSubmit={handleSaveGrading} className="space-y-5 p-6">
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label
                      htmlFor="grade-exam-w"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Exam Weight (0.00–1.00)
                    </label>
                    <input
                      id="grade-exam-w"
                      type="number"
                      step="0.05"
                      min={0}
                      max={1}
                      required
                      value={gradingForm.exam_weight}
                      onChange={(e) =>
                        setGradingForm((prev) => ({
                          ...prev,
                          exam_weight: Number(e.target.value),
                        }))
                      }
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="grade-assign-w"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Assignment Weight (0.00–1.00)
                    </label>
                    <input
                      id="grade-assign-w"
                      type="number"
                      step="0.05"
                      min={0}
                      max={1}
                      required
                      value={gradingForm.assignment_weight}
                      onChange={(e) =>
                        setGradingForm((prev) => ({
                          ...prev,
                          assignment_weight: Number(e.target.value),
                        }))
                      }
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="grade-pass"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Pass Mark Minimum
                    </label>
                    <input
                      id="grade-pass"
                      type="number"
                      min={0}
                      max={100}
                      required
                      value={gradingForm.pass_min}
                      onChange={(e) =>
                        setGradingForm((prev) => ({ ...prev, pass_min: Number(e.target.value) }))
                      }
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col justify-end pb-2">
                    <span
                      className={`font-mono text-xs font-medium tabular-nums ${
                        Math.abs(weightSum - 1) <= 0.001 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      Combined Weight: {(weightSum * 100).toFixed(0)}%{' '}
                      {Math.abs(weightSum - 1) <= 0.001 ? '(Valid)' : '(Must equal 100%)'}
                    </span>
                  </div>
                </div>

                <div className="grid gap-5 border-t border-slate-200 pt-5 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label
                      htmlFor="grade-a"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Grade A Minimum
                    </label>
                    <input
                      id="grade-a"
                      type="number"
                      min={1}
                      max={100}
                      required
                      value={gradingForm.grade_a_min}
                      onChange={(e) =>
                        setGradingForm((prev) => ({
                          ...prev,
                          grade_a_min: Number(e.target.value),
                        }))
                      }
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="grade-b"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Grade B Minimum
                    </label>
                    <input
                      id="grade-b"
                      type="number"
                      min={1}
                      max={99}
                      required
                      value={gradingForm.grade_b_min}
                      onChange={(e) =>
                        setGradingForm((prev) => ({
                          ...prev,
                          grade_b_min: Number(e.target.value),
                        }))
                      }
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="grade-c"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Grade C Minimum
                    </label>
                    <input
                      id="grade-c"
                      type="number"
                      min={1}
                      max={98}
                      required
                      value={gradingForm.grade_c_min}
                      onChange={(e) =>
                        setGradingForm((prev) => ({
                          ...prev,
                          grade_c_min: Number(e.target.value),
                        }))
                      }
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="grade-d"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Grade D Minimum
                    </label>
                    <input
                      id="grade-d"
                      type="number"
                      min={0}
                      max={97}
                      required
                      value={gradingForm.grade_d_min}
                      onChange={(e) =>
                        setGradingForm((prev) => ({
                          ...prev,
                          grade_d_min: Number(e.target.value),
                        }))
                      }
                      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end border-t border-slate-200 pt-4">
                  <button
                    type="submit"
                    disabled={savingGrading}
                    className="inline-flex items-center gap-2 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white whitespace-nowrap shrink-0 transition-colors hover:bg-blue-800 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{savingGrading ? 'Applying...' : 'Save Grading Policy'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
