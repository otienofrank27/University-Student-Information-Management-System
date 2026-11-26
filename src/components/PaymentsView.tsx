import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Download, Plus, Search, Trash2, X } from 'lucide-react';
import { apiRequest } from '../api.ts';
import type { FeePayment, Student } from '../types.ts';
import { downloadCsv } from '../utils/exportCsv.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface PaymentsViewProps {
  onNotify: (type: 'success' | 'error', text: string) => void;
  defaultPaymentMethod?: string;
  currencyLabel?: string;
}

interface StudentPaymentSummary {
  student_id: number;
  registration_number: string;
  student_name: string;
  course_of_study: string;
  payment_count: number;
  total_paid: number;
  last_payment_date: string | null;
}

export function PaymentsView({
  onNotify,
  defaultPaymentMethod = 'M-Pesa',
  currencyLabel = 'KSh',
}: PaymentsViewProps) {
  const [tab, setTab] = useState<'history' | 'summaries'>('history');
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [summaries, setSummaries] = useState<StudentPaymentSummary[]>([]);
  const [systemSummary, setSystemSummary] = useState({ total_transactions: 0, total_received: 0 });
  const [students, setStudents] = useState<Student[]>([]);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    student_id: '',
    amount_paid: '',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'Bank Transfer',
    transaction_reference: '',
  });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FeePayment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      qs.set('page', String(page));
      qs.set('limit', '12');

      const res = await apiRequest<{
        payments: FeePayment[];
        systemSummary: { total_transactions: number; total_received: number };
        studentSummaries: StudentPaymentSummary[];
        pagination: { page: number; totalPages: number; total: number };
      }>(`/api/payments?${qs.toString()}`);

      setPayments(res.payments);
      setSystemSummary(res.systemSummary);
      setSummaries(res.studentSummaries);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to load fee payments.');
    } finally {
      setLoading(false);
    }
  }, [search, page, onNotify]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    apiRequest<{ students: Student[] }>('/api/students?limit=100')
      .then((res) => setStudents(res.students))
      .catch(() => {});
  }, []);

  function openCreateModal() {
    setForm({
      student_id: students[0] ? String(students[0].student_id) : '',
      amount_paid: '',
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: defaultPaymentMethod,
      transaction_reference: '',
    });
    setModalOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          student_id: Number(form.student_id),
          amount_paid: Number(form.amount_paid),
          payment_date: form.payment_date,
          payment_method: form.payment_method,
          transaction_reference: form.transaction_reference,
        }),
      });
      onNotify('success', `Recorded fee payment (${form.transaction_reference}).`);
      setModalOpen(false);
      await fetchPayments();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/payments/${deleteTarget.payment_id}`, { method: 'DELETE' });
      onNotify('success', `Removed payment record ${deleteTarget.transaction_reference}.`);
      setDeleteTarget(null);
      await fetchPayments();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to delete payment.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Fee Payment Management</h1>
          <p className="mt-1 text-sm text-slate-600">
            Tuition payment ledger and per-student payment summaries.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            disabled={tab === 'history' ? payments.length === 0 : summaries.length === 0}
            onClick={() => {
              if (tab === 'history') {
                downloadCsv(
                  'fee_payments_ledger.csv',
                  ['Transaction Reference', 'Reg. Number', 'Student Name', 'Method', 'Payment Date', `Amount (${currencyLabel})`],
                  payments.map((p) => [
                    p.transaction_reference,
                    p.registration_number,
                    p.student_name,
                    p.payment_method,
                    p.payment_date,
                    p.amount_paid,
                  ])
                );
                onNotify('success', `Exported ${payments.length} fee payment(s) to CSV.`);
              } else {
                downloadCsv(
                  'student_fee_summaries.csv',
                  ['Reg. Number', 'Student Name', 'Program', 'Payments Count', `Total Paid (${currencyLabel})`, 'Last Payment Date'],
                  summaries.map((s) => [
                    s.registration_number,
                    s.student_name,
                    s.course_of_study,
                    s.payment_count,
                    s.total_paid,
                    s.last_payment_date ?? '',
                  ])
                );
                onNotify('success', `Exported ${summaries.length} student summary row(s) to CSV.`);
              }
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
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* Totals Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Total Payments Received</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {currencyLabel}{' '}
            {Number(systemSummary.total_received).toLocaleString('en-KE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Total Transactions</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {systemSummary.total_transactions}
          </p>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-5">
          <div>
            <p className="text-xs font-medium text-slate-500">Ledger View</p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {tab === 'history' ? 'Transaction History' : 'Student Payment Totals'}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium ${
                tab === 'history' ? 'bg-white text-slate-900' : 'text-slate-600'
              }`}
            >
              History
            </button>
            <button
              type="button"
              onClick={() => setTab('summaries')}
              className={`whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium ${
                tab === 'summaries' ? 'bg-white text-slate-900' : 'text-slate-600'
              }`}
            >
              By Student
            </button>
          </div>
        </div>
      </div>

      {tab === 'history' ? (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by student registration number, name, or transaction reference..."
                className="w-full rounded-md border border-slate-300 py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Transaction Ref.</th>
                    <th className="px-5 py-3">Reg. No.</th>
                    <th className="px-5 py-3">Student Name</th>
                    <th className="px-5 py-3">Method</th>
                    <th className="px-5 py-3">Payment Date</th>
                    <th className="px-5 py-3 text-right">Amount Paid</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                        Loading payment records...
                      </td>
                    </tr>
                  ) : payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                        No payment records found.
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.payment_id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-mono text-xs font-medium text-slate-900">
                          {p.transaction_reference}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-600">{p.registration_number}</td>
                        <td className="px-5 py-3 font-medium text-slate-900">{p.student_name}</td>
                        <td className="px-5 py-3 text-slate-700">{p.payment_method}</td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-600 tabular-nums">
                          {p.payment_date}
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                          {currencyLabel} {Number(p.amount_paid).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            className="rounded border border-slate-200 p-1.5 text-red-700 hover:bg-red-50"
                            title="Delete Payment"
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
                Page {page} of {totalPages} ({totalCount} payments)
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
        </>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Reg. No.</th>
                  <th className="px-5 py-3">Student Name</th>
                  <th className="px-5 py-3">Program</th>
                  <th className="px-5 py-3 text-right">Payments</th>
                  <th className="px-5 py-3">Last Payment</th>
                  <th className="px-5 py-3 text-right">Total Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {summaries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                      No student fee summaries available yet.
                    </td>
                  </tr>
                ) : (
                  summaries.map((s) => (
                    <tr key={s.student_id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono text-xs text-slate-700">{s.registration_number}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{s.student_name}</td>
                      <td className="px-5 py-3 text-slate-600">{s.course_of_study}</td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700">
                        {s.payment_count}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500 tabular-nums">
                        {s.last_payment_date || '—'}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                        {currencyLabel} {Number(s.total_paid).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h2 className="text-lg font-bold text-slate-900">Record Fee Payment</h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Student</label>
                <select
                  required
                  value={form.student_id}
                  onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                >
                  {students.map((s) => (
                    <option key={s.student_id} value={s.student_id}>
                      {s.registration_number} — {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Amount Paid ({currencyLabel})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={form.amount_paid}
                    onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={form.payment_date}
                    onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Payment Method</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
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
                  <label className="block text-xs font-medium text-slate-700">Transaction Reference</label>
                  <input
                    type="text"
                    required
                    value={form.transaction_reference}
                    onChange={(e) => setForm({ ...form, transaction_reference: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
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
                  {saving ? 'Recording...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Fee Payment"
        message={
          deleteTarget
            ? `Delete payment ${deleteTarget.transaction_reference} (${currencyLabel} ${Number(deleteTarget.amount_paid).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})?`
            : ''
        }
        confirmLabel="Delete Payment"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
