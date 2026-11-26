import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileSpreadsheet,
  GraduationCap,
  Search,
  Users,
  UserSquare2,
} from 'lucide-react';
import { apiRequest } from '../api.ts';
import type { CoursePerformance, NavSection, PortalSettings } from '../types.ts';

interface DashboardData {
  counts: {
    students: number;
    lecturers?: number;
    courses: number;
    registrations: number;
    paymentCount?: number;
    totalFeesCollected?: number;
    gradedResults?: number;
  };
  activeSemester?: {
    semester_id: number;
    semester_name: string;
    academic_year: string;
    start_date: string;
    end_date: string;
  } | null;
  recentRegistrations: Array<{
    registration_id: number;
    registration_number: string;
    student_name: string;
    course_code: string;
    course_name: string;
    semester: string;
    academic_year: string;
    registration_date: string;
    registration_status: string;
  }>;
  recentPayments?: Array<{
    payment_id: number;
    registration_number: string;
    student_name: string;
    amount_paid: number;
    payment_date: string;
    payment_method: string;
    transaction_reference: string;
  }>;
  coursePerformance: CoursePerformance[];
  examSummary: {
    total_graded: number;
    total_passed: number;
    total_failed: number;
    overall_average: number | null;
  };
  gradeDistribution?: Array<{ grade: string; count: number }>;
}

interface DashboardViewProps {
  onNavigate: (section: NavSection) => void;
  portalSettings?: PortalSettings | null;
}

const GRADE_BAR_COLORS: Record<string, string> = {
  A: 'bg-emerald-600',
  B: 'bg-blue-800',
  C: 'bg-sky-600',
  D: 'bg-amber-600',
  E: 'bg-rose-600',
};

export function DashboardView({ onNavigate, portalSettings }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [perfFilter, setPerfFilter] = useState<'active' | 'all'>('active');
  const [perfSearch, setPerfSearch] = useState('');

  const currencyLabel = portalSettings?.currency_label || 'KSh';

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<DashboardData>('/api/dashboard')
      .then((res) => {
        if (active) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const hasEnrolledCourses = useMemo(
    () => (data?.coursePerformance ?? []).some((cp) => cp.number_of_registered_students > 0),
    [data]
  );

  const visiblePerformance = useMemo(() => {
    if (!data) return [];
    const q = perfSearch.trim().toLowerCase();
    let list = data.coursePerformance;
    if (q) {
      list = list.filter(
        (cp) =>
          cp.course_code.toLowerCase().includes(q) || cp.course_name.toLowerCase().includes(q)
      );
    }
    if (perfFilter === 'active' && !q) {
      if (hasEnrolledCourses) {
        return list.filter((cp) => cp.number_of_registered_students > 0);
      }
      return list.slice(0, 8);
    }
    return list;
  }, [data, perfFilter, perfSearch, hasEnrolledCourses]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-72 rounded-md bg-slate-200/80" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg border border-slate-200 bg-white p-5" />
          ))}
        </div>
        <div className="h-64 rounded-lg border border-slate-200 bg-white" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {error || 'Unable to load dashboard data.'}
      </div>
    );
  }

  const isEmptyPortal =
    data.counts.students === 0 && (data.counts.lecturers ?? 0) === 0;

  const totalGradesCount = (data.gradeDistribution ?? []).reduce((sum, g) => sum + g.count, 0);

  return (
    <div className="space-y-7">
      {/* Header Row */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Academic &amp; Financial Overview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {portalSettings?.academic_calendar_note?.trim()
              ? portalSettings.academic_calendar_note
              : 'Real-time overview of enrollments, examination performance, and tuition collections.'}
          </p>
        </div>
        {data.activeSemester ? (
          <div className="text-xs text-slate-600 sm:text-right">
            <span className="font-semibold text-emerald-700">Active Semester:</span>{' '}
            <span className="font-medium text-slate-900">{data.activeSemester.semester_name}</span>
            <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{data.activeSemester.academic_year}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate('semesters')}
            className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-blue-900 hover:underline sm:self-auto whitespace-nowrap shrink-0"
          >
            <span>Configure active semester</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Interactive KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => onNavigate('students')}
          className="group rounded-lg border border-slate-200 bg-white p-5 text-left transition-all duration-150 hover:border-blue-900/40 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Students</span>
            <Users className="h-4 w-4 text-slate-400 transition-colors group-hover:text-blue-900" aria-hidden="true" />
          </div>
          <p className="mt-3 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {data.counts.students}
          </p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-900 opacity-0 transition-opacity group-hover:opacity-100">
            <span>Manage directory</span>
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('lecturers')}
          className="group rounded-lg border border-slate-200 bg-white p-5 text-left transition-all duration-150 hover:border-blue-900/40 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Lecturers</span>
            <UserSquare2 className="h-4 w-4 text-slate-400 transition-colors group-hover:text-blue-900" aria-hidden="true" />
          </div>
          <p className="mt-3 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {data.counts.lecturers ?? 0}
          </p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-900 opacity-0 transition-opacity group-hover:opacity-100">
            <span>Manage faculty</span>
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('courses')}
          className="group rounded-lg border border-slate-200 bg-white p-5 text-left transition-all duration-150 hover:border-blue-900/40 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Courses</span>
            <BookOpen className="h-4 w-4 text-slate-400 transition-colors group-hover:text-blue-900" aria-hidden="true" />
          </div>
          <p className="mt-3 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {data.counts.courses}
          </p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-900 opacity-0 transition-opacity group-hover:opacity-100">
            <span>View catalog</span>
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('registrations')}
          className="group rounded-lg border border-slate-200 bg-white p-5 text-left transition-all duration-150 hover:border-blue-900/40 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Course Registrations</span>
            <GraduationCap className="h-4 w-4 text-slate-400 transition-colors group-hover:text-blue-900" aria-hidden="true" />
          </div>
          <p className="mt-3 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {data.counts.registrations}
          </p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-900 opacity-0 transition-opacity group-hover:opacity-100">
            <span>Enrollments</span>
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('payments')}
          className="group rounded-lg border border-slate-200 bg-white p-5 text-left transition-all duration-150 hover:border-emerald-700/40 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Fee Payments</span>
            <CreditCard className="h-4 w-4 text-slate-400 transition-colors group-hover:text-emerald-700" aria-hidden="true" />
          </div>
          <p className="mt-3 font-mono text-xl font-bold text-emerald-700 tabular-nums">
            {currencyLabel}{' '}
            {Number(data.counts.totalFeesCollected ?? 0).toLocaleString('en-KE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="mt-2 font-mono text-xs text-slate-500 tabular-nums">
            {data.counts.paymentCount ?? 0} transactions
          </p>
        </button>
      </div>

      {/* Quick Operations Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 py-3">
        <span className="text-xs font-semibold text-slate-600">Quick Workflows</span>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: 'Register Student', section: 'students' as NavSection, icon: Users },
            { label: 'Add Lecturer', section: 'lecturers' as NavSection, icon: UserSquare2 },
            { label: 'Enroll Courses', section: 'registrations' as NavSection, icon: ClipboardCheck },
            { label: 'Enter Marks', section: 'examinations' as NavSection, icon: FileSpreadsheet },
            { label: 'Record Fee Payment', section: 'payments' as NavSection, icon: CreditCard },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.section}
                type="button"
                onClick={() => onNavigate(action.section)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 transition-colors hover:border-blue-900/50 hover:text-blue-900"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Getting Started Workflow Strip (Visible only while the registry is empty) */}
      {isEmptyPortal && (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Set Up Your Academic Registry
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Add records in order so courses, enrollments, examinations, and fee payments link cleanly.
            </p>
          </div>

          <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {[
              {
                step: '01',
                title: 'Add Lecturers',
                desc: 'Create faculty profiles before assigning courses.',
                target: 'lecturers' as NavSection,
                icon: UserSquare2,
              },
              {
                step: '02',
                title: 'Create Semesters',
                desc: 'Define academic years and designate the active term.',
                target: 'semesters' as NavSection,
                icon: CalendarDays,
              },
              {
                step: '03',
                title: 'Assign Course Lecturers',
                desc: 'Review the Kirinyaga University catalog and link lecturers.',
                target: 'courses' as NavSection,
                icon: BookOpen,
              },
              {
                step: '04',
                title: 'Register Students',
                desc: `Admit students, enroll courses, grade exams, and log ${currencyLabel} fees.`,
                target: 'students' as NavSection,
                icon: Users,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.step}
                  type="button"
                  onClick={() => onNavigate(item.target)}
                  className="group flex flex-col justify-between p-5 text-left transition-colors duration-150 hover:bg-slate-50"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-blue-900 tabular-nums">{item.step}</span>
                      <Icon className="h-4 w-4 text-slate-400 transition-colors group-hover:text-blue-900" aria-hidden="true" />
                    </div>
                    <h3 className="mt-2.5 text-sm font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.desc}</p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-blue-900">
                    <span>Open module</span>
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Examination Summary & Grade Distribution */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Examination Performance Summary</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Course averages, pass counts, and score ranges across the catalog
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 font-mono text-xs text-slate-600 tabular-nums">
            <span>Graded: <strong className="text-slate-900">{data.examSummary?.total_graded ?? 0}</strong></span>
            <span>Passed: <strong className="text-emerald-700">{data.examSummary?.total_passed ?? 0}</strong></span>
            <span>Failed: <strong className="text-red-700">{data.examSummary?.total_failed ?? 0}</strong></span>
            <span>Mean Score: <strong className="text-slate-900">{data.examSummary?.overall_average ?? '—'}%</strong></span>
          </div>
        </div>

        {/* Performance Filter Toolbar */}
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/60 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5 self-start">
            <button
              type="button"
              onClick={() => setPerfFilter('active')}
              className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                perfFilter === 'active'
                  ? 'bg-blue-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {hasEnrolledCourses ? 'Enrolled Courses Only' : 'Featured Preview (8)'}
            </button>
            <button
              type="button"
              onClick={() => setPerfFilter('all')}
              className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                perfFilter === 'all'
                  ? 'bg-blue-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Catalog ({data.coursePerformance.length})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={perfSearch}
              onChange={(e) => setPerfSearch(e.target.value)}
              placeholder="Filter course code or title..."
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-900 focus:border-blue-900 focus:outline-none"
            />
          </div>
        </div>

        {totalGradesCount > 0 && data.gradeDistribution && (
          <div className="border-b border-slate-200 bg-slate-50/40 px-6 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="font-medium text-slate-700">Grade Distribution</span>
              <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
                {data.gradeDistribution.map((g) => (
                  <span key={g.grade} className="text-slate-700">
                    Grade <strong className="text-slate-900">{g.grade}</strong>: {g.count}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-2.5 flex h-2 w-full overflow-hidden rounded-sm bg-slate-200">
              {data.gradeDistribution.map((g) => (
                <div
                  key={g.grade}
                  style={{ width: `${(g.count / totalGradesCount) * 100}%` }}
                  className={GRADE_BAR_COLORS[g.grade] ?? 'bg-slate-600'}
                  title={`Grade ${g.grade}: ${g.count}`}
                />
              ))}
            </div>
          </div>
        )}

        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-6 py-3">Course Code</th>
                <th className="px-6 py-3">Course Name</th>
                <th className="px-6 py-3 text-right">Registered</th>
                <th className="px-6 py-3 text-right">Average Marks</th>
                <th className="px-6 py-3 text-right">Highest</th>
                <th className="px-6 py-3 text-right">Lowest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visiblePerformance.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">
                    No courses match your filter.
                  </td>
                </tr>
              ) : (
                visiblePerformance.map((cp) => (
                  <tr key={cp.course_id} className="transition-colors hover:bg-slate-50">
                    <td className="px-6 py-3 font-mono text-xs font-semibold text-slate-900">
                      {cp.course_code}
                    </td>
                    <td className="px-6 py-3 text-slate-800">{cp.course_name}</td>
                    <td className="px-6 py-3 text-right font-mono tabular-nums text-slate-700">
                      {cp.number_of_registered_students}
                    </td>
                    <td className="px-6 py-3 text-right font-mono tabular-nums text-slate-900">
                      {cp.average_marks !== null ? `${cp.average_marks.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-6 py-3 text-right font-mono tabular-nums text-emerald-700">
                      {cp.highest_marks !== null ? `${cp.highest_marks.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-6 py-3 text-right font-mono tabular-nums text-slate-600">
                      {cp.lowest_marks !== null ? `${cp.lowest_marks.toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Registrations + Recent Fee Payments */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">Recent Student Registrations</h2>
            <button
              type="button"
              onClick={() => onNavigate('registrations')}
              className="flex items-center gap-1 whitespace-nowrap shrink-0 text-xs font-medium text-blue-900 hover:underline"
            >
              <span>View All</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-2.5">Reg. No.</th>
                  <th className="px-5 py-2.5">Student</th>
                  <th className="px-5 py-2.5">Course</th>
                  <th className="px-5 py-2.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.recentRegistrations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">
                      No course registrations found.
                    </td>
                  </tr>
                ) : (
                  data.recentRegistrations.map((reg) => (
                    <tr key={reg.registration_id} className="transition-colors hover:bg-slate-50">
                      <td className="px-5 py-2.5 font-mono text-xs text-slate-700">
                        {reg.registration_number}
                      </td>
                      <td className="px-5 py-2.5 font-medium text-slate-900">{reg.student_name}</td>
                      <td className="px-5 py-2.5 text-slate-700">
                        <span className="font-mono text-xs font-medium">{reg.course_code}</span>
                        <span className="mx-1 text-slate-400">·</span>
                        <span>{reg.semester}</span>
                      </td>
                      <td className="px-5 py-2.5 font-mono text-xs text-slate-500 tabular-nums">
                        {reg.registration_date}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">Recent Fee Payments</h2>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="flex items-center gap-1 whitespace-nowrap shrink-0 text-xs font-medium text-blue-900 hover:underline"
            >
              <span>View Ledger</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-2.5">Student</th>
                  <th className="px-5 py-2.5">Reference</th>
                  <th className="px-5 py-2.5 text-right">Amount</th>
                  <th className="px-5 py-2.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {!data.recentPayments || data.recentPayments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">
                      No fee payments recorded yet.
                    </td>
                  </tr>
                ) : (
                  data.recentPayments.map((pay) => (
                    <tr key={pay.payment_id} className="transition-colors hover:bg-slate-50">
                      <td className="px-5 py-2.5">
                        <div className="font-medium text-slate-900">{pay.student_name}</div>
                        <div className="font-mono text-xs text-slate-500">{pay.registration_number}</div>
                      </td>
                      <td className="px-5 py-2.5 font-mono text-xs text-slate-600">
                        {pay.transaction_reference}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono font-medium text-emerald-700 tabular-nums">
                        {currencyLabel}{' '}
                        {Number(pay.amount_paid).toLocaleString('en-KE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-5 py-2.5 font-mono text-xs text-slate-500 tabular-nums">
                        {pay.payment_date}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
