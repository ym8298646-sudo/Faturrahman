import React, { useEffect, useState } from 'react';
import { ArrowRight, Calculator, X } from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  Category,
  PaymentMethod,
  Transaction,
  TransactionType,
  WalletAccount,
} from '../types/finance';
import {
  formatIDR,
  generateSafeId,
  getCurrentTimeHHMM,
  getTodayISO,
} from '../lib/formatters';
import { WALLET_KIND_LABELS } from '../constants/defaultWallets';
import { CategoryIcon } from './CategoryIcon';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: Transaction, isNew: boolean) => Promise<void> | void;
  categories: Category[];
  wallets: WalletAccount[];
  editingTransaction: Transaction | null;
  initialType?: TransactionType;
  initialWalletId?: string;
  userId: string;
  onOpenCalculator: (onApply: (value: number) => void) => void;
  onNavigateCategories: () => void;
  onNavigateWallets: () => void;
}

const NOTE_SUGGESTIONS: Record<TransactionType, string[]> = {
  expense: [
    'Makan siang harian',
    'Isi BBM / transportasi',
    'Belanja kebutuhan dapur',
    'Pembayaran tagihan bulanan',
  ],
  income: [
    'Gaji bulanan',
    'Pembayaran proyek / jasa',
    'Penjualan harian',
    'Bonus / komisi',
  ],
  transfer: [
    'Top up GoPay',
    'Tarik tunai ATM',
    'Transfer antar rekening',
    'Sisihkan tabungan',
  ],
};

function defaultPaymentMethodForWallet(wallet?: WalletAccount): PaymentMethod {
  if (!wallet) return 'Tunai';
  if (wallet.kind === 'ewallet') return 'QRIS / E-Wallet';
  if (wallet.kind === 'bank' || wallet.kind === 'savings') return 'Transfer Bank';
  return 'Tunai';
}

export function TransactionModal({
  isOpen,
  onClose,
  onSave,
  categories,
  wallets,
  editingTransaction,
  initialType = 'expense',
  initialWalletId,
  userId,
  onOpenCalculator,
  onNavigateCategories,
  onNavigateWallets,
}: TransactionModalProps) {
  const [type, setType] = useState<TransactionType>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [walletId, setWalletId] = useState('');
  const [toWalletId, setToWalletId] = useState('');
  const [date, setDate] = useState(getTodayISO());
  const [time, setTime] = useState(getCurrentTimeHHMM());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Tunai');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const availableCategories = categories.filter((c) => c.type === type);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingTransaction) {
      setType(editingTransaction.type);
      setAmountInput(String(editingTransaction.amount));
      setCategoryId(editingTransaction.categoryId);
      setWalletId(editingTransaction.walletId || wallets[0]?.id || '');
      const fallbackTarget =
        wallets.find((w) => w.id !== (editingTransaction.walletId || wallets[0]?.id))
          ?.id || '';
      setToWalletId(editingTransaction.toWalletId || fallbackTarget);
      setDate(editingTransaction.date);
      setTime(editingTransaction.time);
      setPaymentMethod(editingTransaction.paymentMethod || 'Tunai');
      setNote(editingTransaction.note || '');
    } else {
      setType(initialType);
      setAmountInput('');
      const firstCat = categories.find((c) => c.type === initialType);
      setCategoryId(firstCat?.id || '');

      const defaultSource =
        (initialWalletId && wallets.find((w) => w.id === initialWalletId)) ||
        wallets[0];
      const defaultTarget =
        wallets.find((w) => w.id !== defaultSource?.id) || wallets[1];

      setWalletId(defaultSource?.id || '');
      setToWalletId(defaultTarget?.id || '');
      setDate(getTodayISO());
      setTime(getCurrentTimeHHMM());
      setPaymentMethod(
        initialType === 'transfer'
          ? 'Transfer Bank'
          : defaultPaymentMethodForWallet(defaultSource)
      );
      setNote('');
    }
  }, [isOpen, editingTransaction, initialType, initialWalletId, categories, wallets]);

  useEffect(() => {
    if (!isOpen || type === 'transfer') return;
    const match = availableCategories.some((c) => c.id === categoryId);
    if (!match && availableCategories.length > 0) {
      setCategoryId(availableCategories[0].id);
    }
  }, [type, availableCategories, categoryId, isOpen]);

  useEffect(() => {
    if (!isOpen || type !== 'transfer') return;
    if (wallets.length >= 2 && (!toWalletId || toWalletId === walletId)) {
      const alt = wallets.find((w) => w.id !== walletId);
      if (alt) setToWalletId(alt.id);
    }
  }, [type, walletId, toWalletId, wallets, isOpen]);

  if (!isOpen) return null;

  const parsedAmount = Number(amountInput.replace(/[^0-9]/g, ''));

  const handleSelectSourceWallet = (nextId: string) => {
    setWalletId(nextId);
    if (!editingTransaction && type !== 'transfer') {
      const w = wallets.find((item) => item.id === nextId);
      setPaymentMethod(defaultPaymentMethodForWallet(w));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Masukkan nominal transaksi lebih besar dari Rp 0.');
      return;
    }
    if (parsedAmount > BLUEPRINT_LIMITS.MAX_AMOUNT) {
      setError('Nominal terlalu besar.');
      return;
    }

    const sourceWallet = wallets.find((w) => w.id === walletId);

    if (type === 'transfer') {
      if (wallets.length < 2) {
        setError('Tambahkan minimal 2 akun simpanan untuk melakukan transfer saldo.');
        return;
      }
      const targetWallet = wallets.find((w) => w.id === toWalletId);
      if (!sourceWallet || !targetWallet) {
        setError('Pilih simpanan asal dan simpanan tujuan.');
        return;
      }
      if (sourceWallet.id === targetWallet.id) {
        setError('Simpanan asal dan tujuan tidak boleh sama.');
        return;
      }

      const tx: Transaction = {
        id: editingTransaction ? editingTransaction.id : generateSafeId('tx'),
        userId,
        type: 'transfer',
        amount: parsedAmount,
        categoryId: 'cat_transfer',
        categoryName: 'Transfer Saldo',
        walletId: sourceWallet.id,
        walletName: sourceWallet.name,
        toWalletId: targetWallet.id,
        toWalletName: targetWallet.name,
        date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getTodayISO(),
        time: /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)
          ? time
          : getCurrentTimeHHMM(),
        paymentMethod,
        note: note.trim().slice(0, BLUEPRINT_LIMITS.MAX_NOTE_LENGTH),
      };

      try {
        setSaving(true);
        await onSave(tx, !editingTransaction);
        onClose();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Gagal menyimpan transfer saldo. Periksa koneksi Anda.'
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    const selectedCategory = availableCategories.find((c) => c.id === categoryId);
    if (!selectedCategory) {
      setError('Pilih kategori terlebih dahulu.');
      return;
    }

    const tx: Transaction = {
      id: editingTransaction ? editingTransaction.id : generateSafeId('tx'),
      userId,
      type,
      amount: parsedAmount,
      categoryId: selectedCategory.id,
      categoryName: selectedCategory.name,
      ...(sourceWallet
        ? { walletId: sourceWallet.id, walletName: sourceWallet.name }
        : {}),
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getTodayISO(),
      time: /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)
        ? time
        : getCurrentTimeHHMM(),
      paymentMethod,
      note: note.trim().slice(0, BLUEPRINT_LIMITS.MAX_NOTE_LENGTH),
    };

    try {
      setSaving(true);
      await onSave(tx, !editingTransaction);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan transaksi. Periksa koneksi Anda.'
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
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-modal-title"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <h2
            id="tx-modal-title"
            className="text-lg font-semibold font-display text-slate-900 dark:text-slate-100"
          >
            {editingTransaction ? 'Edit Transaksi' : 'Catat Transaksi Harian'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Segmented Type Selector */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`py-2 px-2.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                type === 'expense'
                  ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Pengeluaran
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`py-2 px-2.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                type === 'income'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Pemasukan
            </button>
            <button
              type="button"
              onClick={() => setType('transfer')}
              className={`py-2 px-2.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                type === 'transfer'
                  ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Pindah Saldo
            </button>
          </div>

          {/* Amount Input + Calculator Trigger */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="tx-amount"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Nominal (IDR)
              </label>
              <button
                type="button"
                onClick={() =>
                  onOpenCalculator((val) => setAmountInput(String(val)))
                }
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
              >
                <Calculator className="w-3.5 h-3.5" />
                Hitung dengan Kalkulator
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono-tabular font-semibold text-slate-400 dark:text-slate-500">
                Rp
              </span>
              <input
                id="tx-amount"
                type="text"
                inputMode="numeric"
                value={
                  parsedAmount > 0
                    ? new Intl.NumberFormat('id-ID').format(parsedAmount)
                    : amountInput
                }
                onChange={(e) =>
                  setAmountInput(e.target.value.replace(/[^0-9]/g, ''))
                }
                placeholder="0"
                className="w-full pl-11 pr-4 py-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono-tabular text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
            {parsedAmount > 0 && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
                Terbaca: {formatIDR(parsedAmount)}
              </p>
            )}
          </div>

          {/* Transfer Wallet Selector vs Category + Wallet Picker */}
          {type === 'transfer' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Pindah Saldo Antar Simpanan
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateWallets();
                  }}
                  className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                >
                  Kelola Simpanan
                </button>
              </div>

              {wallets.length < 2 ? (
                <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-3">
                  <span>
                    Anda memerlukan minimal 2 akun simpanan (misal: Bank BCA dan GoPay) untuk memindahkan saldo.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateWallets();
                    }}
                    className="px-3 py-1.5 rounded-md bg-amber-600 text-white font-medium whitespace-nowrap shrink-0"
                  >
                    Tambah Simpanan
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2.5 items-end">
                  <div>
                    <label
                      htmlFor="tx-from-wallet"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                    >
                      Dari Simpanan
                    </label>
                    <select
                      id="tx-from-wallet"
                      value={walletId}
                      onChange={(e) => setWalletId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {wallets.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({WALLET_KIND_LABELS[w.kind]})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="hidden sm:flex items-center justify-center pb-2 text-slate-400">
                    <ArrowRight className="w-4 h-4" />
                  </div>

                  <div>
                    <label
                      htmlFor="tx-to-wallet"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                    >
                      Ke Simpanan
                    </label>
                    <select
                      id="tx-to-wallet"
                      value={toWalletId}
                      onChange={(e) => setToWalletId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {wallets
                        .filter((w) => w.id !== walletId)
                        .map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({WALLET_KIND_LABELS[w.kind]})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Simpanan / Rekening Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {type === 'income' ? 'Masuk ke Simpanan' : 'Sumber Dana (Simpanan)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateWallets();
                    }}
                    className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  >
                    Kelola Simpanan
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {wallets.map((w) => {
                    const selected = w.id === walletId;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => handleSelectSourceWallet(w.id)}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs font-medium transition-colors ${
                          selected
                            ? 'border-sky-600 dark:border-sky-500 bg-sky-50/70 dark:bg-sky-950/40 text-slate-900 dark:text-slate-100'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span
                          className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: w.color }}
                        >
                          <CategoryIcon icon={w.icon} className="w-3.5 h-3.5" />
                        </span>
                        <span className="truncate">{w.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category Picker */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Kategori
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateCategories();
                    }}
                    className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  >
                    Kelola Kategori
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {availableCategories.map((cat) => {
                    const selected = cat.id === categoryId;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoryId(cat.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs font-medium transition-colors ${
                          selected
                            ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-slate-900 dark:text-slate-100'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span
                          className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: cat.color }}
                        >
                          <CategoryIcon icon={cat.icon} className="w-3.5 h-3.5" />
                        </span>
                        <span className="truncate">{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Date, Time & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="tx-date"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Tanggal
              </label>
              <input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
            <div>
              <label
                htmlFor="tx-time"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Waktu
              </label>
              <input
                id="tx-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
            <div>
              <label
                htmlFor="tx-method"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Metode
              </label>
              <select
                id="tx-method"
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as PaymentMethod)
                }
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {BLUEPRINT_LIMITS.PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Informative Note */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="tx-note"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Catatan Transaksi
              </label>
              <span className="text-xs font-mono-tabular text-slate-400 dark:text-slate-500">
                {note.length}/{BLUEPRINT_LIMITS.MAX_NOTE_LENGTH}
              </span>
            </div>
            <textarea
              id="tx-note"
              rows={3}
              maxLength={BLUEPRINT_LIMITS.MAX_NOTE_LENGTH}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                type === 'transfer'
                  ? 'Contoh: Top up saldo GoPay dari rekening BCA untuk transport...'
                  : 'Contoh: Beli bahan makanan mingguan di pasar, struk #42...'
              }
              className="w-full px-3.5 py-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {NOTE_SUGGESTIONS[type].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() =>
                    setNote((prev) =>
                      prev ? `${prev} · ${suggestion}` : suggestion
                    )
                  }
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 transition-colors"
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
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
              {saving
                ? 'Menyimpan...'
                : editingTransaction
                ? 'Simpan Perubahan'
                : type === 'transfer'
                ? 'Simpan Transfer'
                : 'Simpan Transaksi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
