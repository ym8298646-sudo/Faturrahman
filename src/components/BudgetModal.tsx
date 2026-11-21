import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { BLUEPRINT_LIMITS, Category } from '../types/finance';
import { formatIDR } from '../lib/formatters';
import { CategoryIcon } from './CategoryIcon';

interface BudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSaveBudgets: (updatedCategories: Category[]) => Promise<void> | void;
}

export function BudgetModal({
  isOpen,
  onClose,
  categories,
  onSaveBudgets,
}: BudgetModalProps) {
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories]
  );

  const [draftBudgets, setDraftBudgets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    const initial: Record<string, string> = {};
    for (const cat of expenseCategories) {
      initial[cat.id] =
        cat.monthlyBudget && cat.monthlyBudget > 0
          ? String(Math.round(cat.monthlyBudget))
          : '';
    }
    setDraftBudgets(initial);
  }, [isOpen, expenseCategories]);

  if (!isOpen) return null;

  const totalPlanned = expenseCategories.reduce((sum, cat) => {
    const val = Number((draftBudgets[cat.id] || '').replace(/[^0-9]/g, ''));
    return sum + (Number.isFinite(val) ? val : 0);
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const changed: Category[] = [];
    for (const cat of expenseCategories) {
      const raw = (draftBudgets[cat.id] || '').replace(/[^0-9]/g, '');
      const parsed = raw ? Math.min(Number(raw), BLUEPRINT_LIMITS.MAX_AMOUNT) : 0;
      const current = cat.monthlyBudget || 0;
      if (parsed !== current) {
        changed.push({
          ...cat,
          monthlyBudget: parsed,
        });
      }
    }

    if (changed.length === 0) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      await onSaveBudgets(changed);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan batas anggaran bulanan.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-modal-title"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2
              id="budget-modal-title"
              className="text-lg font-semibold font-display text-slate-900 dark:text-slate-100"
            >
              Atur Anggaran Bulanan per Kategori
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tetapkan batas pengeluaran bulanan. Kosongkan atau isi 0 untuk menonaktifkan batas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col min-h-0 flex-1">
          <div className="space-y-3 overflow-y-auto pr-1 flex-1">
            {expenseCategories.map((cat) => {
              const rawDigits = (draftBudgets[cat.id] || '').replace(/[^0-9]/g, '');
              const numericVal = Number(rawDigits);
              const formattedVal =
                rawDigits && numericVal > 0
                  ? new Intl.NumberFormat('id-ID').format(numericVal)
                  : rawDigits;

              return (
                <div
                  key={cat.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: cat.color }}
                    >
                      <CategoryIcon icon={cat.icon} className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {cat.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Batas bulanan
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative w-full sm:w-44">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono-tabular font-semibold text-slate-400">
                        Rp
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`Anggaran ${cat.name}`}
                        value={formattedVal}
                        onChange={(e) =>
                          setDraftBudgets((prev) => ({
                            ...prev,
                            [cat.id]: e.target.value.replace(/[^0-9]/g, ''),
                          }))
                        }
                        placeholder="Tanpa batas"
                        className="w-full pl-9 pr-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-right text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    {numericVal > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraftBudgets((prev) => ({
                            ...prev,
                            [cat.id]: '',
                          }))
                        }
                        className="text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 px-1.5 py-1"
                        title="Hapus batas anggaran"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                Total Target Anggaran Bulanan
              </span>
              <span className="text-sm font-bold font-mono-tabular text-slate-900 dark:text-slate-100">
                {formatIDR(totalPlanned)}
              </span>
            </div>

            {error && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
              >
                {saving ? 'Menyimpan...' : 'Simpan Anggaran'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
