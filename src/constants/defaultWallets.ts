import { WalletAccount, WalletKind } from '../types/finance';

export const WALLET_KIND_LABELS: Record<WalletKind, string> = {
  cash: 'Tunai',
  ewallet: 'E-Wallet',
  bank: 'Rekening Bank',
  savings: 'Tabungan',
};

export const WALLET_TEMPLATES: Array<{
  name: string;
  kind: WalletKind;
  color: string;
  icon: string;
}> = [
  { name: 'GoPay', kind: 'ewallet', color: '#0284C7', icon: 'smartphone' },
  { name: 'OVO', kind: 'ewallet', color: '#7C3AED', icon: 'smartphone' },
  { name: 'DANA', kind: 'ewallet', color: '#0EA5E9', icon: 'smartphone' },
  { name: 'ShopeePay', kind: 'ewallet', color: '#EA580C', icon: 'smartphone' },
  { name: 'Bank BCA', kind: 'bank', color: '#4F46E5', icon: 'landmark' },
  { name: 'Bank Mandiri', kind: 'bank', color: '#0F172A', icon: 'landmark' },
  { name: 'Bank BRI', kind: 'bank', color: '#1D4ED8', icon: 'landmark' },
  { name: 'Bank BNI', kind: 'bank', color: '#D97706', icon: 'landmark' },
  { name: 'SeaBank', kind: 'bank', color: '#EA580C', icon: 'landmark' },
  { name: 'Bank Jago', kind: 'bank', color: '#D97706', icon: 'landmark' },
  { name: 'Dompet Tunai', kind: 'cash', color: '#475569', icon: 'wallet' },
  { name: 'Tabungan Darurat', kind: 'savings', color: '#059669', icon: 'piggy-bank' },
];

export const WALLET_ICON_OPTIONS = [
  { id: 'wallet', label: 'Dompet' },
  { id: 'smartphone', label: 'E-Wallet' },
  { id: 'landmark', label: 'Bank' },
  { id: 'piggy-bank', label: 'Tabungan' },
];

export function createDefaultWallets(userId: string): WalletAccount[] {
  return [
    {
      id: 'wal_tunai',
      userId,
      name: 'Dompet Tunai',
      kind: 'cash',
      initialBalance: 0,
      color: '#475569',
      icon: 'wallet',
      isDefault: true,
    },
    {
      id: 'wal_gopay',
      userId,
      name: 'GoPay',
      kind: 'ewallet',
      initialBalance: 0,
      color: '#0284C7',
      icon: 'smartphone',
      isDefault: true,
    },
    {
      id: 'wal_bca',
      userId,
      name: 'Bank BCA',
      kind: 'bank',
      initialBalance: 0,
      color: '#4F46E5',
      icon: 'landmark',
      isDefault: true,
    },
  ];
}
