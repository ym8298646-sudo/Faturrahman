export type TransactionType = 'income' | 'expense' | 'transfer';

export type WalletKind = 'cash' | 'ewallet' | 'bank' | 'savings';

export type PaymentMethod =
  | 'Tunai'
  | 'Transfer Bank'
  | 'QRIS / E-Wallet'
  | 'Kartu Debit/Kredit';

export type PeriodFilter = '7d' | '30d' | 'month' | 'all';

export type NavTab =
  | 'overview'
  | 'aset'
  | 'analytics'
  | 'settings';

export interface Category {
  id: string;
  userId: string;
  name: string;
  type: 'income' | 'expense';
  color: string;
  icon: string;
  isDefault?: boolean;
  monthlyBudget?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WalletAccount {
  id: string;
  userId: string;
  name: string;
  kind: WalletKind;
  initialBalance: number;
  color: string;
  icon: string;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  categoryName: string;
  walletId?: string;
  walletName?: string;
  toWalletId?: string;
  toWalletName?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  note: string;
  paymentMethod?: PaymentMethod;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserPreferences {
  darkMode: boolean;
  reminderEnabled: boolean;
  reminderTime: string; // HH:mm
  reminderMessage: string;
  currency: 'IDR' | 'USD';
}

export interface BiometricSettings {
  enabled: boolean;
  credentialId: string | null;
  pinHash: string | null;
  lockOnLaunch: boolean;
  autoLockMinutes?: number;
  lockOnHide?: boolean;
}

export const BLUEPRINT_LIMITS = {
  MAX_ID_LENGTH: 128,
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  MAX_CATEGORY_NAME: 48,
  MAX_WALLET_NAME: 48,
  MAX_NOTE_LENGTH: 500,
  MAX_REMINDER_MESSAGE: 160,
  MAX_AMOUNT: 1000000000000,
  PAYMENT_METHODS: [
    'Tunai',
    'Transfer Bank',
    'QRIS / E-Wallet',
    'Kartu Debit/Kredit',
  ] as PaymentMethod[],
} as const;
