import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { apiRequest } from '../api.ts';
import type { Course, CourseRegistration, Semester, Student } from '../types.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface RegistrationsViewProps {
  onNotify: (type: 'success' | 'error', text: string) => void;
}

export function RegistrationsView({ onNotify }: RegistrationsViewProps) {
  const [registrations, setRegistrations] = useState<CourseRegistration[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);

  const [search, setSearch] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    student_id: '',
    semester_id: '',
    registration_date: new Date().toISOString().slice(0, 10),
    status: 'Registered',
  });
  const [selectedCourseIds, setSelectedCourseIds] = useState<number[]>([]);
  const [modalCourseSearch, setModalCourseSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CourseRegistration | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (semesterFilter) qs.set('semesterId', semesterFilter);
      if (courseFilter) qs.set('courseId', courseFilter);
      qs.set('page', String(page));
      qs.set('limit', '12');

      const res = await apiRequest<{
        registrations: CourseRegistration[];
        pagination: { page: number; totalPages: number; total: number };
      }>(`/api/registrations?${qs.toString()}`);

      setRegistrations(res.registrations);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load course registrations.');
    } finally {
      setLoading(false);
    }
  }, [search, semesterFilter, courseFilter, page, onNotify]);

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  useEffect(() => {
    Promise.all([
      apiRequest<{ students: Student[] }>('/api/students?limit=100'),
      apiRequest<{ courses: Course[] }>('/api/courses'),
      apiRequest<{ semesters: Semester[] }>('/api/semesters'),
    ])
      .then(([sRes, cRes, semRes]) => {
        setStudents(sRes.students);
        setCourses(cRes.courses);
        setSemesters(semRes.semesters);
      })
      .catch(() => {
        // Dropdown load errors handled gracefully
      });
  }, []);

  function openRegisterModal() {
    const activeSem = semesters.find((s) => s.status === 'Active') ?? semesters[0];
    setForm({
      student_id: students[0] ? String(students[0].student_id) : '',
      semester_id: activeSem ? String(activeSem.semester_id) : '',
      registration_date: new Date().toISOString().slice(0, 10),
      status: 'Registered',
    });
    setSelectedCourseIds([]);
    setModalCourseSearch('');
    setModalOpen(true);
  }

  function toggleCourseId(courseId: number) {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId]
    );
  }

  const filteredModalCourses = courses.filter((c) => {
    const q = modalCourseSearch.trim().toLowerCase();
    if (!q) return true;
    return c.course_code.toLowerCase().includes(q) || c.course_name.toLowerCase().includes(q);
  });

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (selectedCourseIds.length === 0) {
      onNotify('error', 'Select at least one course to enroll.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest<{ enrolledCount: number; skippedCount: number }>(
        '/api/registrations/bulk',
        {
          method: 'POST',
          body: JSON.stringify({
            student_id: Number(form.student_id),
            semester_id: Number(form.semester_id),
            course_ids: selectedCourseIds,
            registration_date: form.registration_date,
            status: form.status,
          }),
        }
      );
      if (res.enrolledCount === 0 && res.skippedCount > 0) {
        onNotify('error', 'Selected course(s) are already registered for this student and semester.');
      } else {
        onNotify(
          'success',
          res.skippedCount > 0
            ? `Enrolled in ${res.enrolledCount} course(s); skipped ${res.skippedCount} duplicate(s).`
            : `Student enrolled in ${res.enrolledCount} course(s) successfully.`
        );
      }
      setModalOpen(false);
      await fetchRegistrations();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to register student.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(regId: number, newStatus: string) {
    try {
      await apiRequest(`/api/registrations/${regId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      onNotify('success', `Registration status updated to ${newStatus}.`);
      await fetchRegistrations();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to update status.');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/registrations/${deleteTarget.registration_id}`, { method: 'DELETE' });
      onNotify('success', 'Course registration deleted.');
      setDeleteTarget(null);
      await fetchRegistrations();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to delete registration.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Course Registrations</h1>
          <p className="mt-1 text-sm text-slate-600">
            Enroll students into courses by semester while preventing duplicate registrations.
          </p>
        </div>
        <button
          type="button"
          onClick={openRegisterModal}
          className="flex items-center gap-2 self-start whitespace-nowrap shrink-0 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-950"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Register Student for Course</span>
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by student name, reg. number, or course..."
            className="w-full rounded-md border border-slate-300 py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
          />
        </div>
        <select
          aria-label="Filter by semester"
          value={semesterFilter}
          onChange={(e) => {
            setSemesterFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-900 focus:outline-none"
        >
          <option value="">All Semesters</option>
          {semesters.map((s) => (
            <option key={s.semester_id} value={s.semester_id}>
              {s.semester_name} ({s.academic_year})
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by course"
          value={courseFilter}
          onChange={(e) => {
            setCourseFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-900 focus:outline-none"
        >
          <option value="">All Courses</option>
          {courses.map((c) => (
            <option key={c.course_id} value={c.course_id}>
              {c.course_code} — {c.course_name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">Reg. No.</th>
                <th className="px-5 py-3">Student Name</th>
                <th className="px-5 py-3">Course</th>
                <th className="px-5 py-3">Semester</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    Loading registrations...
                  </td>
                </tr>
              ) : registrations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    No course registrations found.
                  </td>
                </tr>
              ) : (
                registrations.map((reg) => (
                  <tr key={reg.registration_id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">{reg.registration_number}</td>
                    <td className="px-5 py-3 font-medium text-slate-900">{reg.student_name}</td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs font-semibold text-slate-900">{reg.course_code}</span>
                      <span className="mx-1.5 text-slate-400">·</span>
                      <span className="text-slate-700">{reg.course_name}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {reg.semester} ({reg.academic_year})
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500 tabular-nums">
                      {reg.registration_date}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        aria-label={`Registration status for ${reg.student_name}`}
                        value={reg.registration_status}
                        onChange={(e) => handleStatusChange(reg.registration_id, e.target.value)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:border-blue-900 focus:outline-none"
                      >
                        <option value="Registered">Registered</option>
                        <option value="Completed">Completed</option>
                        <option value="Dropped">Dropped</option>
                      </select>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(reg)}
                        className="rounded border border-slate-200 p-1.5 text-red-700 hover:bg-red-50"
                        title="Delete Registration"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-600">
          <span className="font-mono tabular-nums">
            Page {page} of {totalPages} ({totalCount} registrations)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="whitespace-nowrap rounded border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="whitespace-nowrap rounded border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h2 className="text-lg font-bold text-slate-900">Register Student for Courses</h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Student</label>
                  <select
                    required
                    value={form.student_id}
                    onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  >
                    {students.length === 0 ? (
                      <option value="">No students available</option>
                    ) : (
                      students.map((s) => (
                        <option key={s.student_id} value={s.student_id}>
                          {s.registration_number} — {s.first_name} {s.last_name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Academic Semester</label>
                  <select
                    required
                    value={form.semester_id}
                    onChange={(e) => setForm({ ...form, semester_id: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  >
                    {semesters.length === 0 ? (
                      <option value="">No semesters available</option>
                    ) : (
                      semesters.map((sem) => (
                        <option key={sem.semester_id} value={sem.semester_id}>
                          {sem.semester_name} ({sem.academic_year})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-slate-700">
                    Select Courses ({selectedCourseIds.length} selected)
                  </label>
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedCourseIds([])}
                      className="font-medium text-slate-500 hover:text-slate-900"
                    >
                      Clear selection
                    </button>
                  </div>
                </div>
                <input
                  type="search"
                  value={modalCourseSearch}
                  onChange={(e) => setModalCourseSearch(e.target.value)}
                  placeholder="Filter courses by code or name..."
                  className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-900 focus:outline-none"
                />
                <div className="mt-2 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 bg-slate-50/40">
                  {filteredModalCourses.length === 0 ? (
                    <p className="p-4 text-center text-xs text-slate-500">
                      No courses match your search.
                    </p>
                  ) : (
                    filteredModalCourses.map((c) => {
                      const checked = selectedCourseIds.includes(c.course_id);
                      return (
                        <label
                          key={c.course_id}
                          className="flex cursor-pointer items-center gap-3 px-3 py-2 text-xs hover:bg-slate-100/70"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCourseId(c.course_id)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-900 focus:ring-blue-900"
                          />
                          <span className="font-mono font-semibold text-slate-900 shrink-0">
                            {c.course_code}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-slate-700">
                            {c.course_name}
                          </span>
                          <span className="font-mono text-slate-500 tabular-nums shrink-0">
                            {c.credit_hours} cr
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Registration Date</label>
                <input
                  type="date"
                  required
                  value={form.registration_date}
                  onChange={(e) => setForm({ ...form, registration_date: e.target.value })}
                  className="mt-1 w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                />
              </div>

              <p className="text-xs text-slate-500">
                A student can only be enrolled once per course in the same semester; existing enrollments are skipped automatically.
              </p>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="whitespace-nowrap rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || selectedCourseIds.length === 0}
                  className="whitespace-nowrap rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-950 disabled:opacity-50"
                >
                  {saving
                    ? 'Enrolling...'
                    : `Confirm Enrollment (${selectedCourseIds.length})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Course Registration"
        message={
          deleteTarget
            ? `Remove ${deleteTarget.student_name} from ${deleteTarget.course_code} (${deleteTarget.semester})? Any associated examination result will also be removed.`
            : ''
        }
        confirmLabel="Remove Registration"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
