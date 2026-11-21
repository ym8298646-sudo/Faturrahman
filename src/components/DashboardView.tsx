import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calculator,
  CalendarDays,
  CreditCard,
  FileDown,
  Flame,
  PiggyBank,
  Plus,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Wallet,
  ArrowLeftRight,
} from 'lucide-react';
import {
  Category,
  PeriodFilter,
  Transaction,
  TransactionType,
  WalletAccount,
} from '../types/finance';
import { WALLET_KIND_LABELS } from '../constants/defaultWallets';
import {
  filterTransactionsByPeriod,
  formatCompactIDR,
  formatIDR,
  formatShortDayID,
  getTodayISO,
  maskAmount,
} from '../lib/formatters';
import { exportTransactionsToPDF } from '../lib/pdfExport';
import { computeWalletBalances } from '../lib/walletBalance';
import { BudgetModal } from './BudgetModal';
import { CategoryIcon } from './CategoryIcon';
import { TransactionTable } from './TransactionTable';

interface DashboardViewProps {
  transactions: Transaction[];
  categories: Category[];
  wallets: WalletAccount[];
  period: PeriodFilter;
  onPeriodChange: (period: PeriodFilter) => void;
  accountLabel: string;
  darkMode: boolean;
  onQuickAdd: (type: TransactionType) => void;
  onQuickTransfer: (fromWalletId?: string) => void;
  onEditTx: (tx: Transaction) => void;
  onDeleteTx: (tx: Transaction) => void;
  onSaveBudgets: (updatedCategories: Category[]) => Promise<void> | void;
  onOpenCalculator: () => void;
  onViewAllTransactions: () => void;
  onNavigateWallets: () => void;
  hideAmounts?: boolean;
}

const PERIOD_OPTIONS: Array<{ value: PeriodFilter; label: string }> = [
  { value: '7d', label: '7 Hari' },
  { value: '30d', label: '30 Hari' },
  { value: 'month', label: 'Bulan Ini' },
  { value: 'all', label: 'Semua' },
];

export function DashboardView({
  transactions,
  categories,
  wallets,
  period,
  onPeriodChange,
  accountLabel,
  darkMode,
  onQuickAdd,
  onQuickTransfer,
  onEditTx,
  onDeleteTx,
  onSaveBudgets,
  onOpenCalculator,
  onViewAllTransactions,
  onNavigateWallets,
  hideAmounts = false,
}: DashboardViewProps) {
  const [chartMode, setChartMode] = useState<'bar' | 'trend'>('bar');
  const [breakdownType, setBreakdownType] = useState<'expense' | 'income'>('expense');
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);

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

  const metrics = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    let todayIncome = 0;
    let todayExpense = 0;

    const activeDays = new Set<string>();
    const expenseByCat = new Map<string, { id: string; name: string; total: number }>();

    for (const tx of periodTransactions) {
      if (tx.type === 'transfer') continue;
      activeDays.add(tx.date);
      if (tx.type === 'income') {
        totalIncome += tx.amount;
        incomeCount += 1;
      } else if (tx.type === 'expense') {
        totalExpense += tx.amount;
        expenseCount += 1;
        const prev = expenseByCat.get(tx.categoryId) || {
          id: tx.categoryId,
          name: tx.categoryName,
          total: 0,
        };
        prev.total += tx.amount;
        expenseByCat.set(tx.categoryId, prev);
      }
    }

    for (const tx of transactions) {
      if (tx.date === todayISO) {
        if (tx.type === 'income') todayIncome += tx.amount;
        else if (tx.type === 'expense') todayExpense += tx.amount;
      }
    }

    const netBalance = totalIncome - totalExpense;
    const savingsRate =
      totalIncome > 0
        ? Math.max(-100, Math.min(100, Math.round((netBalance / totalIncome) * 100)))
        : 0;
    const expenseRatio =
      totalIncome > 0
        ? Math.min(100, Math.round((totalExpense / totalIncome) * 100))
        : totalExpense > 0
        ? 100
        : 0;

    const daysDivisor =
      period === '7d'
        ? 7
        : period === '30d'
        ? 30
        : Math.max(activeDays.size, 1);
    const avgDailyExpense = totalExpense / daysDivisor;

    const topExpenseCategory =
      Array.from(expenseByCat.values()).sort((a, b) => b.total - a.total)[0] ||
      null;

    return {
      totalIncome,
      totalExpense,
      netBalance,
      incomeCount,
      expenseCount,
      todayIncome,
      todayExpense,
      savingsRate,
      expenseRatio,
      avgDailyExpense,
      topExpenseCategory,
      activeDayCount: activeDays.size,
    };
  }, [periodTransactions, transactions, period, todayISO]);

  const dailySeries = useMemo(() => {
    const map = new Map<
      string,
      { date: string; label: string; income: number; expense: number; net: number }
    >();
    for (const tx of periodTransactions) {
      if (tx.type === 'transfer') continue;
      const existing = map.get(tx.date) || {
        date: tx.date,
        label: formatShortDayID(tx.date),
        income: 0,
        expense: 0,
        net: 0,
      };
      if (tx.type === 'income') existing.income += tx.amount;
      else if (tx.type === 'expense') existing.expense += tx.amount;
      existing.net = existing.income - existing.expense;
      map.set(tx.date, existing);
    }

    const sorted = Array.from(map.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    let running = 0;
    return sorted.map((item) => {
      running += item.net;
      return {
        ...item,
        cumulative: running,
      };
    });
  }, [periodTransactions]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  const categoryBreakdown = useMemo(() => {
    const filtered = periodTransactions.filter((tx) => tx.type === breakdownType);
    const total = filtered.reduce((sum, tx) => sum + tx.amount, 0);
    const map = new Map<
      string,
      { id: string; name: string; value: number; color: string; icon: string; count: number }
    >();

    for (const tx of filtered) {
      const cat = categoryMap.get(tx.categoryId);
      const existing = map.get(tx.categoryId) || {
        id: tx.categoryId,
        name: tx.categoryName,
        value: 0,
        color:
          cat?.color || (breakdownType === 'income' ? '#059669' : '#E11D48'),
        icon: cat?.icon || 'tag',
        count: 0,
      };
      existing.value += tx.amount;
      existing.count += 1;
      map.set(tx.categoryId, existing);
    }

    return {
      total,
      items: Array.from(map.values())
        .sort((a, b) => b.value - a.value)
        .map((item) => ({
          ...item,
          percent: total > 0 ? Math.round((item.value / total) * 100) : 0,
        })),
    };
  }, [periodTransactions, breakdownType, categoryMap]);

  const paymentMethodStats = useMemo(() => {
    const map = new Map<string, { method: string; total: number; count: number }>();
    let grandTotal = 0;
    for (const tx of periodTransactions) {
      if (tx.type === 'transfer') continue;
      const method = tx.paymentMethod || 'Tunai';
      const prev = map.get(method) || { method, total: 0, count: 0 };
      prev.total += tx.amount;
      prev.count += 1;
      grandTotal += tx.amount;
      map.set(method, prev);
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .map((item) => ({
        ...item,
        percent: grandTotal > 0 ? Math.round((item.total / grandTotal) * 100) : 0,
      }));
  }, [periodTransactions]);

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

  const axisColor = darkMode ? '#94A3B8' : '#64748B';
  const gridColor = darkMode ? '#1E293B' : '#E2E8F0';
  const tooltipBg = darkMode ? '#0F172A' : '#FFFFFF';
  const tooltipBorder = darkMode ? '#334155' : '#E2E8F0';

  const periodLabel =
    period === '7d'
      ? '7 Hari Terakhir'
      : period === '30d'
      ? '30 Hari Terakhir'
      : period === 'month'
      ? 'Bulan Berjalan'
      : 'Seluruh Riwayat';

  return (
    <div className="space-y-6">
      {/* Period Selector & Quick Dashboard Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <CalendarDays className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Menampilkan ringkasan untuk</span>
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

      {/* Hero Executive Cashflow Panel */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
      >
        <div className="lg:col-span-7 flex flex-col justify-between space-y-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Saldo Bersih Periode</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                {metrics.activeDayCount} hari aktif
              </span>
              <span aria-hidden="true">·</span>
              <span
                className={`font-semibold ${
                  metrics.savingsRate >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                Rasio Tabungan {metrics.savingsRate}%
              </span>
            </div>

            <div
              className={`text-3xl sm:text-4xl font-extrabold font-display font-mono-tabular tracking-tight ${
                metrics.netBalance >= 0
                  ? 'text-slate-900 dark:text-white'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {maskAmount(formatIDR(metrics.netBalance), hideAmounts)}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400 pt-1">
              <span className="inline-flex items-center gap-1.5">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Hari ini masuk:{' '}
                <strong className="font-mono-tabular text-slate-900 dark:text-slate-100">
                  {maskAmount(formatIDR(metrics.todayIncome), hideAmounts)}
                </strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                Hari ini keluar:{' '}
                <strong className="font-mono-tabular text-slate-900 dark:text-slate-100">
                  {maskAmount(formatIDR(metrics.todayExpense), hideAmounts)}
                </strong>
              </span>
            </div>
          </div>

          {/* Quick Dashboard Actions */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
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

        {/* Cumulative Trajectory Mini Chart */}
        <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Lintasan Saldo Kumulatif
            </span>
            <span className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
              {dailySeries.length} titik hari
            </span>
          </div>

          <div className="h-36">
            {dailySeries.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-500 text-center px-4">
                Catat transaksi untuk melihat kurva pertumbuhan saldo harian Anda.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dailySeries}
                  margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="dashCumGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fill: axisColor, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(val: unknown) => [
                      maskAmount(formatIDR(Number(val) || 0), hideAmounts),
                      'Saldo Kumulatif',
                    ]}
                    contentStyle={{
                      backgroundColor: tooltipBg,
                      borderColor: tooltipBorder,
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#059669"
                    strokeWidth={2}
                    fill="url(#dashCumGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </motion.section>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Pemasukan</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-display font-mono-tabular text-emerald-600 dark:text-emerald-400">
            {maskAmount(`+ ${formatIDR(metrics.totalIncome)}`, hideAmounts)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            {metrics.incomeCount} transaksi masuk
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Pengeluaran</span>
            <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-display font-mono-tabular text-rose-600 dark:text-rose-400">
            {maskAmount(`- ${formatIDR(metrics.totalExpense)}`, hideAmounts)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            Rata-rata {maskAmount(formatCompactIDR(metrics.avgDailyExpense), hideAmounts)} / hari
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Rasio Belanja / Pemasukan</span>
            <PiggyBank className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-display font-mono-tabular text-slate-900 dark:text-slate-100">
            {metrics.expenseRatio}%
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                metrics.expenseRatio > 85
                  ? 'bg-rose-600'
                  : metrics.expenseRatio > 65
                  ? 'bg-amber-500'
                  : 'bg-emerald-600'
              }`}
              style={{ width: `${metrics.expenseRatio}%` }}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Pengeluaran Terbesar</span>
            <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          {metrics.topExpenseCategory ? (
            <>
              <div className="text-lg font-bold font-display text-slate-900 dark:text-slate-100 truncate">
                {metrics.topExpenseCategory.name}
              </div>
              <div className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                {maskAmount(formatIDR(metrics.topExpenseCategory.total), hideAmounts)}
              </div>
            </>
          ) : (
            <>
              <div className="text-lg font-bold font-display text-slate-400 dark:text-slate-500">
                Belum ada
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-500">
                Catat pengeluaran pertama Anda
              </div>
            </>
          )}
        </div>
      </div>

      {/* Simpanan & Rekening (GoPay, Bank, Tunai) Summary Strip */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold font-display text-slate-900 dark:text-slate-100">
                Simpanan &amp; Rekening
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Total saldo tersimpan:{' '}
                <strong className="font-mono-tabular text-slate-900 dark:text-slate-100">
                  {maskAmount(formatIDR(walletSummary.totalBalance), hideAmounts)}
                </strong>{' '}
                · {wallets.length} akun aktif
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {wallets.length >= 2 && (
              <button
                type="button"
                onClick={() => onQuickTransfer(wallets[0]?.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                Pindah Saldo
              </button>
            )}
            <button
              type="button"
              onClick={onNavigateWallets}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              Kelola di Aset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {walletSummary.items.map(({ wallet, currentBalance, txCount }) => (
            <div
              key={wallet.id}
              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: wallet.color }}
                >
                  <CategoryIcon icon={wallet.icon} className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {wallet.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {WALLET_KIND_LABELS[wallet.kind]} · {txCount}x
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p
                  className={`text-sm font-bold font-mono-tabular ${
                    currentBalance >= 0
                      ? 'text-slate-900 dark:text-slate-100'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {maskAmount(formatIDR(currentBalance), hideAmounts)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Main Analytics Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Daily Cashflow Chart with Mode Switcher */}
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold font-display text-slate-900 dark:text-slate-100">
                Aktivitas Arus Kas Harian
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Perbandingan uang masuk dan keluar harian secara dinamis
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setChartMode('bar')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  chartMode === 'bar'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Batang
              </button>
              <button
                type="button"
                onClick={() => setChartMode('trend')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  chartMode === 'trend'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Kurva Tren
              </button>
            </div>
          </div>

          <div className="h-72 mt-4">
            {dailySeries.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
                Belum ada transaksi pada periode ini.
              </div>
            ) : chartMode === 'bar' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dailySeries}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={gridColor}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: axisColor, fontSize: 11 }}
                    axisLine={{ stroke: gridColor }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) =>
                      hideAmounts
                        ? '•••'
                        : formatCompactIDR(Number(v)).replace('Rp ', '')
                    }
                    tick={{ fill: axisColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                  />
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [
                      maskAmount(formatIDR(Number(value) || 0), hideAmounts),
                      name === 'income' ? 'Pemasukan' : 'Pengeluaran',
                    ]}
                    labelFormatter={(label) => `Tanggal: ${label}`}
                    contentStyle={{
                      backgroundColor: tooltipBg,
                      borderColor: tooltipBorder,
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="income"
                    name="income"
                    fill="#059669"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="expense"
                    name="expense"
                    fill="#E11D48"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dailySeries}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="incArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E11D48" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#E11D48" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={gridColor}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: axisColor, fontSize: 11 }}
                    axisLine={{ stroke: gridColor }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) =>
                      hideAmounts
                        ? '•••'
                        : formatCompactIDR(Number(v)).replace('Rp ', '')
                    }
                    tick={{ fill: axisColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                  />
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [
                      maskAmount(formatIDR(Number(value) || 0), hideAmounts),
                      name === 'income' ? 'Pemasukan' : 'Pengeluaran',
                    ]}
                    labelFormatter={(label) => `Tanggal: ${label}`}
                    contentStyle={{
                      backgroundColor: tooltipBg,
                      borderColor: tooltipBorder,
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="#059669"
                    strokeWidth={2}
                    fill="url(#incArea)"
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    stroke="#E11D48"
                    strokeWidth={2}
                    fill="url(#expArea)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Category Breakdown + Payment Method Mix */}
        <div className="xl:col-span-5 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-base font-semibold font-display text-slate-900 dark:text-slate-100">
                  Komposisi Kategori
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Porsi pengeluaran &amp; pemasukan
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setBreakdownType('expense')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    breakdownType === 'expense'
                      ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Keluar
                </button>
                <button
                  type="button"
                  onClick={() => setBreakdownType('income')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    breakdownType === 'income'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Masuk
                </button>
              </div>
            </div>

            {categoryBreakdown.items.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                Belum ada data {breakdownType === 'expense' ? 'pengeluaran' : 'pemasukan'}.
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                <div className="sm:col-span-5 h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryBreakdown.items}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={58}
                        paddingAngle={2}
                      >
                        {categoryBreakdown.items.map((entry) => (
                          <Cell key={entry.id} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: unknown) =>
                          maskAmount(formatIDR(Number(value) || 0), hideAmounts)
                        }
                        contentStyle={{
                          backgroundColor: tooltipBg,
                          borderColor: tooltipBorder,
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="sm:col-span-7 space-y-2.5 max-h-40 overflow-y-auto pr-1">
                  {categoryBreakdown.items.slice(0, 5).map((item) => (
                    <div key={item.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 truncate">
                          <span
                            className="w-4 h-4 rounded-xs flex items-center justify-center text-white shrink-0"
                            style={{ backgroundColor: item.color }}
                          >
                            <CategoryIcon icon={item.icon} className="w-2.5 h-2.5" />
                          </span>
                          <span className="truncate">{item.name}</span>
                        </span>
                        <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                          {item.percent}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${item.percent}%`,
                            backgroundColor: item.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Payment Method Distribution */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold font-display text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                Metode Pembayaran
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Volume transaksi
              </span>
            </div>

            {paymentMethodStats.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-2">
                Statistik metode pembayaran akan muncul setelah Anda mencatat transaksi.
              </p>
            ) : (
              <div className="space-y-2.5">
                {paymentMethodStats.map((pm) => (
                  <div
                    key={pm.method}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {pm.method} · {pm.count}x
                    </span>
                    <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                      {maskAmount(formatIDR(pm.total), hideAmounts)} ({pm.percent}%)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Monthly Category Budgeting Progress Section */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold font-display text-slate-900 dark:text-slate-100">
                Anggaran Bulanan per Kategori
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Realisasi belanja bulan {monthlyBudgetReport.monthLabel} dibandingkan batas anggaran
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
          <div className="py-8 text-center space-y-3">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Belum ada batas anggaran bulanan yang ditetapkan
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Tetapkan batas pengeluaran bulanan untuk setiap kategori seperti Makanan, Transportasi, atau Belanja agar pengeluaran lebih terkendali.
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
          <div className="space-y-5">
            {/* Overall Budget Summary */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  Total Pemakaian Anggaran Bulan Ini ({monthlyBudgetReport.items.length} kategori)
                </span>
                <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                  {maskAmount(formatIDR(monthlyBudgetReport.totalSpent), hideAmounts)} /{' '}
                  {maskAmount(formatIDR(monthlyBudgetReport.totalBudget), hideAmounts)} ({monthlyBudgetReport.overallPercent}%)
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

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
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

            {/* Per-Category Budget Progress Bars */}
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
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {item.name}
                          </p>
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

      {/* Recent Transactions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold font-display text-slate-900 dark:text-slate-100">
              Transaksi Terbaru
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              8 catatan pemasukan &amp; pengeluaran terakhir beserta catatan detail
            </p>
          </div>
          <button
            type="button"
            onClick={onViewAllTransactions}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
          >
            Lihat Semua di Aset
          </button>
        </div>

        <TransactionTable
          transactions={transactions}
          categories={categories}
          wallets={wallets}
          onEdit={onEditTx}
          onDelete={onDeleteTx}
          onAddNew={() => onQuickAdd('expense')}
          compact
          hideAmounts={hideAmounts}
        />
      </div>

      <BudgetModal
        isOpen={budgetModalOpen}
        onClose={() => setBudgetModalOpen(false)}
        categories={categories}
        onSaveBudgets={onSaveBudgets}
      />
    </div>
  );
}
