import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  CheckCircle2,
  Download,
  Play,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { apiDownloadFile, apiRequest } from '../api.ts';
import type { Course, GradingConfig, Semester, Student } from '../types.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface DatabaseLabViewProps {
  onNotify: (type: 'success' | 'error', text: string) => void;
}

type LabTab = 'objects' | 'procedures' | 'queries' | 'grading' | 'backup' | 'mysql';

interface OverviewResponse {
  tables: Array<{
    name: string;
    rowCount: number;
    columns: Array<{ name: string; type: string; pk: number; notnull: number }>;
    indexes: Array<{ name: string; unique: number }>;
  }>;
  triggers: Array<{ name: string; tbl_name: string; sql: string }>;
  views: Array<{ name: string; sql: string }>;
  gradingConfig: GradingConfig;
  mysqlScripts: Array<{ filename: string; content: string }>;
}

interface BackupFile {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export function DatabaseLabView({ onNotify }: DatabaseLabViewProps) {
  const [tab, setTab] = useState<LabTab>('objects');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedView, setSelectedView] = useState('student_results_view');
  const [viewRows, setViewRows] = useState<Array<Record<string, unknown>>>([]);
  const [procName, setProcName] = useState('GetStudentDetails');
  const [procStudentId, setProcStudentId] = useState('');
  const [procCourseId, setProcCourseId] = useState('');
  const [procSemesterId, setProcSemesterId] = useState('');
  const [procResult, setProcResult] = useState<{
    sqlPreview: string;
    rows: Array<Record<string, unknown>>;
  } | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);

  const [demoResult, setDemoResult] = useState<{
    title: string;
    category: string;
    sql: string;
    rows: Array<Record<string, unknown>>;
    plan: Array<Record<string, unknown>>;
  } | null>(null);

  const [permChecks, setPermChecks] = useState<
    Array<{ test: string; expected: string; actual: string; passed: boolean }>
  >([]);
  const [gradingForm, setGradingForm] = useState<GradingConfig | null>(null);

  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [backupPreview, setBackupPreview] = useState<string | null>(null);
  const [restoreConfirmFile, setRestoreConfirmFile] = useState<string | null>(null);
  const [uploadedSql, setUploadedSql] = useState<string>('');
  const [restoreReport, setRestoreReport] = useState<{
    message: string;
    statementsExecuted: number;
    verifiedCounts: Record<string, number>;
  } | null>(null);
  const [busyBackup, setBusyBackup] = useState(false);

  const [activeScriptName, setActiveScriptName] = useState('schema.sql');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, sRes, cRes, semRes, bRes] = await Promise.all([
        apiRequest<OverviewResponse>('/api/db-lab/overview'),
        apiRequest<{ students: Student[] }>('/api/students?limit=100'),
        apiRequest<{ courses: Course[] }>('/api/courses'),
        apiRequest<{ semesters: Semester[] }>('/api/semesters'),
        apiRequest<{ backups: BackupFile[] }>('/api/backup/list'),
      ]);
      setOverview(ov);
      setGradingForm(ov.gradingConfig);
      setStudents(sRes.students);
      setCourses(cRes.courses);
      setSemesters(semRes.semesters);
      setBackups(bRes.backups);
      if (sRes.students[0]) setProcStudentId((prev) => prev || String(sRes.students[0].student_id));
      if (cRes.courses[0]) setProcCourseId((prev) => prev || String(cRes.courses[0].course_id));
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load database lab.');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function runView(viewName: string) {
    setSelectedView(viewName);
    try {
      const res = await apiRequest<{ rows: Array<Record<string, unknown>> }>(
        `/api/db-lab/view/${viewName}`
      );
      setViewRows(res.rows);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to query view.');
    }
  }

  async function runProcedure(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await apiRequest<{
        sqlPreview: string;
        rows: Array<Record<string, unknown>>;
      }>('/api/db-lab/procedure', {
        method: 'POST',
        body: JSON.stringify({
          procedureName: procName,
          studentId: Number(procStudentId),
          courseId: Number(procCourseId),
          semesterId: procSemesterId ? Number(procSemesterId) : null,
        }),
      });
      setProcResult(res);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Procedure execution failed.');
    }
  }

  async function runQueryDemo(demoId: string) {
    try {
      const res = await apiRequest<{
        title: string;
        category: string;
        sql: string;
        rows: Array<Record<string, unknown>>;
        plan: Array<Record<string, unknown>>;
      }>('/api/db-lab/query-demo', {
        method: 'POST',
        body: JSON.stringify({ demoId }),
      });
      setDemoResult(res);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Query demo failed.');
    }
  }

  async function runConstraintTests() {
    try {
      const res = await apiRequest<{
        checks: Array<{ test: string; expected: string; actual: string; passed: boolean }>;
      }>('/api/db-lab/test-permissions', { method: 'POST' });
      setPermChecks(res.checks);
      onNotify('success', 'Database constraints and trigger diagnostics completed.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Verification suite failed.');
    }
  }

  async function handleSaveGrading(e: FormEvent) {
    e.preventDefault();
    if (!gradingForm) return;
    try {
      const res = await apiRequest<{ gradingConfig: GradingConfig }>('/api/db-lab/grading-config', {
        method: 'PUT',
        body: JSON.stringify(gradingForm),
      });
      setGradingForm(res.gradingConfig);
      onNotify('success', 'Grading scheme updated and existing results recalculated via triggers.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to update grading scheme.');
    }
  }

  async function handleCreateBackup() {
    setBusyBackup(true);
    try {
      const res = await apiRequest<{ backup: BackupFile; preview: string }>('/api/backup/create', {
        method: 'POST',
      });
      setBackupPreview(res.preview);
      onNotify('success', `Created SQL backup ${res.backup.filename}.`);
      const listRes = await apiRequest<{ backups: BackupFile[] }>('/api/backup/list');
      setBackups(listRes.backups);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to create backup.');
    } finally {
      setBusyBackup(false);
    }
  }

  async function handleDownloadBackup(filename: string) {
    try {
      await apiDownloadFile(`/api/backup/download/${encodeURIComponent(filename)}`, filename);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Download failed.');
    }
  }

  async function handleRestoreBackup(payload: { filename?: string; sqlContent?: string }) {
    setBusyBackup(true);
    try {
      const res = await apiRequest<{
        message: string;
        statementsExecuted: number;
        verifiedCounts: Record<string, number>;
      }>('/api/backup/restore', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setRestoreReport(res);
      setRestoreConfirmFile(null);
      setUploadedSql('');
      onNotify('success', res.message);
      await loadAll();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Backup restoration failed.');
    } finally {
      setBusyBackup(false);
    }
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedSql(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsText(file);
  }

  function renderGenericTable(rows: Array<Record<string, unknown>>) {
    if (rows.length === 0) {
      return <p className="py-6 text-center text-xs text-slate-500">Query returned 0 rows.</p>;
    }
    const cols = Object.keys(rows[0]);
    return (
      <div className="overflow-x-auto border-y border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
            <tr>
              {cols.map((c) => (
                <th key={c} className="px-4 py-2.5 font-mono">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((r, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                {cols.map((c) => (
                  <td key={c} className="px-4 py-2 font-mono text-slate-800 whitespace-nowrap">
                    {r[c] === null || r[c] === undefined ? 'NULL' : String(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (loading || !overview) {
    return <p className="py-12 text-center text-sm text-slate-500">Loading Database &amp; SQL Lab...</p>;
  }

  const activeScript = overview.mysqlScripts.find((s) => s.filename === activeScriptName) ?? overview.mysqlScripts[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Database &amp; SQL Lab
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Inspect 3NF schema tables, triggers, views, indexes, execute stored procedures, run EXPLAIN query plans, configure grading, and manage SQL backup and recovery.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-100 p-1 self-start">
          {(
            [
              ['objects', 'Schema & Objects'],
              ['procedures', 'Views & Procedures'],
              ['queries', 'SQL & EXPLAIN'],
              ['grading', 'Triggers & Grading'],
              ['backup', 'Backup & Recovery'],
              ['mysql', 'XAMPP MySQL Scripts'],
            ] as Array<[LabTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === id ? 'bg-white text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: SCHEMA, TRIGGERS, VIEWS & INDEXES */}
      {tab === 'objects' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {overview.tables.map((t) => (
              <div key={t.name} className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="font-mono text-sm font-semibold text-slate-900">{t.name}</h2>
                  <span className="font-mono text-xs font-medium text-blue-900 tabular-nums">
                    {t.rowCount} rows
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  {t.columns.map((col) => (
                    <div key={col.name} className="flex items-center justify-between gap-2 font-mono">
                      <span className={col.pk ? 'font-semibold text-slate-900' : 'text-slate-700'}>
                        {col.name}
                        {col.pk ? ' (PK)' : ''}
                      </span>
                      <span className="text-slate-500">{col.type}</span>
                    </div>
                  ))}
                </div>
                {t.indexes.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">Indexes: </span>
                    <span className="font-mono">{t.indexes.map((i) => i.name).join(', ')}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">Active Database Triggers</h2>
            </div>
            <div className="divide-y divide-slate-200">
              {overview.triggers.map((trg) => (
                <div key={trg.name} className="px-6 py-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-semibold text-slate-900">{trg.name}</span>
                    <span className="font-mono text-slate-500">ON {trg.tbl_name}</span>
                  </div>
                  <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-3 font-mono text-xs text-slate-700">{trg.sql}</pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DATABASE VIEWS & STORED PROCEDURES */}
      {tab === 'procedures' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Database Views Inspector</h2>
                <p className="mt-0.5 text-xs text-slate-500">Query any of the 4 relational views directly.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  'student_results_view',
                  'student_registration_view',
                  'student_payment_view',
                  'course_performance_view',
                ].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => runView(v)}
                    className={`whitespace-nowrap rounded-md border px-3 py-1.5 font-mono text-xs font-medium ${
                      selectedView === v && viewRows.length > 0
                        ? 'border-blue-900 bg-blue-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              {viewRows.length === 0 ? (
                <p className="text-xs text-slate-500">Select a view above to execute SELECT * FROM view.</p>
              ) : (
                renderGenericTable(viewRows)
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">Stored Procedure Runner</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Execute parameterized database procedures with live inputs.
            </p>
            <form onSubmit={runProcedure} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Procedure</label>
                <select
                  value={procName}
                  onChange={(e) => setProcName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900"
                >
                  <option value="GetStudentDetails">GetStudentDetails</option>
                  <option value="GetStudentResults">GetStudentResults</option>
                  <option value="GetStudentPayments">GetStudentPayments</option>
                  <option value="GetCourseRegistrations">GetCourseRegistrations</option>
                  <option value="GetCourseStudentList">GetCourseStudentList</option>
                </select>
              </div>

              {(procName === 'GetStudentDetails' ||
                procName === 'GetStudentResults' ||
                procName === 'GetStudentPayments') && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">Student</label>
                  <select
                    value={procStudentId}
                    onChange={(e) => setProcStudentId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    {students.map((s) => (
                      <option key={s.student_id} value={s.student_id}>
                        {s.registration_number} — {s.first_name} {s.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {procName === 'GetCourseStudentList' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">Course</label>
                  <select
                    value={procCourseId}
                    onChange={(e) => setProcCourseId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    {courses.map((c) => (
                      <option key={c.course_id} value={c.course_id}>
                        {c.course_code} — {c.course_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(procName === 'GetCourseRegistrations' || procName === 'GetCourseStudentList') && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">Semester (Optional)</label>
                  <select
                    value={procSemesterId}
                    onChange={(e) => setProcSemesterId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    <option value="">All Semesters</option>
                    {semesters.map((sem) => (
                      <option key={sem.semester_id} value={sem.semester_id}>
                        {sem.semester_name} ({sem.academic_year})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-end">
                <button
                  type="submit"
                  className="flex items-center gap-2 whitespace-nowrap rounded-md bg-blue-900 px-4 py-2 text-xs font-medium text-white hover:bg-blue-950"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Execute Procedure</span>
                </button>
              </div>
            </form>

            {procResult && (
              <div className="mt-5 space-y-3">
                <div className="rounded border border-slate-200 bg-slate-50 px-4 py-2 font-mono text-xs text-slate-700">
                  {procResult.sqlPreview}
                </div>
                {renderGenericTable(procResult.rows)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SQL QUERY DEMONSTRATIONS & EXPLAIN */}
      {tab === 'queries' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">
              SQL Query Demonstrations &amp; EXPLAIN Index Verification
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Run curated live queries demonstrating JOIN, GROUP BY, Aggregate Functions, Subqueries, Transactions, and Index Execution Plans.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ['join_group_by', 'JOIN + GROUP BY + Aggregates'],
                ['subquery_above_avg', 'Subquery + WHERE + ORDER BY'],
                ['index_explain_reg_no', 'EXPLAIN: registration_number Index'],
                ['index_explain_last_name', 'EXPLAIN: last_name Index'],
                ['index_explain_payments', 'EXPLAIN: fee_payments.student_id Index'],
                ['transaction_crud_demo', 'Transaction: INSERT / UPDATE / DELETE'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => runQueryDemo(id)}
                  className="whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
                >
                  {label}
                </button>
              ))}
            </div>

            {demoResult && (
              <div className="mt-6 space-y-4">
                <div>
                  <span className="font-mono text-xs font-semibold text-blue-900">{demoResult.category}</span>
                  <h3 className="mt-0.5 text-sm font-semibold text-slate-900">{demoResult.title}</h3>
                </div>
                <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-900 p-4 font-mono text-xs text-slate-100">
                  {demoResult.sql}
                </pre>
                <div>
                  <h4 className="mb-2 text-xs font-semibold text-slate-700">Query Execution Plan (EXPLAIN)</h4>
                  {renderGenericTable(demoResult.plan)}
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-semibold text-slate-700">Live Query Results</h4>
                  {renderGenericTable(demoResult.rows)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: TRIGGERS, CONSTRAINTS & GRADING SCHEME */}
      {tab === 'grading' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Database Constraints &amp; Trigger Diagnostics
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Executes savepoint-safe constraint and trigger tests against the live relational schema.
                </p>
              </div>
              <button
                type="button"
                onClick={runConstraintTests}
                className="flex items-center gap-2 whitespace-nowrap rounded-md bg-blue-900 px-4 py-2 text-xs font-medium text-white hover:bg-blue-950"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span>Run Verification Suite</span>
              </button>
            </div>

            {permChecks.length > 0 && (
              <div className="-mx-6 mt-4 overflow-x-auto border-y border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-2.5">Test Case</th>
                      <th className="px-4 py-2.5">Expected Behavior</th>
                      <th className="px-4 py-2.5">Observed Result</th>
                      <th className="px-4 py-2.5">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {permChecks.map((c, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{c.test}</td>
                        <td className="px-4 py-2.5 text-slate-600">{c.expected}</td>
                        <td className="px-4 py-2.5 text-slate-700">{c.actual}</td>
                        <td
                          className={`px-4 py-2.5 font-mono font-semibold ${
                            c.passed ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {c.passed ? 'PASS' : 'FAIL'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {gradingForm && (
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-base font-semibold text-slate-900">Configurable Grading Scheme</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Stored in grading_config and read directly by database triggers on examination_results.
              </p>
              <form onSubmit={handleSaveGrading} className="mt-4 max-w-2xl space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Exam Weight (0–1)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={gradingForm.exam_weight}
                      onChange={(e) =>
                        setGradingForm({ ...gradingForm, exam_weight: Number(e.target.value) })
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Assignment Weight (0–1)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={gradingForm.assignment_weight}
                      onChange={(e) =>
                        setGradingForm({ ...gradingForm, assignment_weight: Number(e.target.value) })
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Min A</label>
                    <input
                      type="number"
                      value={gradingForm.grade_a_min}
                      onChange={(e) =>
                        setGradingForm({ ...gradingForm, grade_a_min: Number(e.target.value) })
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Min B</label>
                    <input
                      type="number"
                      value={gradingForm.grade_b_min}
                      onChange={(e) =>
                        setGradingForm({ ...gradingForm, grade_b_min: Number(e.target.value) })
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Min C</label>
                    <input
                      type="number"
                      value={gradingForm.grade_c_min}
                      onChange={(e) =>
                        setGradingForm({ ...gradingForm, grade_c_min: Number(e.target.value) })
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Min D / Pass</label>
                    <input
                      type="number"
                      value={gradingForm.grade_d_min}
                      onChange={(e) =>
                        setGradingForm({
                          ...gradingForm,
                          grade_d_min: Number(e.target.value),
                          pass_min: Number(e.target.value),
                        })
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="whitespace-nowrap rounded-md bg-blue-900 px-4 py-2 text-xs font-medium text-white hover:bg-blue-950"
                >
                  Save &amp; Recalculate All Results
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: DATABASE BACKUP & RECOVERY */}
      {tab === 'backup' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">SQL Backup Snapshots</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Export all 7 tables and grading configuration to a transaction-wrapped .sql file inside backups/.
              </p>
            </div>
            <button
              type="button"
              disabled={busyBackup}
              onClick={handleCreateBackup}
              className="flex items-center gap-2 whitespace-nowrap rounded-md bg-blue-900 px-4 py-2 text-xs font-medium text-white hover:bg-blue-950 disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>{busyBackup ? 'Exporting...' : 'Create SQL Backup'}</span>
            </button>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Backup File</th>
                  <th className="px-5 py-3 text-right">Size</th>
                  <th className="px-5 py-3">Created At</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {backups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                      No backup snapshots created yet. Click &ldquo;Create SQL Backup&rdquo; above.
                    </td>
                  </tr>
                ) : (
                  backups.map((b) => (
                    <tr key={b.filename} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono font-medium text-slate-900">{b.filename}</td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-600">
                        {(b.sizeBytes / 1024).toFixed(2)} KB
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-500">
                        {new Date(b.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownloadBackup(b.filename)}
                            className="flex items-center gap-1 whitespace-nowrap rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Download className="h-3 w-3" />
                            <span>Download .sql</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setRestoreConfirmFile(b.filename)}
                            className="flex items-center gap-1 whitespace-nowrap rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-900 hover:bg-blue-100"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Restore</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {backupPreview && (
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h3 className="text-sm font-semibold text-slate-900">Generated SQL Dump Preview</h3>
              <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-slate-900 p-4 font-mono text-xs text-slate-100">
                {backupPreview}
              </pre>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">Import &amp; Restore SQL Backup</h2>
            <p className="mt-1 text-xs text-slate-500">
              Upload a .sql backup file generated by this system. Every statement is validated against an allowlist and executed inside an atomic transaction with foreign-key verification.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Choose .sql Backup File</span>
                <input type="file" accept=".sql" onChange={handleFileUpload} className="hidden" />
              </label>
              {uploadedSql && (
                <button
                  type="button"
                  disabled={busyBackup}
                  onClick={() => handleRestoreBackup({ sqlContent: uploadedSql })}
                  className="whitespace-nowrap rounded-md bg-blue-900 px-4 py-2 text-xs font-medium text-white hover:bg-blue-950 disabled:opacity-50"
                >
                  Execute Transactional Restore ({uploadedSql.length.toLocaleString()} bytes)
                </button>
              )}
            </div>

            {restoreReport && (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>{restoreReport.message}</span>
                </div>
                <p className="mt-1 font-mono">
                  Statements executed: {restoreReport.statementsExecuted} · Verified counts:{' '}
                  {Object.entries(restoreReport.verifiedCounts)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(', ')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: XAMPP MYSQL SCRIPTS */}
      {tab === 'mysql' && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                XAMPP / MySQL 8.0 SQL Script Suite (database/)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Complete MySQL DDL, sample data, stored procedures, triggers, views, indexes, and role grants ready for phpMyAdmin import.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {overview.mysqlScripts.map((s) => (
                <button
                  key={s.filename}
                  type="button"
                  onClick={() => setActiveScriptName(s.filename)}
                  className={`whitespace-nowrap rounded border px-2.5 py-1 font-mono text-xs ${
                    activeScript?.filename === s.filename
                      ? 'border-blue-900 bg-blue-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {s.filename}
                </button>
              ))}
            </div>
          </div>

          {activeScript && (
            <pre className="mt-4 max-h-[520px] overflow-auto rounded-md bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">
              {activeScript.content}
            </pre>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(restoreConfirmFile)}
        title="Restore Database Snapshot"
        message={`Restore database records from ${restoreConfirmFile}? Current records in the 7 application tables will be replaced atomically inside a transaction.`}
        confirmLabel="Restore Snapshot"
        destructive={false}
        busy={busyBackup}
        onConfirm={() => restoreConfirmFile && handleRestoreBackup({ filename: restoreConfirmFile })}
        onCancel={() => setRestoreConfirmFile(null)}
      />
    </div>
  );
}
