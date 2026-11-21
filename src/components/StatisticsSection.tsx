import { useMemo, useState } from 'react';
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
  CreditCard,
  FileDown,
  Landmark,
  Target,
  TrendingUp,
} from 'lucide-react';
import { WALLET_KIND_LABELS } from '../constants/defaultWallets';
import {
  Category,
  PeriodFilter,
  Transaction,
  WalletAccount,
  WalletKind,
} from '../types/finance';
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
import { CategoryIcon } from './CategoryIcon';

interface StatisticsSectionProps {
  transactions: Transaction[];
  categories: Category[];
  wallets?: WalletAccount[];
  period: PeriodFilter;
  onPeriodChange: (period: PeriodFilter) => void;
  accountLabel: string;
  darkMode: boolean;
  hideAmounts?: boolean;
}

const PERIOD_OPTIONS: Array<{ value: PeriodFilter; label: string }> = [
  { value: '7d', label: '7 Hari' },
  { value: '30d', label: '30 Hari' },
  { value: 'month', label: 'Bulan Ini' },
  { value: 'all', label: 'Semua' },
];

const WALLET_KIND_COLORS: Record<WalletKind, string> = {
  bank: '#0284C7',
  ewallet: '#059669',
  cash: '#D97706',
  savings: '#7C3AED',
};

export function StatisticsSection({
  transactions,
  categories,
  wallets = [],
  period,
  onPeriodChange,
  accountLabel,
  darkMode,
  hideAmounts = false,
}: StatisticsSectionProps) {
  const [cashflowChartMode, setCashflowChartMode] = useState<'bar' | 'trend'>('bar');
  const [breakdownType, setBreakdownType] = useState<'expense' | 'income'>('expense');
  const [pdfTypeFilter, setPdfTypeFilter] = useState<
    'all' | 'income' | 'expense' | 'transfer'
  >('all');

  const todayISO = getTodayISO();
  const currentMonthPrefix = todayISO.slice(0, 7);

  const periodTransactions = useMemo(
    () => filterTransactionsByPeriod(transactions, period, todayISO),
    [transactions, period, todayISO]
  );

  // 1. Unified Income & Expense Recap
  const summaryStats = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    let transferCount = 0;
    let transferVolume = 0;

    for (const tx of periodTransactions) {
      if (tx.type === 'income') {
        totalIncome += tx.amount;
        incomeCount += 1;
      } else if (tx.type === 'expense') {
        totalExpense += tx.amount;
        expenseCount += 1;
      } else if (tx.type === 'transfer') {
        transferCount += 1;
        transferVolume += tx.amount;
      }
    }

    const netCashflow = totalIncome - totalExpense;
    const savingsRate =
      totalIncome > 0
        ? Math.max(-100, Math.min(100, Math.round((netCashflow / totalIncome) * 100)))
        : 0;

    return {
      totalIncome,
      totalExpense,
      incomeCount,
      expenseCount,
      transferCount,
      transferVolume,
      netCashflow,
      savingsRate,
    };
  }, [periodTransactions]);

  // 2. Daily Cashflow Series (Bar + Cumulative Trend)
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
    let cumulative = 0;
    return sorted.map((item) => {
      cumulative += item.net;
      return {
        ...item,
        cumulative,
      };
    });
  }, [periodTransactions]);

  // 3. Asset & Savings Recap (All-Time Balances + Period Inflows/Outflows)
  const assetAnalytics = useMemo(() => {
    const overall = computeWalletBalances(wallets, transactions);

    const periodFlows = new Map<
      string,
      { periodIn: number; periodOut: number; periodTxCount: number }
    >();
    for (const w of wallets) {
      periodFlows.set(w.id, { periodIn: 0, periodOut: 0, periodTxCount: 0 });
    }
    for (const tx of periodTransactions) {
      if (tx.type === 'income' && tx.walletId && periodFlows.has(tx.walletId)) {
        const f = periodFlows.get(tx.walletId)!;
        f.periodIn += tx.amount;
        f.periodTxCount += 1;
      } else if (
        tx.type === 'expense' &&
        tx.walletId &&
        periodFlows.has(tx.walletId)
      ) {
        const f = periodFlows.get(tx.walletId)!;
        f.periodOut += tx.amount;
        f.periodTxCount += 1;
      } else if (tx.type === 'transfer') {
        if (tx.walletId && periodFlows.has(tx.walletId)) {
          const f = periodFlows.get(tx.walletId)!;
          f.periodOut += tx.amount;
          f.periodTxCount += 1;
        }
        if (tx.toWalletId && periodFlows.has(tx.toWalletId)) {
          const f = periodFlows.get(tx.toWalletId)!;
          f.periodIn += tx.amount;
          f.periodTxCount += 1;
        }
      }
    }

    const positiveTotal = overall.items.reduce(
      (sum, i) => sum + Math.max(0, i.currentBalance),
      0
    );

    const walletItems = overall.items
      .map((item) => {
        const flow = periodFlows.get(item.wallet.id) || {
          periodIn: 0,
          periodOut: 0,
          periodTxCount: 0,
        };
        const positiveBal = Math.max(0, item.currentBalance);
        const sharePercent =
          positiveTotal > 0 ? Math.round((positiveBal / positiveTotal) * 100) : 0;

        return {
          ...item,
          ...flow,
          positiveBal,
          sharePercent,
        };
      })
      .sort((a, b) => b.currentBalance - a.currentBalance);

    const chartItems = walletItems.filter((i) => i.positiveBal > 0);

    // Group by Asset Class (Bank, E-Wallet, Tunai, Tabungan)
    const kindTotals = new Map<
      WalletKind,
      { kind: WalletKind; label: string; balance: number; count: number; color: string }
    >();
    for (const item of overall.items) {
      const k = item.wallet.kind;
      const existing = kindTotals.get(k) || {
        kind: k,
        label: WALLET_KIND_LABELS[k],
        balance: 0,
        count: 0,
        color: WALLET_KIND_COLORS[k],
      };
      existing.balance += item.currentBalance;
      existing.count += 1;
      kindTotals.set(k, existing);
    }

    const kindBreakdown = Array.from(kindTotals.values())
      .sort((a, b) => b.balance - a.balance)
      .map((k) => ({
        ...k,
        percent:
          positiveTotal > 0
            ? Math.round((Math.max(0, k.balance) / positiveTotal) * 100)
            : 0,
      }));

    return {
      totalBalance: overall.totalBalance,
      walletItems,
      chartItems,
      kindBreakdown,
    };
  }, [wallets, transactions, periodTransactions]);

  // 4. Category Breakdown
  const categoryColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.id, c.color);
    }
    return map;
  }, [categories]);

  const categoryBreakdown = useMemo(() => {
    const filtered = periodTransactions.filter((tx) => tx.type === breakdownType);
    const total = filtered.reduce((sum, tx) => sum + tx.amount, 0);
    const map = new Map<
      string,
      { id: string; name: string; value: number; color: string; count: number }
    >();

    for (const tx of filtered) {
      const existing = map.get(tx.categoryId) || {
        id: tx.categoryId,
        name: tx.categoryName,
        value: 0,
        color:
          categoryColorMap.get(tx.categoryId) ||
          (breakdownType === 'income' ? '#059669' : '#E11D48'),
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
  }, [periodTransactions, breakdownType, categoryColorMap]);

  // 5. Payment Method Distribution
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

  // 6. Monthly Budget Health Recap
  const budgetRecap = useMemo(() => {
    const spentMap = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.type === 'expense' && tx.date.startsWith(currentMonthPrefix)) {
        spentMap.set(tx.categoryId, (spentMap.get(tx.categoryId) || 0) + tx.amount);
      }
    }

    const budgeted = categories
      .filter((c) => c.type === 'expense' && (c.monthlyBudget || 0) > 0)
      .map((c) => {
        const budget = c.monthlyBudget || 0;
        const spent = spentMap.get(c.id) || 0;
        const percent = budget > 0 ? Math.round((spent / budget) * 100) : 0;
        return {
          id: c.id,
          name: c.name,
          color: c.color,
          budget,
          spent,
          percent,
        };
      })
      .sort((a, b) => b.percent - a.percent);

    const totalBudget = budgeted.reduce((s, b) => s + b.budget, 0);
    const totalSpent = budgeted.reduce((s, b) => s + b.spent, 0);
    const overallPercent =
      totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    return {
      items: budgeted,
      totalBudget,
      totalSpent,
      overallPercent,
    };
  }, [transactions, categories, currentMonthPrefix]);

  const handleExportPDF = () => {
    const exportList =
      pdfTypeFilter === 'all'
        ? periodTransactions
        : periodTransactions.filter((t) => t.type === pdfTypeFilter);
    exportTransactionsToPDF({
      transactions: exportList,
      allTransactions: transactions,
      wallets,
      period,
      typeFilter: pdfTypeFilter,
      accountLabel,
    });
  };

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
      {/* Period & PDF Export Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
            Periode Statistik:
          </span>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onPeriodChange(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  period === opt.value
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pdfTypeFilter}
            onChange={(e) =>
              setPdfTypeFilter(
                e.target.value as 'all' | 'income' | 'expense' | 'transfer'
              )
            }
            aria-label="Jenis Laporan PDF"
            className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Semua Aktivitas &amp; Aset</option>
            <option value="expense">Hanya Pengeluaran</option>
            <option value="income">Hanya Pemasukan</option>
            <option value="transfer">Hanya Transfer Saldo</option>
          </select>
          <button
            type="button"
            onClick={handleExportPDF}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <FileDown className="w-4 h-4" />
            Unduh Laporan PDF
          </button>
        </div>
      </div>

      {/* Unified 4-Column Financial & Asset Recap KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Pendapatan ({periodLabel})</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono-tabular text-emerald-600 dark:text-emerald-400">
            {maskAmount(`+ ${formatIDR(summaryStats.totalIncome)}`, hideAmounts)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            {summaryStats.incomeCount} transaksi pemasukan
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Pengeluaran ({periodLabel})</span>
            <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono-tabular text-rose-600 dark:text-rose-400">
            {maskAmount(`- ${formatIDR(summaryStats.totalExpense)}`, hideAmounts)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            {summaryStats.expenseCount} transaksi pengeluaran
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Arus Kas Bersih Periode</span>
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div
            className={`text-2xl font-bold font-mono-tabular ${
              summaryStats.netCashflow >= 0
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {maskAmount(formatIDR(summaryStats.netCashflow), hideAmounts)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
            Rasio tabungan {summaryStats.savingsRate}% ·{' '}
            {summaryStats.transferCount} mutasi transfer
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Aset &amp; Simpanan Aktif</span>
            <Landmark className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-mono-tabular text-slate-900 dark:text-slate-100">
            {maskAmount(formatIDR(assetAnalytics.totalBalance), hideAmounts)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Gabungan dari {wallets.length} rekening &amp; simpanan
          </p>
        </div>
      </div>

      {/* Row 1: Daily Income/Expense Chart + Asset Allocation Donut */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Daily Cashflow Bar / Trend Chart */}
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold font-display text-slate-900 dark:text-slate-100">
                Statistik Pendapatan &amp; Pengeluaran Harian
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Perbandingan arus kas masuk, keluar, dan akumulasi saldo bersih harian
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setCashflowChartMode('bar')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  cashflowChartMode === 'bar'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Batang Harian
              </button>
              <button
                type="button"
                onClick={() => setCashflowChartMode('trend')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  cashflowChartMode === 'trend'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Tren Kumulatif
              </button>
            </div>
          </div>

          <div className="h-72 mt-4">
            {dailySeries.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
                Belum ada data transaksi pada periode ini untuk ditampilkan.
              </div>
            ) : cashflowChartMode === 'bar' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
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
                      name === 'income' ? 'Pendapatan' : 'Pengeluaran',
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
                <AreaChart data={dailySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="statCumGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
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
                    formatter={(value: unknown) => [
                      maskAmount(formatIDR(Number(value) || 0), hideAmounts),
                      'Akumulasi Saldo Bersih',
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
                    dataKey="cumulative"
                    stroke="#059669"
                    strokeWidth={2}
                    fill="url(#statCumGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Asset & Savings Composition Chart */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold font-display text-slate-900 dark:text-slate-100">
              Komposisi Aset &amp; Simpanan
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Proporsi kekayaan per simpanan dan jenis rekening (Bank, E-Wallet, Tunai, Tabungan)
            </p>
          </div>

          {assetAnalytics.walletItems.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500 text-center px-4">
              Tambahkan akun simpanan di menu Aset untuk melihat sebaran aset Anda.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {assetAnalytics.chartItems.length > 0 ? (
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={assetAnalytics.chartItems.map((i) => ({
                          id: i.wallet.id,
                          name: i.wallet.name,
                          value: i.positiveBal,
                          color: i.wallet.color,
                        }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={66}
                        paddingAngle={2}
                      >
                        {assetAnalytics.chartItems.map((entry) => (
                          <Cell key={entry.wallet.id} fill={entry.wallet.color} />
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
              ) : (
                <div className="h-24 flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                  Seluruh simpanan saat ini bersaldo Rp 0 atau minus.
                </div>
              )}

              {/* Grouped by Kind Summary */}
              <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Rekapitulasi Menurut Jenis Aset
                </p>
                {assetAnalytics.kindBreakdown.map((k) => (
                  <div key={k.kind} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {k.label} · {k.count} akun
                      </span>
                      <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                        {maskAmount(formatIDR(k.balance), hideAmounts)} ({k.percent}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${k.percent}%`,
                          backgroundColor: k.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Detailed Wallet Recap Table + Category Breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Detailed Asset & Wallet Recap */}
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold font-display text-slate-900 dark:text-slate-100">
                Rekapitulasi Saldo &amp; Mutasi Simpanan
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Rincian saldo saat ini beserta arus masuk &amp; keluar pada periode {periodLabel}
              </p>
            </div>
            <span className="text-xs font-mono-tabular font-semibold text-slate-700 dark:text-slate-300">
              Total: {maskAmount(formatIDR(assetAnalytics.totalBalance), hideAmounts)}
            </span>
          </div>

          {assetAnalytics.walletItems.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center">
              Belum ada akun simpanan terdaftar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-3 font-medium">Simpanan / Rekening</th>
                    <th className="py-2.5 px-3 font-medium text-right">Masuk (Periode)</th>
                    <th className="py-2.5 px-3 font-medium text-right">Keluar (Periode)</th>
                    <th className="py-2.5 pl-3 font-medium text-right">Saldo Saat Ini</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {assetAnalytics.walletItems.map((item) => (
                    <tr key={item.wallet.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                            style={{ backgroundColor: item.wallet.color }}
                          >
                            <CategoryIcon icon={item.wallet.icon} className="w-3.5 h-3.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {item.wallet.name}
                            </p>
                            <p className="text-slate-500 dark:text-slate-400">
                              {WALLET_KIND_LABELS[item.wallet.kind]} · {item.sharePercent}% aset
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {maskAmount(`+${formatIDR(item.periodIn)}`, hideAmounts)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-rose-600 dark:text-rose-400 whitespace-nowrap">
                        {maskAmount(`-${formatIDR(item.periodOut)}`, hideAmounts)}
                      </td>
                      <td
                        className={`py-3 pl-3 text-right font-mono-tabular font-bold whitespace-nowrap ${
                          item.currentBalance >= 0
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {maskAmount(formatIDR(item.currentBalance), hideAmounts)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Category Breakdown Donut + List */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold font-display text-slate-900 dark:text-slate-100">
                Distribusi Kategori
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Proporsi pendapatan &amp; pengeluaran per kategori
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
            <div className="h-72 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
              Belum ada data {breakdownType === 'expense' ? 'pengeluaran' : 'pendapatan'}.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryBreakdown.items}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={72}
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

              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {categoryBreakdown.items.map((item) => (
                  <div key={item.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[55%]">
                        {item.name} · {item.count}x
                      </span>
                      <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                        {maskAmount(formatIDR(item.value), hideAmounts)} ({item.percent}%)
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
      </div>

      {/* Row 3: Payment Method Mix & Monthly Budget Health Recap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold font-display text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              Statistik Metode Pembayaran
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {periodLabel}
            </span>
          </div>

          {paymentMethodStats.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-3">
              Belum ada aktivitas transaksi pada periode ini.
            </p>
          ) : (
            <div className="space-y-2.5">
              {paymentMethodStats.map((pm) => (
                <div
                  key={pm.method}
                  className="flex items-center justify-between text-xs gap-2"
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

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold font-display text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Rekap Realisasi Anggaran Bulan Ini
            </h3>
            <span className="text-xs font-mono-tabular font-semibold text-slate-700 dark:text-slate-300">
              {budgetRecap.overallPercent}% terpakai
            </span>
          </div>

          {budgetRecap.items.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-3">
              Belum ada batas anggaran bulanan yang ditetapkan pada kategori pengeluaran.
            </p>
          ) : (
            <div className="space-y-2.5">
              {budgetRecap.items.slice(0, 5).map((item) => (
                <div key={item.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                      {item.name}
                    </span>
                    <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                      {maskAmount(formatIDR(item.spent), hideAmounts)} /{' '}
                      {maskAmount(formatIDR(item.budget), hideAmounts)} ({item.percent}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        item.percent >= 100
                          ? 'bg-rose-600'
                          : item.percent >= 75
                          ? 'bg-amber-500'
                          : 'bg-emerald-600'
                      }`}
                      style={{ width: `${Math.min(100, item.percent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
