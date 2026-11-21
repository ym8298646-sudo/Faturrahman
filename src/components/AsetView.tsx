import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Calculator,
  CalendarDays,
  FileDown,
  Landmark,
  Pencil,
  PiggyBank,
  Plus,
  SlidersHorizontal,
  Target,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { CATEGORY_COLOR_PALETTE } from '../constants/defaultCategories';
import {
  WALLET_ICON_OPTIONS,
  WALLET_KIND_LABELS,
  WALLET_TEMPLATES,
} from '../constants/defaultWallets';
import {
  filterTransactionsByPeriod,
  formatCompactIDR,
  formatIDR,
  generateSafeId,
  getTodayISO,
  maskAmount,
} from '../lib/formatters';
import { exportTransactionsToPDF } from '../lib/pdfExport';
import { computeWalletBalances } from '../lib/walletBalance';
import {
  BLUEPRINT_LIMITS,
  Category,
  PeriodFilter,
  Transaction,
  TransactionType,
  WalletAccount,
  WalletKind,
} from '../types/finance';
import { BudgetModal } from './BudgetModal';
import { CategoryIcon } from './CategoryIcon';
import { TransactionTable } from './TransactionTable';

export type AsetSubSection = 'all' | 'savings' | 'ledger' | 'budget';

interface AsetViewProps {
  transactions: Transaction[];
  categories: Category[];
  wallets: WalletAccount[];
  period: PeriodFilter;
  onPeriodChange: (period: PeriodFilter) => void;
  userId: string;
  accountLabel: string;
  hideAmounts?: boolean;
  initialSection?: AsetSubSection;
  onQuickAdd: (type: TransactionType) => void;
  onQuickTransfer: (fromWalletId?: string) => void;
  onEditTx: (tx: Transaction) => void;
  onDeleteTx: (tx: Transaction) => void;
  onSaveWallet: (wallet: WalletAccount, isNew: boolean) => Promise<void> | void;
  onDeleteWallet: (walletId: string) => Promise<void> | void;
  onSaveBudgets: (updatedCategories: Category[]) => Promise<void> | void;
  onOpenCalculator: () => void;
}

const PERIOD_OPTIONS: Array<{ value: PeriodFilter; label: string }> = [
  { value: '7d', label: '7 Hari' },
  { value: '30d', label: '30 Hari' },
  { value: 'month', label: 'Bulan Ini' },
  { value: 'all', label: 'Semua' },
];

const SUB_TABS: Array<{ id: AsetSubSection; label: string }> = [
  { id: 'all', label: 'Semua Aset' },
  { id: 'savings', label: 'Simpanan & Tabungan' },
  { id: 'ledger', label: 'Pemasukan & Pengeluaran' },
  { id: 'budget', label: 'Anggaran Bulanan' },
];

export function AsetView({
  transactions,
  categories,
  wallets,
  period,
  onPeriodChange,
  userId,
  accountLabel,
  hideAmounts = false,
  initialSection = 'all',
  onQuickAdd,
  onQuickTransfer,
  onEditTx,
  onDeleteTx,
  onSaveWallet,
  onDeleteWallet,
  onSaveBudgets,
  onOpenCalculator,
}: AsetViewProps) {
  const [subSection, setSubSection] = useState<AsetSubSection>(initialSection);
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);

  // Inline wallet (simpanan & tabungan) create/edit state
  const [walletFormOpen, setWalletFormOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<WalletAccount | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WalletKind>('ewallet');
  const [initialBalanceInput, setInitialBalanceInput] = useState('0');
  const [color, setColor] = useState('#0284C7');
  const [icon, setIcon] = useState('smartphone');
  const [savingWallet, setSavingWallet] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [confirmDeleteWalletId, setConfirmDeleteWalletId] = useState<string | null>(
    null
  );

  useEffect(() => {
    setSubSection(initialSection);
  }, [initialSection]);

  const todayISO = getTodayISO();
  const currentMonthPrefix = todayISO.slice(0, 7);

  const walletSummary = useMemo(
    () => computeWalletBalances(wallets, transactions),
    [wallets, transactions]
  );

  const periodTransactions = useMemo(
    () => filterTransactionsByPeriod(transactions, period, todayISO),
    [transactions, period, todayISO]
  );

  const cashflowMetrics = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    let transferCount = 0;
    let todayIncome = 0;
    let todayExpense = 0;

    for (const tx of periodTransactions) {
      if (tx.type === 'income') {
        totalIncome += tx.amount;
        incomeCount += 1;
      } else if (tx.type === 'expense') {
        totalExpense += tx.amount;
        expenseCount += 1;
      } else if (tx.type === 'transfer') {
        transferCount += 1;
      }
    }

    for (const tx of transactions) {
      if (tx.date === todayISO) {
        if (tx.type === 'income') todayIncome += tx.amount;
        else if (tx.type === 'expense') todayExpense += tx.amount;
      }
    }

    const netCashflow = totalIncome - totalExpense;
    const expenseRatio =
      totalIncome > 0
        ? Math.min(100, Math.round((totalExpense / totalIncome) * 100))
        : totalExpense > 0
        ? 100
        : 0;

    return {
      totalIncome,
      totalExpense,
      incomeCount,
      expenseCount,
      transferCount,
      todayIncome,
      todayExpense,
      netCashflow,
      expenseRatio,
    };
  }, [periodTransactions, transactions, todayISO]);

  const groupedWalletCount = useMemo(() => {
    const counts: Record<WalletKind, number> = {
      cash: 0,
      ewallet: 0,
      bank: 0,
      savings: 0,
    };
    for (const w of wallets) {
      counts[w.kind] = (counts[w.kind] || 0) + 1;
    }
    return counts;
  }, [wallets]);

  const monthlyBudgetReport = useMemo(() => {
    const spentByCategory = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.type === 'expense' && tx.date.startsWith(currentMonthPrefix)) {
        spentByCategory.set(
          tx.categoryId,
          (spentByCategory.get(tx.categoryId) || 0) + tx.amount
        );
      }
    }

    const budgetedCategories = categories.filter(
      (c) => c.type === 'expense' && (c.monthlyBudget || 0) > 0
    );

    const items = budgetedCategories
      .map((cat) => {
        const budget = cat.monthlyBudget || 0;
        const spent = spentByCategory.get(cat.id) || 0;
        const rawPercent = budget > 0 ? Math.round((spent / budget) * 100) : 0;
        const remaining = budget - spent;
        const status =
          rawPercent >= 100
            ? 'over'
            : rawPercent >= 75
            ? 'warning'
            : 'safe';

        return {
          id: cat.id,
          name: cat.name,
          color: cat.color,
          icon: cat.icon,
          budget,
          spent,
          remaining,
          percent: rawPercent,
          barPercent: Math.min(100, rawPercent),
          status,
        };
      })
      .sort((a, b) => b.percent - a.percent);

    const totalBudget = items.reduce((s, i) => s + i.budget, 0);
    const totalSpent = items.reduce((s, i) => s + i.spent, 0);
    const overallPercent =
      totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    const [yr, mo] = currentMonthPrefix.split('-').map(Number);
    const monthLabel = new Intl.DateTimeFormat('id-ID', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(yr, mo - 1, 1));

    return {
      monthLabel,
      items,
      totalBudget,
      totalSpent,
      totalRemaining: totalBudget - totalSpent,
      overallPercent,
    };
  }, [transactions, categories, currentMonthPrefix]);

  const periodLabel =
    period === '7d'
      ? '7 Hari Terakhir'
      : period === '30d'
      ? '30 Hari Terakhir'
      : period === 'month'
      ? 'Bulan Berjalan'
      : 'Seluruh Riwayat';

  const parsedInitial = Number(initialBalanceInput.replace(/[^0-9]/g, '')) || 0;

  const startCreateWallet = () => {
    setEditingWallet(null);
    setName('');
    setKind('ewallet');
    setInitialBalanceInput('0');
    setColor('#0284C7');
    setIcon('smartphone');
    setWalletError(null);
    setWalletFormOpen(true);
    if (subSection !== 'all' && subSection !== 'savings') {
      setSubSection('savings');
    }
  };

  const startEditWallet = (wallet: WalletAccount) => {
    setEditingWallet(wallet);
    setName(wallet.name);
    setKind(wallet.kind);
    setInitialBalanceInput(String(wallet.initialBalance || 0));
    setColor(wallet.color);
    setIcon(wallet.icon);
    setWalletError(null);
    setWalletFormOpen(true);
  };

  const applyTemplate = (tpl: (typeof WALLET_TEMPLATES)[number]) => {
    setName(tpl.name);
    setKind(tpl.kind);
    setColor(tpl.color);
    setIcon(tpl.icon);
    setWalletError(null);
  };

  const handleWalletSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWalletError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setWalletError('Nama simpanan tidak boleh kosong.');
      return;
    }
    if (trimmed.length > BLUEPRINT_LIMITS.MAX_WALLET_NAME) {
      setWalletError(`Maksimal ${BLUEPRINT_LIMITS.MAX_WALLET_NAME} karakter.`);
      return;
    }
    if (parsedInitial > BLUEPRINT_LIMITS.MAX_AMOUNT) {
      setWalletError('Nominal saldo awal terlalu besar.');
      return;
    }

    const wallet: WalletAccount = {
      id: editingWallet ? editingWallet.id : generateSafeId('wal'),
      userId,
      name: trimmed,
      kind,
      initialBalance: parsedInitial,
      color,
      icon,
      isDefault: editingWallet?.isDefault ?? false,
    };

    try {
      setSavingWallet(true);
      await onSaveWallet(wallet, !editingWallet);
      setWalletFormOpen(false);
      setEditingWallet(null);
    } catch (err) {
      setWalletError(
        err instanceof Error ? err.message : 'Gagal menyimpan data simpanan.'
      );
    } finally {
      setSavingWallet(false);
    }
  };

  const showSavings = subSection === 'all' || subSection === 'savings';
  const showBudget = subSection === 'all' || subSection === 'budget';
  const showLedger = subSection === 'all' || subSection === 'ledger';

  return (
    <div className="space-y-6">
      {/* Top Period Filter & Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <CalendarDays className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Pusat pengelolaan aset untuk periode</span>
          <strong className="text-slate-900 dark:text-slate-100 font-semibold">
            {periodLabel}
          </strong>
        </div>

        <div className="flex items-center gap-1 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl self-start sm:self-auto">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onPeriodChange(opt.value)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                period === opt.value
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Unified Aset Hero Summary Panel */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Total Kekayaan &amp; Aset Terpadu</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                {wallets.length} simpanan aktif
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                {transactions.length} catatan transaksi
              </span>
            </div>

            <h2 className="text-lg sm:text-xl font-bold font-display text-slate-900 dark:text-slate-100">
              Seluruh Aset, Arus Kas &amp; Simpanan Anda
            </h2>

            <div
              className={`text-3xl sm:text-4xl font-extrabold font-mono-tabular tracking-tight ${
                walletSummary.totalBalance >= 0
                  ? 'text-slate-900 dark:text-white'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {maskAmount(formatIDR(walletSummary.totalBalance), hideAmounts)}
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Pantau gabungan saldo tabungan, e-wallet (seperti GoPay, OVO, DANA), rekening bank, dompet tunai, pemasukan, pengeluaran, serta batas anggaran bulanan dalam satu komponen terpadu.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onQuickAdd('expense')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Catat Pengeluaran
            </button>
            <button
              type="button"
              onClick={() => onQuickAdd('income')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Catat Pemasukan
            </button>
            {wallets.length >= 2 && (
              <button
                type="button"
                onClick={() => onQuickTransfer(wallets[0]?.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowLeftRight className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                Pindah Saldo
              </button>
            )}
            <button
              type="button"
              onClick={startCreateWallet}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <Landmark className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Tambah Simpanan
            </button>
            <button
              type="button"
              onClick={onOpenCalculator}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <Calculator className="w-4 h-4" />
              Kalkulator
            </button>
            <button
              type="button"
              onClick={() =>
                exportTransactionsToPDF({
                  transactions: periodTransactions,
                  allTransactions: transactions,
                  wallets,
                  period,
                  typeFilter: 'all',
                  accountLabel,
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <FileDown className="w-4 h-4" />
              Ekspor PDF
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Hari ini masuk:{' '}
              <strong className="font-mono-tabular text-slate-900 dark:text-slate-100">
                {maskAmount(formatIDR(cashflowMetrics.todayIncome), hideAmounts)}
              </strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              Hari ini keluar:{' '}
              <strong className="font-mono-tabular text-slate-900 dark:text-slate-100">
                {maskAmount(formatIDR(cashflowMetrics.todayExpense), hideAmounts)}
              </strong>
            </span>
          </div>

          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            {groupedWalletCount.bank} Bank · {groupedWalletCount.ewallet} E-Wallet ·{' '}
            {groupedWalletCount.cash + groupedWalletCount.savings} Tunai &amp; Tabungan
          </span>
        </div>
      </motion.section>

      {/* 4-Column Aset KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Simpanan &amp; Tabungan</span>
            <Wallet className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-mono-tabular text-slate-900 dark:text-slate-100">
            {maskAmount(formatIDR(walletSummary.totalBalance), hideAmounts)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Akumulasi dari {wallets.length} rekening &amp; dompet
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Pemasukan</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono-tabular text-emerald-600 dark:text-emerald-400">
            {maskAmount(`+ ${formatIDR(cashflowMetrics.totalIncome)}`, hideAmounts)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            {cashflowMetrics.incomeCount} transaksi masuk pada periode ini
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Pengeluaran</span>
            <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono-tabular text-rose-600 dark:text-rose-400">
            {maskAmount(`- ${formatIDR(cashflowMetrics.totalExpense)}`, hideAmounts)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            {cashflowMetrics.expenseCount} transaksi keluar ·{' '}
            {cashflowMetrics.transferCount} transfer
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Arus Kas Bersih Periode</span>
            <PiggyBank className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div
            className={`text-2xl font-bold font-mono-tabular ${
              cashflowMetrics.netCashflow >= 0
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {maskAmount(formatIDR(cashflowMetrics.netCashflow), hideAmounts)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            Rasio pengeluaran {cashflowMetrics.expenseRatio}% dari pemasukan
          </p>
        </div>
      </div>

      {/* Unified Aset Section Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
          role="tablist"
          aria-label="Tampilan Bagian Aset"
        >
          {SUB_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={subSection === tab.id}
              onClick={() => setSubSection(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                subSection === tab.id
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 1: SIMPANAN, TABUNGAN, E-WALLET & REKENING BANK */}
      {showSavings && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold font-display text-slate-900 dark:text-slate-100">
                Simpanan, Tabungan &amp; Rekening Bank
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Saldo setiap akun dihitung otomatis dari saldo awal, pemasukan, pengeluaran, dan transfer antar simpanan.
              </p>
            </div>
            <button
              type="button"
              onClick={startCreateWallet}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Akun Simpanan
            </button>
          </div>

          {walletFormOpen && (
            <form
              onSubmit={handleWalletSubmit}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h4 className="text-base font-bold font-display text-slate-900 dark:text-slate-100">
                    {editingWallet
                      ? 'Edit Akun Simpanan / Tabungan'
                      : 'Tambah Akun Simpanan Baru'}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Pilih template cepat atau isi detail rekening bank, tabungan, maupun e-wallet secara manual.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWalletFormOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Tutup form simpanan"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!editingWallet && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Template Populer (klik untuk isi cepat)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {WALLET_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.name}
                        type="button"
                        onClick={() => applyTemplate(tpl)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          name === tpl.name
                            ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span
                          className="w-4 h-4 rounded-xs flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: tpl.color }}
                        >
                          <CategoryIcon icon={tpl.icon} className="w-2.5 h-2.5" />
                        </span>
                        {tpl.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="aset-wallet-name"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Nama Simpanan / Bank / E-Wallet
                  </label>
                  <input
                    id="aset-wallet-name"
                    type="text"
                    maxLength={BLUEPRINT_LIMITS.MAX_WALLET_NAME}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Misal: GoPay, Bank Mandiri, Tabungan Emas"
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="aset-wallet-kind"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Jenis Simpanan
                  </label>
                  <select
                    id="aset-wallet-kind"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as WalletKind)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="ewallet">E-Wallet (GoPay, OVO, DANA, dll)</option>
                    <option value="bank">Rekening Bank (BCA, Mandiri, BRI, dll)</option>
                    <option value="cash">Uang Tunai / Dompet</option>
                    <option value="savings">Tabungan / Celengan</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="aset-wallet-balance"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Saldo Awal (IDR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono-tabular font-semibold text-slate-400">
                      Rp
                    </span>
                    <input
                      id="aset-wallet-balance"
                      type="text"
                      inputMode="numeric"
                      value={
                        parsedInitial > 0
                          ? new Intl.NumberFormat('id-ID').format(parsedInitial)
                          : initialBalanceInput === '0'
                          ? '0'
                          : ''
                      }
                      onChange={(e) =>
                        setInitialBalanceInput(
                          e.target.value.replace(/[^0-9]/g, '') || '0'
                        )
                      }
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                    Warna Identitas
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_COLOR_PALETTE.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() => setColor(swatch)}
                        className={`w-7 h-7 rounded-full transition-transform ${
                          color === swatch
                            ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900 scale-110'
                            : ''
                        }`}
                        style={{ backgroundColor: swatch }}
                        aria-label={`Pilih warna ${swatch}`}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                    Ikon Simpanan
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {WALLET_ICON_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setIcon(opt.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          icon === opt.id
                            ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <CategoryIcon icon={opt.id} className="w-3.5 h-3.5" />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {walletError && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {walletError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setWalletFormOpen(false);
                    setEditingWallet(null);
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingWallet}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {savingWallet
                    ? 'Menyimpan...'
                    : editingWallet
                    ? 'Simpan Perubahan'
                    : 'Simpan Simpanan'}
                </button>
              </div>
            </form>
          )}

          {walletSummary.items.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
              <Wallet className="w-8 h-8 text-slate-400 mx-auto" />
              <h4 className="text-sm font-bold font-display text-slate-900 dark:text-slate-100">
                Belum ada akun simpanan terdaftar
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Tambahkan dompet tunai, GoPay, OVO, tabungan, atau rekening bank Anda agar setiap transaksi tercatat langsung ke sumber dananya.
              </p>
              <button
                type="button"
                onClick={startCreateWallet}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                Tambah Simpanan Pertama
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {walletSummary.items.map(
                ({ wallet, currentBalance, totalIn, totalOut, txCount }) => {
                  const confirmingDelete = confirmDeleteWalletId === wallet.id;
                  return (
                    <div
                      key={wallet.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                            style={{ backgroundColor: wallet.color }}
                          >
                            <CategoryIcon icon={wallet.icon} className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold font-display text-slate-900 dark:text-slate-100 truncate">
                              {wallet.name}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {WALLET_KIND_LABELS[wallet.kind]} · {txCount} mutasi
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditWallet(wallet)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            aria-label={`Edit simpanan ${wallet.name}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {wallets.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDeleteWalletId(
                                  confirmingDelete ? null : wallet.id
                                )
                              }
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                              aria-label={`Hapus simpanan ${wallet.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Saldo Saat Ini
                        </span>
                        <div
                          className={`text-2xl font-bold font-mono-tabular mt-0.5 ${
                            currentBalance >= 0
                              ? 'text-slate-900 dark:text-white'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {maskAmount(formatIDR(currentBalance), hideAmounts)}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-slate-400 dark:text-slate-500 block">
                            Saldo Awal
                          </span>
                          <span className="font-mono-tabular font-medium text-slate-700 dark:text-slate-300">
                            {maskAmount(
                              formatIDR(wallet.initialBalance || 0),
                              hideAmounts
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 dark:text-slate-500 block">
                            Dana Masuk
                          </span>
                          <span className="font-mono-tabular font-medium text-emerald-600 dark:text-emerald-400">
                            {maskAmount(`+${formatIDR(totalIn)}`, hideAmounts)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 dark:text-slate-500 block">
                            Dana Keluar
                          </span>
                          <span className="font-mono-tabular font-medium text-rose-600 dark:text-rose-400">
                            {maskAmount(`-${formatIDR(totalOut)}`, hideAmounts)}
                          </span>
                        </div>
                      </div>

                      {confirmingDelete ? (
                        <div className="pt-2 flex items-center justify-between gap-2 text-xs bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
                          <span className="text-rose-700 dark:text-rose-300 font-medium">
                            Hapus simpanan ini?
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteWalletId(null)}
                              className="px-2 py-1 rounded text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteWallet(wallet.id);
                                setConfirmDeleteWalletId(null);
                              }}
                              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-medium"
                            >
                              Ya, Hapus
                            </button>
                          </div>
                        </div>
                      ) : (
                        wallets.length >= 2 && (
                          <button
                            type="button"
                            onClick={() => onQuickTransfer(wallet.id)}
                            className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                            Transfer / Top Up dari {wallet.name}
                          </button>
                        )
                      )}
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>
      )}

      {/* SECTION 2: ANGGARAN BULANAN PER KATEGORI */}
      {showBudget && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-slate-900 dark:text-slate-100">
                  Anggaran Bulanan per Kategori
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Penggunaan batas anggaran bulan {monthlyBudgetReport.monthLabel} agar pengeluaran tetap terjaga.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setBudgetModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Atur Anggaran
            </button>
          </div>

          {monthlyBudgetReport.items.length === 0 ? (
            <div className="py-6 text-center space-y-3">
              <h4 className="text-sm font-bold font-display text-slate-900 dark:text-slate-100">
                Belum ada batas anggaran bulanan ditetapkan
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Tetapkan batas pengeluaran bulanan untuk setiap kategori agar alokasi aset dan simpanan Anda lebih terkendali.
              </p>
              <button
                type="button"
                onClick={() => setBudgetModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
              >
                <Target className="w-3.5 h-3.5" />
                Tetapkan Anggaran Pertama
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    Total Pemakaian Anggaran ({monthlyBudgetReport.items.length} kategori)
                  </span>
                  <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                    {maskAmount(formatIDR(monthlyBudgetReport.totalSpent), hideAmounts)}{' '}
                    / {maskAmount(formatIDR(monthlyBudgetReport.totalBudget), hideAmounts)}{' '}
                    ({monthlyBudgetReport.overallPercent}%)
                  </span>
                </div>

                <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      monthlyBudgetReport.overallPercent >= 100
                        ? 'bg-rose-600'
                        : monthlyBudgetReport.overallPercent >= 75
                        ? 'bg-amber-500'
                        : 'bg-emerald-600'
                    }`}
                    style={{
                      width: `${Math.min(100, monthlyBudgetReport.overallPercent)}%`,
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    {monthlyBudgetReport.totalRemaining >= 0
                      ? `Sisa anggaran bulan ini: ${maskAmount(formatIDR(monthlyBudgetReport.totalRemaining), hideAmounts)}`
                      : `Melebihi total anggaran sebesar ${maskAmount(formatIDR(Math.abs(monthlyBudgetReport.totalRemaining)), hideAmounts)}`}
                  </span>
                  <span
                    className={`font-semibold ${
                      monthlyBudgetReport.overallPercent >= 100
                        ? 'text-rose-600 dark:text-rose-400'
                        : monthlyBudgetReport.overallPercent >= 75
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {monthlyBudgetReport.overallPercent >= 100
                      ? 'Status: Melebihi Batas'
                      : monthlyBudgetReport.overallPercent >= 75
                      ? 'Status: Mendekati Batas'
                      : 'Status: Aman'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {monthlyBudgetReport.items.map((item) => {
                  const statusLabel =
                    item.status === 'over'
                      ? 'Melebihi Batas'
                      : item.status === 'warning'
                      ? 'Mendekati Batas'
                      : 'Aman';
                  const statusTextClass =
                    item.status === 'over'
                      ? 'text-rose-600 dark:text-rose-400'
                      : item.status === 'warning'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400';
                  const barClass =
                    item.status === 'over'
                      ? 'bg-rose-600'
                      : item.status === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-emerald-600';

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                            style={{ backgroundColor: item.color }}
                          >
                            <CategoryIcon icon={item.icon} className="w-3.5 h-3.5" />
                          </span>
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold font-display text-slate-900 dark:text-slate-100 truncate">
                              {item.name}
                            </h4>
                            <p className={`text-xs font-medium ${statusTextClass}`}>
                              {statusLabel} · {item.percent}%
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-xs font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                            {maskAmount(formatIDR(item.spent), hideAmounts)}
                          </p>
                          <p className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                            dari {maskAmount(formatIDR(item.budget), hideAmounts)}
                          </p>
                        </div>
                      </div>

                      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${barClass}`}
                          style={{ width: `${item.barPercent}%` }}
                        />
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
                        {item.remaining >= 0
                          ? `Tersisa ${maskAmount(formatIDR(item.remaining), hideAmounts)}`
                          : `Lebih ${maskAmount(formatIDR(Math.abs(item.remaining)), hideAmounts)}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* SECTION 3: CATATAN PEMASUKAN, PENGELUARAN & MUTASI TRANSFER */}
      {showLedger && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold font-display text-slate-900 dark:text-slate-100">
                Catatan Pemasukan, Pengeluaran &amp; Transfer
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Cari, filter menurut jenis atau simpanan, serta kelola setiap mutasi keuangan harian Anda.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onQuickAdd('expense')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Catat Transaksi
              </button>
            </div>
          </div>

          <TransactionTable
            transactions={transactions}
            categories={categories}
            wallets={wallets}
            onEdit={onEditTx}
            onDelete={onDeleteTx}
            onAddNew={() => onQuickAdd('expense')}
            hideAmounts={hideAmounts}
          />
        </section>
      )}

      {/* Today compact footnote */}
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Ringkasan hari ini ({todayISO}): rata-rata keluar periode{' '}
        {maskAmount(
          formatCompactIDR(
            cashflowMetrics.totalExpense /
              Math.max(period === '7d' ? 7 : period === '30d' ? 30 : 1, 1)
          ),
          hideAmounts
        )}{' '}
        / hari.
      </p>

      <BudgetModal
        isOpen={budgetModalOpen}
        onClose={() => setBudgetModalOpen(false)}
        categories={categories}
        onSaveBudgets={onSaveBudgets}
      />
    </div>
  );
}
