import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Download, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { apiRequest } from '../api.ts';
import type { Course, Lecturer, Semester } from '../types.ts';
import { downloadCsv } from '../utils/exportCsv.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface CoursesViewProps {
  onNotify: (type: 'success' | 'error', text: string) => void;
  defaultCreditHours?: number;
}

interface RosterStudent {
  registration_id: number;
  registration_number: string;
  student_name: string;
  course_of_study: string;
  year_of_study: number;
  semester_name: string;
  academic_year: string;
  registration_status: string;
  total_marks: number | null;
  grade: string | null;
}

export function CoursesView({ onNotify, defaultCreditHours = 3 }: CoursesViewProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState({
    course_code: '',
    course_name: '',
    credit_hours: 3,
    lecturer_id: '',
  });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [rosterCourse, setRosterCourse] = useState<Course | null>(null);
  const [rosterSemesterId, setRosterSemesterId] = useState<string>('');
  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      const [cRes, lRes, sRes] = await Promise.all([
        apiRequest<{ courses: Course[] }>(`/api/courses?${qs.toString()}`),
        apiRequest<{ lecturers: Lecturer[] }>('/api/lecturers'),
        apiRequest<{ semesters: Semester[] }>('/api/semesters'),
      ]);
      setCourses(cRes.courses);
      setLecturers(lRes.lecturers);
      setSemesters(sRes.semesters);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load courses.');
    } finally {
      setLoading(false);
    }
  }, [search, onNotify]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const filteredCourses = useMemo(() => {
    if (!levelFilter) return courses;
    return courses.filter((c) => {
      const lower = c.course_name.toLowerCase();
      if (levelFilter === 'postgraduate') return lower.startsWith('post graduate');
      if (levelFilter === 'bachelor') return lower.startsWith('bachelor');
      if (levelFilter === 'diploma') return lower.startsWith('diploma');
      if (levelFilter === 'certificate') return lower.startsWith('certificate');
      return true;
    });
  }, [courses, levelFilter]);

  async function loadRoster(course: Course, semesterId: string) {
    setRosterCourse(course);
    setRosterLoading(true);
    try {
      const qs = semesterId ? `?semesterId=${semesterId}` : '';
      const res = await apiRequest<{ students: RosterStudent[] }>(
        `/api/courses/${course.course_id}/students${qs}`
      );
      setRosterStudents(res.students);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load enrolled students.');
      setRosterStudents([]);
    } finally {
      setRosterLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({
      course_code: '',
      course_name: '',
      credit_hours: defaultCreditHours,
      lecturer_id: lecturers[0] ? String(lecturers[0].lecturer_id) : '',
    });
    setModalOpen(true);
  }

  function openEdit(c: Course) {
    setEditing(c);
    setForm({
      course_code: c.course_code,
      course_name: c.course_name,
      credit_hours: c.credit_hours,
      lecturer_id: c.lecturer_id ? String(c.lecturer_id) : '',
    });
    setModalOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        course_code: form.course_code,
        course_name: form.course_name,
        credit_hours: Number(form.credit_hours),
        lecturer_id: form.lecturer_id ? Number(form.lecturer_id) : null,
      };
      if (editing) {
        await apiRequest(`/api/courses/${editing.course_id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onNotify('success', `Updated course ${payload.course_code}.`);
      } else {
        await apiRequest('/api/courses', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onNotify('success', `Created course ${payload.course_code}.`);
      }
      setModalOpen(false);
      await fetchCourses();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to save course.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/courses/${deleteTarget.course_id}`, { method: 'DELETE' });
      onNotify('success', `Deleted course ${deleteTarget.course_code}.`);
      setDeleteTarget(null);
      await fetchCourses();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Cannot delete course.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Course Catalog</h1>
          <p className="mt-1 text-sm text-slate-600">
            Define courses, assign credit hours, link lecturers, and inspect student rosters.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            disabled={filteredCourses.length === 0}
            onClick={() => {
              downloadCsv(
                'courses_catalog.csv',
                ['Course Code', 'Course Title', 'Credit Hours', 'Assigned Lecturer', 'Department', 'Enrolled Students'],
                filteredCourses.map((c) => [
                  c.course_code,
                  c.course_name,
                  c.credit_hours,
                  c.lecturer_name ?? 'Unassigned',
                  c.lecturer_department ?? '',
                  c.enrolled_count ?? 0,
                ])
              );
              onNotify('success', `Exported ${filteredCourses.length} course(s) to CSV.`);
            }}
            className="flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 whitespace-nowrap shrink-0 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-950"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add Course</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by course code or course name..."
            className="w-full rounded-md border border-slate-300 py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
          />
        </div>
        <select
          aria-label="Filter by programme level"
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-900 focus:outline-none"
        >
          <option value="">All Levels</option>
          <option value="bachelor">Bachelor&apos;s Degrees</option>
          <option value="diploma">Diplomas</option>
          <option value="certificate">Certificates</option>
          <option value="postgraduate">Post Graduate Diplomas</option>
        </select>
        <span className="font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
          {filteredCourses.length} courses
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Course Title</th>
                <th className="px-5 py-3 text-right">Credits</th>
                <th className="px-5 py-3">Assigned Lecturer</th>
                <th className="px-5 py-3 text-right">Registrations</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                    Loading courses...
                  </td>
                </tr>
              ) : filteredCourses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                    No courses found.
                  </td>
                </tr>
              ) : (
                filteredCourses.map((c) => (
                  <tr key={c.course_id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-900">
                      {c.course_code}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">{c.course_name}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700">
                      {c.credit_hours}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {c.lecturer_name ? (
                        <span>
                          {c.lecturer_name}
                          <span className="mx-1.5 text-slate-400">·</span>
                          <span className="text-xs text-slate-500">{c.lecturer_department}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700">
                      {c.enrolled_count ?? 0}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRosterSemesterId('');
                            loadRoster(c, '');
                          }}
                          className="flex items-center gap-1.5 whitespace-nowrap rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Users className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Roster</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          title="Edit Course"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(c)}
                          className="rounded border border-slate-200 p-1.5 text-red-700 hover:bg-red-50"
                          title="Delete Course"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Course Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editing ? 'Edit Course' : 'Add New Course'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Course Code</label>
                  <input
                    type="text"
                    required
                    value={form.course_code}
                    onChange={(e) => setForm({ ...form, course_code: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Credit Hours</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    required
                    value={form.credit_hours}
                    onChange={(e) => setForm({ ...form, credit_hours: Number(e.target.value) })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Course Name</label>
                <input
                  type="text"
                  required
                  value={form.course_name}
                  onChange={(e) => setForm({ ...form, course_name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Assigned Lecturer</label>
                <select
                  value={form.lecturer_id}
                  onChange={(e) => setForm({ ...form, lecturer_id: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                >
                  <option value="">Unassigned</option>
                  {lecturers.map((l) => (
                    <option key={l.lecturer_id} value={l.lecturer_id}>
                      {l.first_name} {l.last_name} ({l.department})
                    </option>
                  ))}
                </select>
              </div>
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
                  disabled={saving}
                  className="whitespace-nowrap rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-950 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editing ? 'Save Course' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enrolled Student List Modal (Calls GetCourseStudentList) */}
      {rosterCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Enrolled Course Roster
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">
                  {rosterCourse.course_code} — {rosterCourse.course_name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setRosterCourse(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="text-xs text-slate-600">Filter roster by semester:</span>
              <select
                value={rosterSemesterId}
                onChange={(e) => {
                  setRosterSemesterId(e.target.value);
                  loadRoster(rosterCourse, e.target.value);
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-blue-900 focus:outline-none"
              >
                <option value="">All Semesters</option>
                {semesters.map((sem) => (
                  <option key={sem.semester_id} value={sem.semester_id}>
                    {sem.semester_name} ({sem.academic_year})
                  </option>
                ))}
              </select>
            </div>

            <div className="-mx-6 mt-4 overflow-x-auto border-y border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5">Reg. No.</th>
                    <th className="px-4 py-2.5">Student Name</th>
                    <th className="px-4 py-2.5">Semester</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Marks / Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rosterLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                        Loading course roster...
                      </td>
                    </tr>
                  ) : rosterStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                        No students enrolled for this selection.
                      </td>
                    </tr>
                  ) : (
                    rosterStudents.map((rs) => (
                      <tr key={rs.registration_id}>
                        <td className="px-4 py-2.5 font-mono text-slate-700">{rs.registration_number}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{rs.student_name}</td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {rs.semester_name} ({rs.academic_year})
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{rs.registration_status}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {rs.total_marks !== null ? `${rs.total_marks}% (${rs.grade})` : 'Pending'}
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Course"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.course_code} (${deleteTarget.course_name})? Courses with enrolled students cannot be deleted.`
            : ''
        }
        confirmLabel="Delete Course"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
