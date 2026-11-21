import { Transaction, WalletAccount } from '../types/finance';

export interface WalletBalanceSummary {
  wallet: WalletAccount;
  currentBalance: number;
  totalIn: number;
  totalOut: number;
  txCount: number;
}

export function computeWalletBalances(
  wallets: WalletAccount[],
  transactions: Transaction[]
): {
  items: WalletBalanceSummary[];
  totalBalance: number;
} {
  const stats = new Map<
    string,
    { totalIn: number; totalOut: number; txCount: number }
  >();

  for (const w of wallets) {
    stats.set(w.id, { totalIn: 0, totalOut: 0, txCount: 0 });
  }

  for (const tx of transactions) {
    if (tx.type === 'income' && tx.walletId && stats.has(tx.walletId)) {
      const s = stats.get(tx.walletId)!;
      s.totalIn += tx.amount;
      s.txCount += 1;
    } else if (tx.type === 'expense' && tx.walletId && stats.has(tx.walletId)) {
      const s = stats.get(tx.walletId)!;
      s.totalOut += tx.amount;
      s.txCount += 1;
    } else if (tx.type === 'transfer') {
      if (tx.walletId && stats.has(tx.walletId)) {
        const s = stats.get(tx.walletId)!;
        s.totalOut += tx.amount;
        s.txCount += 1;
      }
      if (tx.toWalletId && stats.has(tx.toWalletId)) {
        const s = stats.get(tx.toWalletId)!;
        s.totalIn += tx.amount;
        s.txCount += 1;
      }
    }
  }

  const items: WalletBalanceSummary[] = wallets.map((wallet) => {
    const s = stats.get(wallet.id) || { totalIn: 0, totalOut: 0, txCount: 0 };
    const currentBalance = (wallet.initialBalance || 0) + s.totalIn - s.totalOut;
    return {
      wallet,
      currentBalance,
      totalIn: s.totalIn,
      totalOut: s.totalOut,
      txCount: s.txCount,
    };
  });

  const totalBalance = items.reduce((sum, i) => sum + i.currentBalance, 0);

  return { items, totalBalance };
}
