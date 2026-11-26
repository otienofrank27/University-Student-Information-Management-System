import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { apiRequest } from '../api.ts';
import type { Semester } from '../types.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface SemestersViewProps {
  onNotify: (type: 'success' | 'error', text: string) => void;
}

const EMPTY_FORM = {
  semester_name: '',
  academic_year: '',
  start_date: '',
  end_date: '',
  status: 'Upcoming' as 'Active' | 'Upcoming' | 'Completed',
};

export function SemestersView({ onNotify }: SemestersViewProps) {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Semester | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Semester | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSemesters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ semesters: Semester[] }>('/api/semesters');
      setSemesters(res.semesters);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load semesters.');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    fetchSemesters();
  }, [fetchSemesters]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(s: Semester) {
    setEditing(s);
    setForm({
      semester_name: s.semester_name,
      academic_year: s.academic_year,
      start_date: s.start_date,
      end_date: s.end_date,
      status: s.status,
    });
    setModalOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/api/semesters/${editing.semester_id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        onNotify('success', `Updated semester ${form.semester_name} (${form.academic_year}).`);
      } else {
        await apiRequest('/api/semesters', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        onNotify('success', `Created semester ${form.semester_name} (${form.academic_year}).`);
      }
      setModalOpen(false);
      await fetchSemesters();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to save semester.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/semesters/${deleteTarget.semester_id}`, { method: 'DELETE' });
      onNotify('success', `Deleted semester ${deleteTarget.semester_name}.`);
      setDeleteTarget(null);
      await fetchSemesters();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Cannot delete semester.');
    } finally {
      setDeleting(false);
    }
  }

  const activeSem = semesters.find((s) => s.status === 'Active');

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Academic Semesters</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure academic terms, date boundaries, and designate the active enrollment semester.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 self-start whitespace-nowrap shrink-0 rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-950"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Create Semester</span>
        </button>
      </div>

      {activeSem && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-slate-900">
          <span className="font-semibold text-emerald-800">Active Semester:</span>{' '}
          <span>{activeSem.semester_name}</span>
          <span className="mx-2 text-slate-400" aria-hidden="true">·</span>
          <span className="font-mono text-xs">{activeSem.academic_year}</span>
          <span className="mx-2 text-slate-400" aria-hidden="true">·</span>
          <span className="font-mono text-xs text-slate-600">
            {activeSem.start_date} to {activeSem.end_date}
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">Semester Name</th>
                <th className="px-5 py-3">Academic Year</th>
                <th className="px-5 py-3">Start Date</th>
                <th className="px-5 py-3">End Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Registrations</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    Loading semesters...
                  </td>
                </tr>
              ) : semesters.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    No semesters created yet.
                  </td>
                </tr>
              ) : (
                semesters.map((s) => (
                  <tr key={s.semester_id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{s.semester_name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">{s.academic_year}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600 tabular-nums">{s.start_date}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600 tabular-nums">{s.end_date}</td>
                    <td
                      className={`px-5 py-3 text-xs font-semibold ${
                        s.status === 'Active'
                          ? 'text-emerald-700'
                          : s.status === 'Upcoming'
                            ? 'text-blue-900'
                            : 'text-slate-500'
                      }`}
                    >
                      {s.status}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700">
                      {s.registration_count ?? 0}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          title="Edit Semester"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(s)}
                          className="rounded border border-slate-200 p-1.5 text-red-700 hover:bg-red-50"
                          title="Delete Semester"
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
                {editing ? 'Edit Semester' : 'Create Semester'}
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
                  <label className="block text-xs font-medium text-slate-700">Semester Name</label>
                  <input
                    type="text"
                    required
                    value={form.semester_name}
                    onChange={(e) => setForm({ ...form, semester_name: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Academic Year</label>
                  <input
                    type="text"
                    required
                    value={form.academic_year}
                    onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Start Date</label>
                  <input
                    type="date"
                    required
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">End Date</label>
                  <input
                    type="date"
                    required
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Semester['status'] })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                >
                  <option value="Active">Active (sets other active semesters to Completed)</option>
                  <option value="Upcoming">Upcoming</option>
                  <option value="Completed">Completed</option>
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
                  {saving ? 'Saving...' : editing ? 'Update Semester' : 'Create Semester'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Semester"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.semester_name} (${deleteTarget.academic_year})? Semesters with linked course registrations cannot be deleted.`
            : ''
        }
        confirmLabel="Delete Semester"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
