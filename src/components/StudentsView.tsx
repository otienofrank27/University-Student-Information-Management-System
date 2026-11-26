import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Download, Eye, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { apiRequest } from '../api.ts';
import type { Course, Student } from '../types.ts';
import { downloadCsv } from '../utils/exportCsv.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface StudentsViewProps {
  onNotify: (type: 'success' | 'error', text: string) => void;
  currencyLabel?: string;
}

interface StudentProfileData {
  details: Student & {
    total_courses_registered: number;
    total_fees_paid?: number;
  };
  results: Array<{
    result_id: number;
    course_code: string;
    course_name: string;
    semester_name: string;
    academic_year: string;
    exam_marks: number;
    assignment_marks: number;
    total_marks: number;
    grade: string;
    remarks: string;
  }>;
  registrations: Array<{
    registration_id: number;
    course_code: string;
    course_name: string;
    semester: string;
    academic_year: string;
    registration_date: string;
    registration_status: string;
  }>;
  payments: Array<{
    payment_id: number;
    amount_paid: number;
    payment_date: string;
    payment_method: string;
    transaction_reference: string;
  }> | null;
}

const EMPTY_FORM = {
  registration_number: '',
  first_name: '',
  last_name: '',
  gender: 'Female' as 'Male' | 'Female' | 'Other',
  email: '',
  phone: '',
  course_of_study: '',
  year_of_study: 1,
  date_registered: new Date().toISOString().slice(0, 10),
  status: 'Active' as 'Active' | 'Inactive' | 'Graduated' | 'Suspended',
};

export function StudentsView({ onNotify, currencyLabel = 'KSh' }: StudentsViewProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [profileData, setProfileData] = useState<StudentProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [courseOptions, setCourseOptions] = useState<Course[]>([]);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (yearFilter) qs.set('year', yearFilter);
      if (statusFilter) qs.set('status', statusFilter);
      qs.set('page', String(page));
      qs.set('limit', '10');

      const res = await apiRequest<{
        students: Student[];
        pagination: { page: number; totalPages: number; total: number };
      }>(`/api/students?${qs.toString()}`);

      setStudents(res.students);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load students.');
    } finally {
      setLoading(false);
    }
  }, [search, yearFilter, statusFilter, page, onNotify]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    apiRequest<{ courses: Course[] }>('/api/courses')
      .then((res) => setCourseOptions(res.courses))
      .catch(() => {});
  }, []);

  async function openCreateModal() {
    setEditingStudent(null);
    setForm({ ...EMPTY_FORM, date_registered: new Date().toISOString().slice(0, 10) });
    setModalOpen(true);
    try {
      const res = await apiRequest<{ registration_number: string }>('/api/students/generate-reg-number');
      setForm((prev) => ({ ...prev, registration_number: res.registration_number }));
    } catch {
      // User can still enter manually
    }
  }

  function openEditModal(student: Student) {
    setEditingStudent(student);
    setForm({
      registration_number: student.registration_number,
      first_name: student.first_name,
      last_name: student.last_name,
      gender: student.gender,
      email: student.email ?? '',
      phone: student.phone ?? '',
      course_of_study: student.course_of_study,
      year_of_study: student.year_of_study,
      date_registered: student.date_registered,
      status: student.status,
    });
    setModalOpen(true);
  }

  async function handleGenerateRegNumber() {
    try {
      const res = await apiRequest<{ registration_number: string }>('/api/students/generate-reg-number');
      setForm((prev) => ({ ...prev, registration_number: res.registration_number }));
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Could not generate registration number.');
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingStudent) {
        await apiRequest(`/api/students/${editingStudent.student_id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        onNotify('success', `Updated student ${form.first_name} ${form.last_name}.`);
      } else {
        await apiRequest('/api/students', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        onNotify('success', `Registered student ${form.first_name} ${form.last_name}.`);
      }
      setModalOpen(false);
      await fetchStudents();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to save student.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/students/${deleteTarget.student_id}`, { method: 'DELETE' });
      onNotify('success', `Deleted student ${deleteTarget.registration_number}.`);
      setDeleteTarget(null);
      await fetchStudents();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to delete student.');
    } finally {
      setDeleting(false);
    }
  }

  async function openProfile(studentId: number) {
    setProfileLoading(true);
    setProfileData(null);
    try {
      const res = await apiRequest<StudentProfileData>(`/api/students/${studentId}/profile`);
      setProfileData(res);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load student profile.');
    } finally {
      setProfileLoading(false);
    }
  }

  function statusTextClass(status: string) {
    if (status === 'Active') return 'text-emerald-700';
    if (status === 'Graduated') return 'text-blue-900';
    if (status === 'Suspended') return 'text-red-700';
    return 'text-amber-700';
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Student Directory</h1>
          <p className="mt-1 text-sm text-slate-600">
            Register, search, filter, inspect profiles, and maintain student records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            disabled={students.length === 0}
            onClick={() => {
              downloadCsv(
                'students_directory.csv',
                ['Registration Number', 'First Name', 'Last Name', 'Gender', 'Email', 'Phone', 'Program', 'Year', 'Date Registered', 'Status'],
                students.map((st) => [
                  st.registration_number,
                  st.first_name,
                  st.last_name,
                  st.gender,
                  st.email ?? '',
                  st.phone ?? '',
                  st.course_of_study,
                  st.year_of_study,
                  st.date_registered,
                  st.status,
                ])
              );
              onNotify('success', `Exported ${students.length} student record(s) to CSV.`);
            }}
            className="flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-2 whitespace-nowrap shrink-0 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-950"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Register Student</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
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
            placeholder="Search by registration number, name, or email..."
            className="w-full rounded-md border border-slate-300 py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
          />
        </div>
        <select
          aria-label="Filter by year of study"
          value={yearFilter}
          onChange={(e) => {
            setYearFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-900 focus:outline-none"
        >
          <option value="">All Years</option>
          <option value="1">Year 1</option>
          <option value="2">Year 2</option>
          <option value="3">Year 3</option>
          <option value="4">Year 4</option>
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-900 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Graduated">Graduated</option>
          <option value="Suspended">Suspended</option>
        </select>
      </div>

      {/* Students Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">Reg. Number</th>
                <th className="px-5 py-3">Full Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Program</th>
                <th className="px-5 py-3 text-right">Year</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-5 py-3.5 text-xs text-slate-400">
                      Loading student records...
                    </td>
                  </tr>
                ))
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">
                    No students match the current search or filter criteria.
                  </td>
                </tr>
              ) : (
                students.map((st) => (
                  <tr key={st.student_id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs font-medium text-slate-900">
                      {st.registration_number}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {st.first_name} {st.last_name}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{st.email || '—'}</td>
                    <td className="px-5 py-3 text-slate-700">{st.course_of_study}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700">
                      {st.year_of_study}
                    </td>
                    <td className={`px-5 py-3 text-xs font-semibold ${statusTextClass(st.status)}`}>
                      {st.status}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openProfile(st.student_id)}
                          className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          title="View Profile"
                          aria-label={`View profile for ${st.first_name} ${st.last_name}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(st)}
                          className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          title="Edit Student"
                          aria-label={`Edit ${st.first_name} ${st.last_name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(st)}
                          className="rounded border border-slate-200 p-1.5 text-red-700 hover:bg-red-50"
                          title="Delete Student"
                          aria-label={`Delete ${st.first_name} ${st.last_name}`}
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

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-600">
          <span className="font-mono tabular-nums">
            Showing page {page} of {totalPages} ({totalCount} total students)
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

      {/* Register / Edit Student Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editingStudent ? 'Edit Student Record' : 'Register New Student'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Registration Number</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="text"
                      required
                      value={form.registration_number}
                      onChange={(e) => setForm({ ...form, registration_number: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                    />
                    {!editingStudent && (
                      <button
                        type="button"
                        onClick={handleGenerateRegNumber}
                        className="whitespace-nowrap shrink-0 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Generate
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Date Registered</label>
                  <input
                    type="date"
                    required
                    value={form.date_registered}
                    onChange={(e) => setForm({ ...form, date_registered: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">First Name</label>
                  <input
                    type="text"
                    required
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Last Name</label>
                  <input
                    type="text"
                    required
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Gender</label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value as Student['gender'] })}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Year of Study</label>
                  <select
                    value={form.year_of_study}
                    onChange={(e) => setForm({ ...form, year_of_study: Number(e.target.value) })}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  >
                    {[1, 2, 3, 4, 5, 6].map((y) => (
                      <option key={y} value={y}>
                        Year {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as Student['status'] })}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Graduated">Graduated</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Email Address</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Course of Study / Program</label>
                <input
                  type="text"
                  required
                  list="kyu-course-options"
                  value={form.course_of_study}
                  onChange={(e) => setForm({ ...form, course_of_study: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                />
                <datalist id="kyu-course-options">
                  {courseOptions.map((c) => (
                    <option key={c.course_id} value={c.course_name} />
                  ))}
                </datalist>
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
                  {saving ? 'Saving...' : editingStudent ? 'Update Student' : 'Register Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detailed Student Profile Modal (Powered by Stored Procedures) */}
      {(profileLoading || profileData) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6">
            {profileLoading || !profileData ? (
              <p className="py-10 text-center text-sm text-slate-600">Loading student profile...</p>
            ) : (
              <div className="space-y-6">
                <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                      <span>{profileData.details.registration_number}</span>
                      <span aria-hidden="true">·</span>
                      <span className={statusTextClass(profileData.details.status)}>
                        {profileData.details.status}
                      </span>
                    </div>
                    <h2 className="mt-1 text-xl font-bold text-slate-900">
                      {profileData.details.first_name} {profileData.details.last_name}
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {profileData.details.course_of_study} · Year {profileData.details.year_of_study}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const st = profileData.details;
                        downloadCsv(
                          `transcript_${st.registration_number}.csv`,
                          ['Registration Number', 'Student Name', 'Course Code', 'Course Title', 'Semester', 'Academic Year', 'Exam Marks', 'Assignment Marks', 'Total Marks', 'Grade', 'Remarks'],
                          profileData.results.map((r) => [
                            st.registration_number,
                            `${st.first_name} ${st.last_name}`,
                            r.course_code,
                            r.course_name,
                            r.semester_name,
                            r.academic_year,
                            r.exam_marks,
                            r.assignment_marks,
                            r.total_marks,
                            r.grade,
                            r.remarks,
                          ])
                        );
                        onNotify('success', `Downloaded transcript for ${st.registration_number}.`);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Download Transcript</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProfileData(null)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Close profile"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="-mx-6 grid grid-cols-2 gap-4 border-y border-slate-200 bg-slate-50/70 px-6 py-4 text-xs sm:grid-cols-4">
                  <div>
                    <span className="text-slate-500">Email</span>
                    <p className="mt-1 font-medium text-slate-900">{profileData.details.email || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Phone</span>
                    <p className="mt-1 font-mono text-slate-900">{profileData.details.phone || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Registered Courses</span>
                    <p className="mt-1 font-mono font-semibold text-slate-900 tabular-nums">
                      {profileData.details.total_courses_registered}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Total Fees Paid</span>
                    <p className="mt-1 font-mono font-semibold text-emerald-700 tabular-nums">
                      {currencyLabel}{' '}
                      {Number(profileData.details.total_fees_paid ?? 0).toLocaleString('en-KE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>

                {/* Examination Results */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Examination Results</h3>
                  <div className="mt-2 overflow-x-auto border-y border-slate-200">
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
                        {profileData.results.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-4 text-center text-slate-500">
                              No examination results recorded yet.
                            </td>
                          </tr>
                        ) : (
                          profileData.results.map((r) => (
                            <tr key={r.result_id}>
                              <td className="px-4 py-2.5">
                                <span className="font-mono font-medium text-slate-900">{r.course_code}</span>{' '}
                                <span className="text-slate-600">{r.course_name}</span>
                              </td>
                              <td className="px-4 py-2.5 text-slate-600">
                                {r.semester_name} ({r.academic_year})
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.exam_marks}</td>
                              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.assignment_marks}</td>
                              <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                                {r.total_marks}
                              </td>
                              <td className="px-4 py-2.5 font-mono">
                                <span className="font-semibold text-slate-900">{r.grade}</span>
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

                {/* Fee Payments */}
                {profileData.payments && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Fee Payment History</h3>
                    <div className="mt-2 overflow-x-auto border-y border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                          <tr>
                            <th className="px-4 py-2.5">Date</th>
                            <th className="px-4 py-2.5">Method</th>
                            <th className="px-4 py-2.5">Transaction Reference</th>
                            <th className="px-4 py-2.5 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {profileData.payments.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-4 text-center text-slate-500">
                                No fee payments recorded.
                              </td>
                            </tr>
                          ) : (
                            profileData.payments.map((p) => (
                              <tr key={p.payment_id}>
                                <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600">{p.payment_date}</td>
                                <td className="px-4 py-2.5 text-slate-700">{p.payment_method}</td>
                                <td className="px-4 py-2.5 font-mono text-slate-600">{p.transaction_reference}</td>
                                <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                                  {currencyLabel}{' '}
                                  {Number(p.amount_paid).toLocaleString('en-KE', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Student Record"
        message={
          deleteTarget
            ? `Permanently delete ${deleteTarget.first_name} ${deleteTarget.last_name} (${deleteTarget.registration_number})? Students with existing fee payment records cannot be deleted until those transactions are cleared.`
            : ''
        }
        confirmLabel="Delete Student"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
