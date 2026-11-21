import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Category, Transaction, WalletAccount } from '../types/finance';
import { formatDateID, formatIDR, maskAmount } from '../lib/formatters';
import { CategoryIcon } from './CategoryIcon';

interface TransactionTableProps {
  transactions: Transaction[];
  categories: Category[];
  wallets?: WalletAccount[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onAddNew: () => void;
  compact?: boolean;
  hideAmounts?: boolean;
}

export function TransactionTable({
  transactions,
  categories,
  wallets = [],
  onEdit,
  onDelete,
  onAddNew,
  compact = false,
  hideAmounts = false,
}: TransactionTableProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<
    'all' | 'income' | 'expense' | 'transfer'
  >('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [walletFilter, setWalletFilter] = useState('all');

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...transactions]
      .filter((tx) => {
        if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
        if (categoryFilter !== 'all' && tx.categoryId !== categoryFilter) {
          return false;
        }
        if (
          walletFilter !== 'all' &&
          tx.walletId !== walletFilter &&
          tx.toWalletId !== walletFilter
        ) {
          return false;
        }
        if (q) {
          const matchesNote = (tx.note || '').toLowerCase().includes(q);
          const matchesCat = tx.categoryName.toLowerCase().includes(q);
          const matchesMethod = (tx.paymentMethod || '').toLowerCase().includes(q);
          const matchesWallet = (tx.walletName || '').toLowerCase().includes(q);
          const matchesToWallet = (tx.toWalletName || '').toLowerCase().includes(q);
          const matchesDate = tx.date.includes(q);
          return (
            matchesNote ||
            matchesCat ||
            matchesMethod ||
            matchesWallet ||
            matchesToWallet ||
            matchesDate
          );
        }
        return true;
      })
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  }, [transactions, search, typeFilter, categoryFilter, walletFilter]);

  const visibleRows = compact ? filtered.slice(0, 8) : filtered;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Toolbar */}
      {!compact && (
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari catatan, kategori, simpanan (GoPay/Bank)..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(['all', 'expense', 'income', 'transfer'] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setTypeFilter(val)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    typeFilter === val
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {val === 'all'
                    ? 'Semua'
                    : val === 'expense'
                    ? 'Pengeluaran'
                    : val === 'income'
                    ? 'Pemasukan'
                    : 'Transfer'}
                </button>
              ))}
            </div>

            {wallets.length > 0 && (
              <select
                value={walletFilter}
                onChange={(e) => setWalletFilter(e.target.value)}
                aria-label="Filter Simpanan"
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Semua Simpanan</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter Kategori"
              className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Semua Kategori</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Empty State */}
      {visibleRows.length === 0 ? (
        <div className="p-10 text-center space-y-3">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {transactions.length === 0
              ? 'Belum ada transaksi tercatat'
              : 'Tidak ada transaksi yang cocok dengan filter'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {transactions.length === 0
              ? 'Mulai catat pemasukan dan pengeluaran harian Anda beserta catatan detail agar arus kas lebih terpantau.'
              : 'Ubah kata kunci pencarian atau filter kategori/simpanan untuk melihat catatan lainnya.'}
          </p>
          {transactions.length === 0 && (
            <button
              type="button"
              onClick={onAddNew}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Catat Transaksi Pertama
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {visibleRows.map((tx) => {
            const cat = categoryMap.get(tx.categoryId);
            const isIncome = tx.type === 'income';
            const isTransfer = tx.type === 'transfer';

            const badgeColor = isTransfer
              ? '#0284C7'
              : cat?.color || (isIncome ? '#059669' : '#E11D48');

            const rowTitle = isTransfer
              ? `Transfer: ${tx.walletName || 'Simpanan'} → ${tx.toWalletName || 'Tujuan'}`
              : tx.categoryName;

            return (
              <div
                key={tx.id}
                className="px-4 py-3.5 flex items-start sm:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0 mt-0.5 sm:mt-0"
                    style={{ backgroundColor: badgeColor }}
                  >
                    {isTransfer ? (
                      <ArrowLeftRight className="w-4 h-4" />
                    ) : (
                      <CategoryIcon icon={cat?.icon || 'tag'} className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                      <span className="truncate">{rowTitle}</span>
                    </div>

                    {tx.note && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug break-words">
                        {tx.note}
                      </p>
                    )}

                    {/* Clean unboxed inline metadata (Zero-Pill discipline) */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1 font-medium">
                        {isTransfer ? (
                          <ArrowLeftRight className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                        ) : isIncome ? (
                          <ArrowDownLeft className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <ArrowUpRight className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                        )}
                        {isTransfer
                          ? 'Pindah Saldo'
                          : isIncome
                          ? 'Pemasukan'
                          : 'Pengeluaran'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {formatDateID(tx.date)}, {tx.time}
                      </span>
                      {!isTransfer && tx.walletName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-slate-600 dark:text-slate-300">
                            {tx.walletName}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{tx.paymentMethod || 'Tunai'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div
                      className={`text-sm sm:text-base font-semibold font-mono-tabular ${
                        isTransfer
                          ? 'text-sky-600 dark:text-sky-400'
                          : isIncome
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {maskAmount(
                        isTransfer
                          ? formatIDR(tx.amount)
                          : `${isIncome ? '+' : '-'} ${formatIDR(tx.amount)}`,
                        hideAmounts
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(tx)}
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      aria-label={`Edit transaksi ${tx.categoryName}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(tx)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      aria-label={`Hapus transaksi ${tx.categoryName}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
