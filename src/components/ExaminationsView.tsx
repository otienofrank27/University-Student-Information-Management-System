import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Award, Download, Search, X } from 'lucide-react';
import { apiRequest } from '../api.ts';
import type {
  Course,
  CoursePerformance,
  ExaminationRow,
  GradingConfig,
  Semester,
} from '../types.ts';
import { downloadCsv } from '../utils/exportCsv.ts';

interface ExaminationsViewProps {
  onNotify: (type: 'success' | 'error', text: string) => void;
}

interface StudentTranscript {
  student: {
    student_id: number;
    registration_number: string;
    first_name: string;
    last_name: string;
    course_of_study: string;
  };
  results: Array<{
    result_id: number;
    course_code: string;
    course_name: string;
    credit_hours: number;
    semester_name: string;
    academic_year: string;
    exam_marks: number;
    assignment_marks: number;
    total_marks: number;
    grade: string;
    remarks: string;
  }>;
  summary: {
    totalCourses: number;
    passed: number;
    failed: number;
    averageMarks: number;
  };
}

export function ExaminationsView({ onNotify }: ExaminationsViewProps) {
  const [tab, setTab] = useState<'marks' | 'performance'>('marks');
  const [rows, setRows] = useState<ExaminationRow[]>([]);
  const [performance, setPerformance] = useState<CoursePerformance[]>([]);
  const [gradingConfig, setGradingConfig] = useState<GradingConfig | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);

  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [editRow, setEditRow] = useState<ExaminationRow | null>(null);
  const [examMarks, setExamMarks] = useState('');
  const [assignmentMarks, setAssignmentMarks] = useState('');
  const [saving, setSaving] = useState(false);

  const [transcript, setTranscript] = useState<StudentTranscript | null>(null);

  const fetchExaminations = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (courseFilter) qs.set('courseId', courseFilter);
      if (semesterFilter) qs.set('semesterId', semesterFilter);

      const [examRes, perfRes] = await Promise.all([
        apiRequest<{ examinations: ExaminationRow[]; gradingConfig: GradingConfig }>(
          `/api/examinations?${qs.toString()}`
        ),
        apiRequest<{ performance: CoursePerformance[] }>('/api/examinations/performance'),
      ]);
      setRows(examRes.examinations);
      setGradingConfig(examRes.gradingConfig);
      setPerformance(perfRes.performance);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load examinations.');
    } finally {
      setLoading(false);
    }
  }, [search, courseFilter, semesterFilter, onNotify]);

  useEffect(() => {
    fetchExaminations();
  }, [fetchExaminations]);

  useEffect(() => {
    Promise.all([
      apiRequest<{ courses: Course[] }>('/api/courses'),
      apiRequest<{ semesters: Semester[] }>('/api/semesters'),
    ])
      .then(([cRes, sRes]) => {
        setCourses(cRes.courses);
        setSemesters(sRes.semesters);
      })
      .catch(() => {});
  }, []);

  function openMarkEntry(row: ExaminationRow) {
    setEditRow(row);
    setExamMarks(row.exam_marks !== null ? String(row.exam_marks) : '');
    setAssignmentMarks(row.assignment_marks !== null ? String(row.assignment_marks) : '');
  }

  async function handleSaveMarks(e: FormEvent) {
    e.preventDefault();
    if (!editRow) return;
    setSaving(true);
    try {
      const res = await apiRequest<{ result: { total_marks: number; grade: string; remarks: string } }>(
        '/api/examinations',
        {
          method: 'POST',
          body: JSON.stringify({
            registration_id: editRow.registration_id,
            exam_marks: Number(examMarks),
            assignment_marks: Number(assignmentMarks),
          }),
        }
      );
      onNotify(
        'success',
        `Saved marks for ${editRow.student_name}: ${res.result.total_marks}% (Grade ${res.result.grade} · ${res.result.remarks}).`
      );
      setEditRow(null);
      await fetchExaminations();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to save marks.');
    } finally {
      setSaving(false);
    }
  }

  async function openTranscript(studentId: number) {
    try {
      const data = await apiRequest<StudentTranscript>(`/api/examinations/student/${studentId}`);
      setTranscript(data);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to load student transcript.');
    }
  }

  // Live preview using the same configurable grading weights stored in DB
  const previewTotal =
    gradingConfig && examMarks !== '' && assignmentMarks !== ''
      ? Number(
          (
            Number(examMarks) * gradingConfig.exam_weight +
            Number(assignmentMarks) * gradingConfig.assignment_weight
          ).toFixed(2)
        )
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Examination Management</h1>
          <p className="mt-1 text-sm text-slate-600">
            Enter examination and assignment marks (0–100). Totals, letter grades, and pass/fail remarks are calculated automatically from the active grading policy.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => {
              downloadCsv(
                'examination_results.csv',
                ['Reg. Number', 'Student Name', 'Course Code', 'Course Title', 'Semester', 'Academic Year', 'Exam Marks', 'Assignment Marks', 'Total Marks', 'Grade', 'Remarks'],
                rows.map((r) => [
                  r.registration_number,
                  r.student_name,
                  r.course_code,
                  r.course_name,
                  r.semester_name,
                  r.academic_year,
                  r.exam_marks ?? '',
                  r.assignment_marks ?? '',
                  r.total_marks ?? '',
                  r.grade ?? '',
                  r.remarks ?? '',
                ])
              );
              onNotify('success', `Exported ${rows.length} examination record(s) to CSV.`);
            }}
            className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>

          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setTab('marks')}
              className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium ${
                tab === 'marks' ? 'bg-white text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Marks &amp; Results
            </button>
            <button
              type="button"
              onClick={() => setTab('performance')}
              className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium ${
                tab === 'performance' ? 'bg-white text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Course Summaries
            </button>
          </div>
        </div>
      </div>

      {gradingConfig && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-xs text-slate-600">
          <span>
            <strong className="text-slate-900">Active Weighting:</strong>{' '}
            <span className="font-mono">
              {Math.round(gradingConfig.exam_weight * 100)}% Exam +{' '}
              {Math.round(gradingConfig.assignment_weight * 100)}% Assignment
            </span>
          </span>
          <span className="font-mono">
            A: {gradingConfig.grade_a_min}–100 · B: {gradingConfig.grade_b_min}–{gradingConfig.grade_a_min - 1} · C:{' '}
            {gradingConfig.grade_c_min}–{gradingConfig.grade_b_min - 1} · D: {gradingConfig.grade_d_min}–
            {gradingConfig.grade_c_min - 1} · E: &lt;{gradingConfig.grade_d_min}
          </span>
        </div>
      )}

      {tab === 'marks' ? (
        <>
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by student reg. no, name, or course code..."
                className="w-full rounded-md border border-slate-300 py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
              />
            </div>
            <select
              aria-label="Filter by course"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-900 focus:outline-none"
            >
              <option value="">All Courses</option>
              {courses.map((c) => (
                <option key={c.course_id} value={c.course_id}>
                  {c.course_code} — {c.course_name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by semester"
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-900 focus:outline-none"
            >
              <option value="">All Semesters</option>
              {semesters.map((s) => (
                <option key={s.semester_id} value={s.semester_id}>
                  {s.semester_name} ({s.academic_year})
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Student</th>
                    <th className="px-5 py-3">Course</th>
                    <th className="px-5 py-3">Semester</th>
                    <th className="px-5 py-3 text-right">Exam</th>
                    <th className="px-5 py-3 text-right">Assignment</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3">Grade / Remarks</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
                        Loading examination records...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
                        No course registrations found for examination entry.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.registration_id} className="hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={() => openTranscript(r.student_id)}
                            className="text-left font-medium text-blue-900 hover:underline"
                          >
                            {r.student_name}
                          </button>
                          <div className="font-mono text-xs text-slate-500">{r.registration_number}</div>
                        </td>
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs font-semibold text-slate-900">{r.course_code}</span>
                          <div className="text-xs text-slate-600">{r.course_name}</div>
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-600">
                          {r.semester_name} ({r.academic_year})
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700">
                          {r.exam_marks !== null ? Number(r.exam_marks).toFixed(2) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700">
                          {r.assignment_marks !== null ? Number(r.assignment_marks).toFixed(2) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                          {r.total_marks !== null ? `${Number(r.total_marks).toFixed(2)}%` : 'Pending'}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs">
                          {r.grade ? (
                            <>
                              <span className="font-bold text-slate-900">{r.grade}</span>
                              <span className="mx-1.5 text-slate-400">·</span>
                              <span className={r.remarks === 'Pass' ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
                                {r.remarks}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-400">Ungraded</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openMarkEntry(r)}
                            className="whitespace-nowrap rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                          >
                            {r.result_id ? 'Update Marks' : 'Enter Marks'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Course Performance Summary
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Course Code</th>
                  <th className="px-5 py-3">Course Name</th>
                  <th className="px-5 py-3 text-right">Registered Students</th>
                  <th className="px-5 py-3 text-right">Average Marks</th>
                  <th className="px-5 py-3 text-right">Highest Marks</th>
                  <th className="px-5 py-3 text-right">Lowest Marks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {performance.map((cp) => (
                  <tr key={cp.course_id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-900">{cp.course_code}</td>
                    <td className="px-5 py-3 font-medium text-slate-900">{cp.course_name}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700">
                      {cp.number_of_registered_students}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-900">
                      {cp.average_marks !== null ? `${cp.average_marks.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-emerald-700">
                      {cp.highest_marks !== null ? `${cp.highest_marks.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-600">
                      {cp.lowest_marks !== null ? `${cp.lowest_marks.toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mark Entry Modal */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <p className="font-mono text-xs text-slate-500">
                  {editRow.course_code} · {editRow.registration_number}
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">{editRow.student_name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditRow(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMarks} className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Exam Marks (0–100)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={examMarks}
                    onChange={(e) => setExamMarks(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Assignment Marks (0–100)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={assignmentMarks}
                    onChange={(e) => setAssignmentMarks(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
              </div>

              {previewTotal !== null && !Number.isNaN(previewTotal) && (
                <div className="border-t border-slate-200 pt-3 text-xs text-slate-700">
                  Estimated Weighted Total:{' '}
                  <strong className="font-mono text-slate-900 tabular-nums">{previewTotal}%</strong>
                  <p className="mt-1 text-slate-500">
                    Final total, letter grade, and pass/fail remarks are computed automatically upon save.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setEditRow(null)}
                  className="whitespace-nowrap shrink-0 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="whitespace-nowrap shrink-0 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-950 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Marks'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Overall Transcript Modal */}
      {transcript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <Award className="h-5 w-5 text-blue-900" aria-hidden="true" />
                <div>
                  <p className="font-mono text-xs text-slate-500">{transcript.student.registration_number}</p>
                  <h2 className="text-lg font-bold text-slate-900">
                    {transcript.student.first_name} {transcript.student.last_name} — Overall Results
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    downloadCsv(
                      `transcript_${transcript.student.registration_number}.csv`,
                      ['Registration Number', 'Student Name', 'Course Code', 'Course Title', 'Credit Hours', 'Semester', 'Academic Year', 'Exam Marks', 'Assignment Marks', 'Total Marks', 'Grade', 'Remarks'],
                      transcript.results.map((r) => [
                        transcript.student.registration_number,
                        `${transcript.student.first_name} ${transcript.student.last_name}`,
                        r.course_code,
                        r.course_name,
                        r.credit_hours,
                        r.semester_name,
                        r.academic_year,
                        r.exam_marks,
                        r.assignment_marks,
                        r.total_marks,
                        r.grade,
                        r.remarks,
                      ])
                    );
                    onNotify('success', `Downloaded transcript for ${transcript.student.registration_number}.`);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Download Transcript</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTranscript(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="-mx-6 mt-4 grid grid-cols-2 gap-4 border-y border-slate-200 bg-slate-50/70 px-6 py-4 text-xs sm:grid-cols-4">
              <div>
                <span className="text-slate-500">Courses Graded</span>
                <p className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
                  {transcript.summary.totalCourses}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Passed</span>
                <p className="mt-1 font-mono text-base font-semibold text-emerald-700 tabular-nums">
                  {transcript.summary.passed}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Failed</span>
                <p className="mt-1 font-mono text-base font-semibold text-red-700 tabular-nums">
                  {transcript.summary.failed}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Overall Average</span>
                <p className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
                  {transcript.summary.averageMarks}%
                </p>
              </div>
            </div>

            <div className="-mx-6 mt-4 overflow-x-auto border-b border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5">Course</th>
                    <th className="px-4 py-2.5">Semester</th>
                    <th className="px-4 py-2.5 text-right">Exam</th>
                    <th className="px-4 py-2.5 text-right">Assignment</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5">Grade / Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {transcript.results.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                        No graded courses for this student.
                      </td>
                    </tr>
                  ) : (
                    transcript.results.map((r) => (
                      <tr key={r.result_id}>
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-semibold text-slate-900">{r.course_code}</span>{' '}
                          <span className="text-slate-600">{r.course_name}</span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {r.semester_name} ({r.academic_year})
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.exam_marks}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.assignment_marks}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                          {r.total_marks}%
                        </td>
                        <td className="px-4 py-2.5 font-mono">
                          <span className="font-bold text-slate-900">{r.grade}</span>
                          <span className="mx-1.5 text-slate-400">·</span>
                          <span className={r.remarks === 'Pass' ? 'text-emerald-700' : 'text-red-700'}>
                            {r.remarks}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
