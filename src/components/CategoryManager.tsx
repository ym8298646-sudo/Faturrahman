import React, { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  CATEGORY_COLOR_PALETTE,
  CATEGORY_ICON_OPTIONS,
} from '../constants/defaultCategories';
import { BLUEPRINT_LIMITS, Category } from '../types/finance';
import { formatIDR, generateSafeId } from '../lib/formatters';
import { CategoryIcon } from './CategoryIcon';

interface CategoryManagerProps {
  categories: Category[];
  userId: string;
  onSaveCategory: (cat: Category, isNew: boolean) => Promise<void> | void;
  onDeleteCategory: (categoryId: string) => Promise<void> | void;
}

export function CategoryManager({
  categories,
  userId,
  onSaveCategory,
  onDeleteCategory,
}: CategoryManagerProps) {
  const [activeType, setActiveType] = useState<'expense' | 'income'>('expense');
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_COLOR_PALETTE[0]);
  const [icon, setIcon] = useState(CATEGORY_ICON_OPTIONS[0].id);
  const [budgetInput, setBudgetInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = categories.filter((c) => c.type === activeType);

  const startEdit = (cat: Category) => {
    setEditing(cat);
    setActiveType(cat.type);
    setName(cat.name);
    setColor(cat.color);
    setIcon(cat.icon);
    setBudgetInput(
      cat.monthlyBudget && cat.monthlyBudget > 0
        ? String(Math.round(cat.monthlyBudget))
        : ''
    );
    setError(null);
  };

  const resetForm = () => {
    setEditing(null);
    setName('');
    setColor(CATEGORY_COLOR_PALETTE[0]);
    setIcon(CATEGORY_ICON_OPTIONS[0].id);
    setBudgetInput('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Nama kategori wajib diisi.');
      return;
    }
    if (trimmed.length > BLUEPRINT_LIMITS.MAX_CATEGORY_NAME) {
      setError(`Nama kategori maksimal ${BLUEPRINT_LIMITS.MAX_CATEGORY_NAME} karakter.`);
      return;
    }

    const duplicate = categories.some(
      (c) =>
        c.type === activeType &&
        c.name.toLowerCase() === trimmed.toLowerCase() &&
        c.id !== editing?.id
    );
    if (duplicate) {
      setError('Kategori dengan nama tersebut sudah ada.');
      return;
    }

    const parsedBudget =
      activeType === 'expense'
        ? Math.min(
            Number(budgetInput.replace(/[^0-9]/g, '')) || 0,
            BLUEPRINT_LIMITS.MAX_AMOUNT
          )
        : 0;

    const cat: Category = {
      id: editing ? editing.id : generateSafeId('cat'),
      userId,
      name: trimmed,
      type: activeType,
      color,
      icon,
      isDefault: editing?.isDefault ?? false,
      monthlyBudget: parsedBudget,
    };

    try {
      setSaving(true);
      await onSaveCategory(cat, !editing);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan kategori.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-base font-semibold font-display text-slate-900 dark:text-slate-100">
            Kustomisasi Kategori
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tambah, ubah nama, warna, dan ikon kategori sesuai kebutuhan Anda
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
          <button
            type="button"
            onClick={() => {
              setActiveType('expense');
              resetForm();
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeType === 'expense'
                ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Pengeluaran
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveType('income');
              resetForm();
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeType === 'income'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Pemasukan
          </button>
        </div>
      </div>

      {/* Create / Edit Form */}
      <form
        onSubmit={handleSubmit}
        className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {editing
              ? `Ubah Kategori "${editing.name}"`
              : `Tambah Kategori ${activeType === 'expense' ? 'Pengeluaran' : 'Pemasukan'} Baru`}
          </span>
          {editing && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 inline-flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              Batal Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-5">
            <label
              htmlFor="cat-name-input"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              Nama Kategori
            </label>
            <input
              id="cat-name-input"
              type="text"
              maxLength={BLUEPRINT_LIMITS.MAX_CATEGORY_NAME}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Misal: Langganan SaaS, Cicilan..."
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-4">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Warna Penanda
            </span>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {CATEGORY_COLOR_PALETTE.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  aria-label={`Pilih warna ${hex}`}
                  className={`w-6 h-6 rounded-md transition-transform ${
                    color === hex
                      ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-slate-100 dark:ring-offset-slate-950 scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>

          <div className="md:col-span-3 flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              {saving ? 'Menyimpan...' : editing ? 'Simpan' : 'Tambah'}
            </button>
          </div>
        </div>

        {activeType === 'expense' && (
          <div className="max-w-xs">
            <label
              htmlFor="cat-budget-input"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              Batas Anggaran Bulanan (Opsional)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono-tabular font-semibold text-slate-400">
                Rp
              </span>
              <input
                id="cat-budget-input"
                type="text"
                inputMode="numeric"
                value={
                  budgetInput && Number(budgetInput) > 0
                    ? new Intl.NumberFormat('id-ID').format(Number(budgetInput))
                    : budgetInput
                }
                onChange={(e) =>
                  setBudgetInput(e.target.value.replace(/[^0-9]/g, ''))
                }
                placeholder="Misal: 1.500.000"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        )}

        {/* Icon Picker */}
        <div>
          <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Pilih Ikon
          </span>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_ICON_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setIcon(opt.id)}
                title={opt.label}
                className={`p-2 rounded-lg border transition-colors ${
                  icon === opt.id
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <CategoryIcon icon={opt.id} className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
        )}
      </form>

      {/* Category List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
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
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {cat.isDefault ? 'Bawaan' : 'Kustom'}
                  {cat.type === 'expense' && cat.monthlyBudget && cat.monthlyBudget > 0
                    ? ` · Anggaran ${formatIDR(cat.monthlyBudget)}/bln`
                    : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => startEdit(cat)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label={`Ubah kategori ${cat.name}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {filtered.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDeleteCategory(cat.id)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  aria-label={`Hapus kategori ${cat.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
