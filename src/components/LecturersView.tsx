import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { apiRequest } from '../api.ts';
import type { Lecturer } from '../types.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface LecturersViewProps {
  onNotify: (type: 'success' | 'error', text: string) => void;
}

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  department: '',
};

export function LecturersView({ onNotify }: LecturersViewProps) {
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Lecturer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Lecturer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchLecturers = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (deptFilter) qs.set('department', deptFilter);
      const res = await apiRequest<{ lecturers: Lecturer[]; departments: string[] }>(
        `/api/lecturers?${qs.toString()}`
      );
      setLecturers(res.lecturers);
      setDepartments(res.departments);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load lecturers.');
    } finally {
      setLoading(false);
    }
  }, [search, deptFilter, onNotify]);

  useEffect(() => {
    fetchLecturers();
  }, [fetchLecturers]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(l: Lecturer) {
    setEditing(l);
    setForm({
      first_name: l.first_name,
      last_name: l.last_name,
      email: l.email ?? '',
      phone: l.phone ?? '',
      department: l.department,
    });
    setModalOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/api/lecturers/${editing.lecturer_id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        onNotify('success', `Updated lecturer ${form.first_name} ${form.last_name}.`);
      } else {
        await apiRequest('/api/lecturers', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        onNotify('success', `Added lecturer ${form.first_name} ${form.last_name}.`);
      }
      setModalOpen(false);
      await fetchLecturers();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to save lecturer.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/lecturers/${deleteTarget.lecturer_id}`, { method: 'DELETE' });
      onNotify('success', `Removed lecturer ${deleteTarget.first_name} ${deleteTarget.last_name}.`);
      setDeleteTarget(null);
      await fetchLecturers();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Cannot delete lecturer.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Faculty &amp; Lecturers</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage academic staff, filter by department, and inspect linked courses.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 self-start whitespace-nowrap shrink-0 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-950"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Add Lecturer</span>
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lecturers by name, email, or department..."
            className="w-full rounded-md border border-slate-300 py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
          />
        </div>
        <select
          aria-label="Filter by department"
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-900 focus:outline-none"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Assigned Courses</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                    Loading lecturers...
                  </td>
                </tr>
              ) : lecturers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                    No lecturers found.
                  </td>
                </tr>
              ) : (
                lecturers.map((lec) => (
                  <tr key={lec.lecturer_id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {lec.first_name} {lec.last_name}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{lec.department}</td>
                    <td className="px-5 py-3 text-slate-600">{lec.email || '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{lec.phone || '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">
                      {lec.assigned_course_codes || 'None assigned'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(lec)}
                          className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          title="Edit Lecturer"
                          aria-label={`Edit ${lec.first_name} ${lec.last_name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(lec)}
                          className="rounded border border-slate-200 p-1.5 text-red-700 hover:bg-red-50"
                          title="Delete Lecturer"
                          aria-label={`Delete ${lec.first_name} ${lec.last_name}`}
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

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editing ? 'Update Lecturer Details' : 'Add New Lecturer'}
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
              <div>
                <label className="block text-xs font-medium text-slate-700">Department</label>
                <input
                  type="text"
                  required
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Email</label>
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
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Lecturer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Lecturer Record"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.first_name} ${deleteTarget.last_name}? Lecturers with assigned courses cannot be deleted until those courses are reassigned.`
            : ''
        }
        confirmLabel="Delete Lecturer"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
