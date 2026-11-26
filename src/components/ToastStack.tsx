import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import type { ToastMessage } from '../types.ts';

interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed right-5 bottom-5 z-50 flex w-full max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-panel-enter flex items-start gap-3 rounded-lg border bg-white px-4 py-3 text-sm shadow-md dark:bg-slate-900 ${
            t.type === 'success'
              ? 'border-emerald-300 text-slate-900 dark:border-emerald-700/60 dark:text-slate-100'
              : 'border-red-300 text-slate-900 dark:border-red-700/60 dark:text-slate-100'
          }`}
        >
          {t.type === 'success' ? (
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
              aria-hidden="true"
            />
          ) : (
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-400"
              aria-hidden="true"
            />
          )}
          <p className="flex-1 leading-snug">{t.text}</p>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
