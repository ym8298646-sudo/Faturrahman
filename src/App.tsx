import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { motion } from 'motion/react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  BarChart3,
  Bell,
  Calculator,
  Cloud,
  Eye,
  EyeOff,
  Landmark,
  LayoutDashboard,
  Lock,
  Menu,
  Moon,
  Plus,
  Settings,
  Sun,
  Wallet,
  X,
} from 'lucide-react';
import { createDefaultCategories } from './constants/defaultCategories';
import { createDefaultWallets } from './constants/defaultWallets';
import {
  auth,
  db,
  deleteCategoryInCloud,
  deleteTransactionInCloud,
  deleteWalletInCloud,
  ensureUserProfile,
  handleFirestoreError,
  OperationType,
  saveCategoryBudgetsInCloud,
  savePreferencesToCloud,
  signInWithGooglePopup,
  signOutUser,
  syncLocalDataToCloud,
  upsertCategoryInCloud,
  upsertTransactionInCloud,
  upsertWalletInCloud,
} from './lib/firebase';
import { getCurrentTimeHHMM, getTodayISO } from './lib/formatters';
import {
  readEncryptedStorage,
  wipeLocalFinancialVault,
  writeEncryptedStorage,
} from './lib/localVault';
import {
  BiometricSettings,
  Category,
  NavTab,
  PeriodFilter,
  Transaction,
  TransactionType,
  UserPreferences,
  WalletAccount,
} from './types/finance';
import { AsetSubSection, AsetView } from './components/AsetView';
import { CalculatorDrawer } from './components/CalculatorDrawer';
import { CategoryManager } from './components/CategoryManager';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LockScreen } from './components/LockScreen';
import { SettingsView } from './components/SettingsView';
import { StatisticsSection } from './components/StatisticsSection';
import { TransactionModal } from './components/TransactionModal';

const STORAGE_KEYS = {
  TRANSACTIONS: 'kasharian_transactions_v1',
  CATEGORIES: 'kasharian_categories_v1',
  WALLETS: 'kasharian_wallets_v1',
  PREFERENCES: 'kasharian_preferences_v1',
  BIOMETRIC: 'kasharian_biometric_v1',
  PRIVACY_MASK: 'kasharian_privacy_mask_v1',
  LAST_REMINDER_DATE: 'kasharian_last_reminder_date_v1',
};

const DEFAULT_PREFERENCES: UserPreferences = {
  darkMode: false,
  reminderEnabled: true,
  reminderTime: '20:00',
  reminderMessage: 'Jangan lupa catat pemasukan dan pengeluaran hari ini di KasHarian.',
  currency: 'IDR',
};

const DEFAULT_BIOMETRIC: BiometricSettings = {
  enabled: false,
  credentialId: null,
  pinHash: null,
  lockOnLaunch: false,
  autoLockMinutes: 5,
  lockOnHide: false,
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function KasHarianApp() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [asetSection, setAsetSection] = useState<AsetSubSection>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodFilter>('30d');

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [cloudBannerMsg, setCloudBannerMsg] = useState<string | null>(null);

  const [vaultReady, setVaultReady] = useState(false);
  const [localVaultEncrypted, setLocalVaultEncrypted] = useState(false);
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>([]);
  const [localCategories, setLocalCategories] = useState<Category[]>(() =>
    createDefaultCategories('local')
  );
  const [localWallets, setLocalWallets] = useState<WalletAccount[]>(() =>
    createDefaultWallets('local')
  );
  const [cloudTransactions, setCloudTransactions] = useState<Transaction[]>([]);
  const [cloudCategories, setCloudCategories] = useState<Category[]>([]);
  const [cloudWallets, setCloudWallets] = useState<WalletAccount[]>([]);

  const [preferences, setPreferences] = useState<UserPreferences>(() =>
    readStorage<UserPreferences>(STORAGE_KEYS.PREFERENCES, DEFAULT_PREFERENCES)
  );
  const [biometric, setBiometric] = useState<BiometricSettings>(() =>
    readStorage<BiometricSettings>(STORAGE_KEYS.BIOMETRIC, DEFAULT_BIOMETRIC)
  );
  const [hideAmounts, setHideAmounts] = useState<boolean>(() =>
    readStorage<boolean>(STORAGE_KEYS.PRIVACY_MASK, false)
  );
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    const saved = readStorage<BiometricSettings>(
      STORAGE_KEYS.BIOMETRIC,
      DEFAULT_BIOMETRIC
    );
    return Boolean(saved.enabled && (saved.credentialId || saved.pinHash));
  });

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [initialTxType, setInitialTxType] = useState<TransactionType>('expense');
  const [initialWalletId, setInitialWalletId] = useState<string | undefined>(undefined);
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcApplyHandler, setCalcApplyHandler] = useState<((val: number) => void) | undefined>(
    undefined
  );

  const [dailyReminderBanner, setDailyReminderBanner] = useState(false);
  const [dismissedReminderDate, setDismissedReminderDate] = useState<string>(() =>
    localStorage.getItem(STORAGE_KEYS.LAST_REMINDER_DATE) || ''
  );

  // Hydrate encrypted local browser vault once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [txRes, catRes, walletRes] = await Promise.all([
        readEncryptedStorage<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []),
        readEncryptedStorage<Category[]>(
          STORAGE_KEYS.CATEGORIES,
          createDefaultCategories('local')
        ),
        readEncryptedStorage<WalletAccount[]>(
          STORAGE_KEYS.WALLETS,
          createDefaultWallets('local')
        ),
      ]);
      if (cancelled) return;
      setLocalTransactions(txRes.value);
      setLocalCategories(catRes.value);
      setLocalWallets(walletRes.value);
      setLocalVaultEncrypted(
        txRes.encrypted && catRes.encrypted && walletRes.encrypted
      );
      setVaultReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync dark mode class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', preferences.darkMode);
  }, [preferences.darkMode]);

  // Persist local storage copies
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.BIOMETRIC, JSON.stringify(biometric));
  }, [biometric]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PRIVACY_MASK, JSON.stringify(hideAmounts));
  }, [hideAmounts]);

  useEffect(() => {
    if (!user && vaultReady) {
      writeEncryptedStorage(STORAGE_KEYS.TRANSACTIONS, localTransactions).then(
        (ok) => {
          if (ok) setLocalVaultEncrypted(true);
        }
      );
    }
  }, [localTransactions, user, vaultReady]);

  useEffect(() => {
    if (!user && vaultReady) {
      writeEncryptedStorage(STORAGE_KEYS.CATEGORIES, localCategories).then(
        (ok) => {
          if (ok) setLocalVaultEncrypted(true);
        }
      );
    }
  }, [localCategories, user, vaultReady]);

  useEffect(() => {
    if (!user && vaultReady) {
      writeEncryptedStorage(STORAGE_KEYS.WALLETS, localWallets).then((ok) => {
        if (ok) setLocalVaultEncrypted(true);
      });
    }
  }, [localWallets, user, vaultReady]);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        try {
          setSyncStatus('syncing');
          await ensureUserProfile(nextUser);
          setSyncStatus('synced');
        } catch {
          setSyncStatus('error');
        }
      } else {
        setCloudTransactions([]);
        setCloudCategories([]);
        setCloudWallets([]);
        setSyncStatus('idle');
      }
    });
    return () => unsub();
  }, []);

  // Firestore Real-Time Listeners when authenticated
  useEffect(() => {
    if (!authReady || !vaultReady || !user) return;

    const uid = user.uid;
    const catPath = `users/${uid}/categories`;
    const walletPath = `users/${uid}/wallets`;
    const txPath = `users/${uid}/transactions`;
    const prefPath = `users/${uid}/settings/preferences`;

    let initialCatChecked = false;
    let initialWalletChecked = false;

    const unsubCats = onSnapshot(
      query(collection(db, catPath), where('userId', '==', uid)),
      async (snapshot) => {
        const list = snapshot.docs.map((d) => d.data() as Category);
        setCloudCategories(list);
        if (!initialCatChecked) {
          initialCatChecked = true;
          if (list.length === 0) {
            try {
              setSyncStatus('syncing');
              await syncLocalDataToCloud(
                uid,
                localCategories,
                localTransactions,
                localWallets,
                preferences
              );
              setSyncStatus('synced');
            } catch {
              setSyncStatus('error');
            }
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, catPath);
      }
    );

    const unsubWallets = onSnapshot(
      query(collection(db, walletPath), where('userId', '==', uid)),
      async (snapshot) => {
        const list = snapshot.docs.map((d) => d.data() as WalletAccount);
        setCloudWallets(list);
        if (!initialWalletChecked) {
          initialWalletChecked = true;
          if (list.length === 0) {
            try {
              setSyncStatus('syncing');
              const seedWallets =
                localWallets.length > 0
                  ? localWallets
                  : createDefaultWallets(uid);
              await Promise.all(
                seedWallets.map((w) =>
                  upsertWalletInCloud(uid, { ...w, userId: uid }, true)
                )
              );
              setSyncStatus('synced');
            } catch {
              setSyncStatus('error');
            }
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, walletPath);
      }
    );

    const unsubTxs = onSnapshot(
      query(collection(db, txPath), where('userId', '==', uid)),
      (snapshot) => {
        const list = snapshot.docs.map((d) => d.data() as Transaction);
        setCloudTransactions(list);
        setSyncStatus('synced');
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, txPath);
      }
    );

    const unsubPrefs = onSnapshot(
      doc(db, prefPath),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as Partial<UserPreferences>;
          setPreferences((prev) => ({
            ...prev,
            darkMode:
              typeof data.darkMode === 'boolean' ? data.darkMode : prev.darkMode,
            reminderEnabled:
              typeof data.reminderEnabled === 'boolean'
                ? data.reminderEnabled
                : prev.reminderEnabled,
            reminderTime: data.reminderTime || prev.reminderTime,
            reminderMessage:
              data.reminderMessage !== undefined
                ? data.reminderMessage
                : prev.reminderMessage,
          }));
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, prefPath);
      }
    );

    return () => {
      unsubCats();
      unsubWallets();
      unsubTxs();
      unsubPrefs();
    };
  }, [authReady, vaultReady, user]);

  const activeTransactions = user ? cloudTransactions : localTransactions;
  const activeCategories = user
    ? cloudCategories.length > 0
      ? cloudCategories
      : localCategories
    : localCategories;
  const activeWallets = user
    ? cloudWallets.length > 0
      ? cloudWallets
      : localWallets
    : localWallets;

  // Idle auto-lock & lock-on-tab-switch protection
  useEffect(() => {
    if (!biometric.enabled || isLocked) return;

    const triggerLock = () => {
      setTxModalOpen(false);
      setCalcOpen(false);
      setMobileMenuOpen(false);
      setIsLocked(true);
    };

    const onVisibilityChange = () => {
      if (biometric.lockOnHide && document.visibilityState === 'hidden') {
        triggerLock();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    const idleMinutes = biometric.autoLockMinutes ?? 5;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const resetIdleTimer = () => {
      if (timerId) clearTimeout(timerId);
      if (idleMinutes > 0) {
        timerId = setTimeout(triggerLock, idleMinutes * 60_000);
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'mousemove',
      'touchstart',
    ];
    if (idleMinutes > 0) {
      resetIdleTimer();
      activityEvents.forEach((evt) =>
        window.addEventListener(evt, resetIdleTimer, { passive: true })
      );
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timerId) clearTimeout(timerId);
      activityEvents.forEach((evt) =>
        window.removeEventListener(evt, resetIdleTimer)
      );
    };
  }, [
    biometric.enabled,
    biometric.autoLockMinutes,
    biometric.lockOnHide,
    isLocked,
  ]);

  // Daily reminder notification scheduler (suppressed while locked)
  useEffect(() => {
    const checkReminder = () => {
      if (isLocked || !preferences.reminderEnabled) {
        setDailyReminderBanner(false);
        return;
      }
      const today = getTodayISO();
      const nowTime = getCurrentTimeHHMM();
      const hasTxToday = activeTransactions.some((t) => t.date === today);

      if (nowTime >= preferences.reminderTime && !hasTxToday) {
        if (dismissedReminderDate !== today) {
          setDailyReminderBanner(true);
        }
        const sentKey = `kasharian_notif_sent_${today}`;
        if (
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted' &&
          !localStorage.getItem(sentKey)
        ) {
          localStorage.setItem(sentKey, '1');
          new Notification('Pengingat Harian KasHarian', {
            body:
              preferences.reminderMessage ||
              'Waktunya mencatat pengeluaran dan pemasukan hari ini!',
          });
        }
      } else {
        setDailyReminderBanner(false);
      }
    };

    checkReminder();
    const timer = setInterval(checkReminder, 30000);
    return () => clearInterval(timer);
  }, [
    isLocked,
    preferences.reminderEnabled,
    preferences.reminderTime,
    preferences.reminderMessage,
    activeTransactions,
    dismissedReminderDate,
  ]);

  const handleSendTestNotification = useCallback(async (): Promise<string> => {
    if (typeof Notification === 'undefined') {
      return 'Browser Anda tidak mendukung notifikasi desktop. Pengingat tetap tampil di dalam aplikasi.';
    }
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    if (perm === 'granted') {
      new Notification('Pengingat Harian KasHarian', {
        body:
          preferences.reminderMessage ||
          'Ini adalah simulasi pengingat harian untuk mencatat transaksi Anda.',
      });
      return 'Notifikasi percobaan berhasil dikirim!';
    }
    return 'Izin notifikasi ditolak browser. Pengingat akan tetap muncul sebagai banner di aplikasi.';
  }, [preferences.reminderMessage]);

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setCloudBannerMsg(null);
    try {
      const signedInUser = await signInWithGooglePopup();
      await ensureUserProfile(signedInUser);
      setCloudBannerMsg('Berhasil masuk. Data Anda kini tersinkronisasi ke cloud.');
    } catch (err) {
      setCloudBannerMsg(
        err instanceof Error ? err.message : 'Gagal masuk dengan Google.'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    setCloudTransactions([]);
    setCloudCategories([]);
    setCloudWallets([]);
    setCloudBannerMsg('Anda telah keluar dari akun cloud.');
  };

  const handleWipeLocalData = useCallback(async () => {
    await wipeLocalFinancialVault([
      STORAGE_KEYS.TRANSACTIONS,
      STORAGE_KEYS.CATEGORIES,
      STORAGE_KEYS.WALLETS,
      STORAGE_KEYS.LAST_REMINDER_DATE,
    ]);
    setLocalTransactions([]);
    setLocalCategories(createDefaultCategories('local'));
    setLocalWallets(createDefaultWallets('local'));
    setDismissedReminderDate('');
    setDailyReminderBanner(false);
  }, []);

  const handleManualSync = async () => {
    if (!user) return;
    setSyncStatus('syncing');
    try {
      const res = await syncLocalDataToCloud(
        user.uid,
        localCategories,
        localTransactions,
        localWallets,
        preferences
      );
      setSyncStatus('synced');
      setCloudBannerMsg(
        `Sinkronisasi selesai: ${res.uploadedTransactions} transaksi, ${res.uploadedCategories} kategori & ${res.uploadedWallets} simpanan lokal diunggah ke cloud.`
      );
    } catch {
      setSyncStatus('error');
    }
  };

  const handleUpdatePreferences = async (next: Partial<UserPreferences>) => {
    const updated = { ...preferences, ...next };
    setPreferences(updated);
    if (user) {
      setSyncStatus('syncing');
      await savePreferencesToCloud(user.uid, updated);
      setSyncStatus('synced');
    }
  };

  const handleSaveTransaction = async (tx: Transaction, isNew: boolean) => {
    if (user) {
      setSyncStatus('syncing');
      await upsertTransactionInCloud(user.uid, tx, isNew);
      setSyncStatus('synced');
    } else {
      setLocalTransactions((prev) =>
        isNew ? [tx, ...prev] : prev.map((item) => (item.id === tx.id ? tx : item))
      );
    }
  };

  const handleDeleteTransaction = async (tx: Transaction) => {
    if (user) {
      setSyncStatus('syncing');
      await deleteTransactionInCloud(user.uid, tx.id);
      setSyncStatus('synced');
    } else {
      setLocalTransactions((prev) => prev.filter((item) => item.id !== tx.id));
    }
  };

  const handleSaveCategory = async (cat: Category, isNew: boolean) => {
    if (user) {
      setSyncStatus('syncing');
      await upsertCategoryInCloud(user.uid, cat, isNew);
      setSyncStatus('synced');
    } else {
      setLocalCategories((prev) =>
        isNew ? [...prev, cat] : prev.map((item) => (item.id === cat.id ? cat : item))
      );
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (user) {
      setSyncStatus('syncing');
      await deleteCategoryInCloud(user.uid, categoryId);
      setSyncStatus('synced');
    } else {
      setLocalCategories((prev) => prev.filter((c) => c.id !== categoryId));
    }
  };

  const handleSaveBudgets = async (updatedCategories: Category[]) => {
    if (user) {
      setSyncStatus('syncing');
      await saveCategoryBudgetsInCloud(user.uid, updatedCategories);
      setSyncStatus('synced');
    } else {
      const map = new Map(updatedCategories.map((c) => [c.id, c]));
      setLocalCategories((prev) => prev.map((c) => map.get(c.id) || c));
    }
  };

  const handleSaveWallet = async (wallet: WalletAccount, isNew: boolean) => {
    if (user) {
      setSyncStatus('syncing');
      await upsertWalletInCloud(user.uid, wallet, isNew);
      setSyncStatus('synced');
    } else {
      setLocalWallets((prev) =>
        isNew
          ? [...prev, wallet]
          : prev.map((item) => (item.id === wallet.id ? wallet : item))
      );
    }
  };

  const handleDeleteWallet = async (walletId: string) => {
    if (user) {
      setSyncStatus('syncing');
      await deleteWalletInCloud(user.uid, walletId);
      setSyncStatus('synced');
    } else {
      setLocalWallets((prev) => prev.filter((w) => w.id !== walletId));
    }
  };

  const openTransactionModal = (
    txType: TransactionType = 'expense',
    fromWalletId?: string
  ) => {
    setEditingTx(null);
    setInitialTxType(txType);
    setInitialWalletId(fromWalletId);
    setTxModalOpen(true);
  };

  const todayISO = getTodayISO();

  const navItems: Array<{ id: NavTab; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Dasbor', icon: LayoutDashboard },
    { id: 'aset', label: 'Aset', icon: Landmark },
    { id: 'analytics', label: 'Statistik & PDF', icon: BarChart3 },
    { id: 'settings', label: 'Kategori & Pengaturan', icon: Settings },
  ];

  const pageTitle: Record<NavTab, string> = {
    overview: 'Dasbor Keuangan Harian',
    aset: 'Aset — Pemasukan, Pengeluaran & Simpanan',
    analytics: 'Grafik Statistik & Laporan PDF',
    settings: 'Kategori & Pengaturan Aplikasi',
  };

  if (isLocked) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] dark:bg-[#090D16] text-slate-900 dark:text-slate-100">
        <LockScreen
          biometric={biometric}
          onUnlock={() => setIsLocked(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] dark:bg-[#090D16] text-slate-900 dark:text-slate-100 flex">

      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between p-4 transition-transform lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2 pt-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4" />
              </div>
              <span className="text-lg font-bold font-display tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
                KasHarian
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Tutup Menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="space-y-1" aria-label="Menu Utama">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'aset') {
                      setAsetSection('all');
                    }
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Quick Tools */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-1">
            <button
              type="button"
              onClick={() => {
                setCalcApplyHandler(undefined);
                setCalcOpen(true);
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap"
            >
              <Calculator className="w-4 h-4 shrink-0" />
              <span>Kalkulator Bawaan</span>
            </button>

            <button
              type="button"
              onClick={() =>
                handleUpdatePreferences({ darkMode: !preferences.darkMode })
              }
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap"
            >
              {preferences.darkMode ? (
                <Sun className="w-4 h-4 shrink-0 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 shrink-0" />
              )}
              <span>{preferences.darkMode ? 'Mode Terang' : 'Mode Gelap'}</span>
            </button>

            {biometric.enabled && (
              <button
                type="button"
                onClick={() => setIsLocked(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap"
              >
                <Lock className="w-4 h-4 shrink-0" />
                <span>Kunci Aplikasi</span>
              </button>
            )}
          </div>
        </div>

        {/* Account & Sync Footer */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          {user ? (
            <div className="px-2 space-y-1">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {user.displayName || user.email}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Cloud:{' '}
                {syncStatus === 'syncing'
                  ? 'Menyinkronkan...'
                  : syncStatus === 'error'
                  ? 'Periksa koneksi'
                  : 'Tersinkronisasi'}
              </p>
            </div>
          ) : (
            <button
              type="button"
              disabled={authLoading}
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
            >
              <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate">
                {authLoading ? 'Menghubungkan...' : 'Masuk Cloud Google'}
              </span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Context Title — Primary Action */}
        <header className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Buka Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-semibold font-display text-slate-900 dark:text-slate-100 truncate">
              {pageTitle[activeTab]}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setHideAmounts((prev) => !prev)}
              aria-pressed={hideAmounts}
              title={hideAmounts ? 'Tampilkan Nominal' : 'Samarkan Nominal'}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              {hideAmounts ? (
                <EyeOff className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
              <span className="hidden md:inline">
                {hideAmounts ? 'Tampilkan' : 'Samarkan'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCalcApplyHandler(undefined);
                setCalcOpen(true);
              }}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <Calculator className="w-3.5 h-3.5" />
              Kalkulator
            </button>

            <button
              type="button"
              onClick={() => openTransactionModal('expense')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Catat Transaksi
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto space-y-6">
          {/* In-app Daily Reminder Banner */}
          {dailyReminderBanner && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-950 dark:text-amber-200">
                    Pengingat Catatan Keuangan Hari Ini ({preferences.reminderTime})
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                    {preferences.reminderMessage}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openTransactionModal('expense')}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium whitespace-nowrap shrink-0"
                >
                  Catat Sekarang
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem(STORAGE_KEYS.LAST_REMINDER_DATE, todayISO);
                    setDismissedReminderDate(todayISO);
                    setDailyReminderBanner(false);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 whitespace-nowrap shrink-0"
                >
                  Nanti Saja
                </button>
              </div>
            </div>
          )}

          {cloudBannerMsg && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300">
              <span>{cloudBannerMsg}</span>
              <button
                type="button"
                onClick={() => setCloudBannerMsg(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Tutup pesan"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* DASHBOARD TAB */}
          {activeTab === 'overview' && (
            <DashboardView
              transactions={activeTransactions}
              categories={activeCategories}
              wallets={activeWallets}
              period={period}
              onPeriodChange={setPeriod}
              accountLabel={user?.email || 'Penyimpanan Lokal'}
              darkMode={preferences.darkMode}
              onQuickAdd={(txType) => openTransactionModal(txType)}
              onQuickTransfer={(fromWalletId) =>
                openTransactionModal('transfer', fromWalletId)
              }
              onEditTx={(tx) => {
                setEditingTx(tx);
                setTxModalOpen(true);
              }}
              onDeleteTx={handleDeleteTransaction}
              onSaveBudgets={handleSaveBudgets}
              onOpenCalculator={() => {
                setCalcApplyHandler(undefined);
                setCalcOpen(true);
              }}
              onViewAllTransactions={() => {
                setAsetSection('ledger');
                setActiveTab('aset');
              }}
              onNavigateWallets={() => {
                setAsetSection('savings');
                setActiveTab('aset');
              }}
              hideAmounts={hideAmounts}
            />
          )}

          {/* UNIFIED ASET TAB (PENGELUARAN, PEMASUKAN, SIMPANAN TABUNGAN, ANGGARAN) */}
          {activeTab === 'aset' && (
            <AsetView
              transactions={activeTransactions}
              categories={activeCategories}
              wallets={activeWallets}
              period={period}
              onPeriodChange={setPeriod}
              userId={user?.uid || 'local'}
              accountLabel={user?.email || 'Penyimpanan Lokal'}
              hideAmounts={hideAmounts}
              initialSection={asetSection}
              onQuickAdd={(txType) => openTransactionModal(txType)}
              onQuickTransfer={(fromWalletId) =>
                openTransactionModal('transfer', fromWalletId)
              }
              onEditTx={(tx) => {
                setEditingTx(tx);
                setTxModalOpen(true);
              }}
              onDeleteTx={handleDeleteTransaction}
              onSaveWallet={handleSaveWallet}
              onDeleteWallet={handleDeleteWallet}
              onSaveBudgets={handleSaveBudgets}
              onOpenCalculator={() => {
                setCalcApplyHandler(undefined);
                setCalcOpen(true);
              }}
            />
          )}

          {/* ANALYTICS & PDF TAB */}
          {activeTab === 'analytics' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <StatisticsSection
                transactions={activeTransactions}
                categories={activeCategories}
                wallets={activeWallets}
                period={period}
                onPeriodChange={setPeriod}
                accountLabel={user?.email || 'Penyimpanan Lokal'}
                darkMode={preferences.darkMode}
                hideAmounts={hideAmounts}
              />
            </motion.div>
          )}

          {/* CATEGORIES & SETTINGS TAB */}
          {activeTab === 'settings' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="space-y-6"
            >
              <CategoryManager
                categories={activeCategories}
                userId={user?.uid || 'local'}
                onSaveCategory={handleSaveCategory}
                onDeleteCategory={handleDeleteCategory}
              />

              <SettingsView
                user={user}
                authLoading={authLoading}
                syncStatus={syncStatus}
                onGoogleSignIn={handleGoogleSignIn}
                onSignOut={handleSignOut}
                onManualSync={handleManualSync}
                preferences={preferences}
                onUpdatePreferences={handleUpdatePreferences}
                biometric={biometric}
                onUpdateBiometric={setBiometric}
                onLockNow={() => setIsLocked(true)}
                onSendTestNotification={handleSendTestNotification}
                localVaultEncrypted={localVaultEncrypted}
                hideAmounts={hideAmounts}
                onToggleHideAmounts={() => setHideAmounts((prev) => !prev)}
                onWipeLocalData={handleWipeLocalData}
              />
            </motion.div>
          )}
        </main>
      </div>

      {/* Add/Edit Transaction Modal */}
      <TransactionModal
        isOpen={txModalOpen}
        onClose={() => {
          setTxModalOpen(false);
          setEditingTx(null);
          setInitialWalletId(undefined);
        }}
        onSave={handleSaveTransaction}
        categories={activeCategories}
        wallets={activeWallets}
        editingTransaction={editingTx}
        initialType={initialTxType}
        initialWalletId={initialWalletId}
        userId={user?.uid || 'local'}
        onOpenCalculator={(onApply) => {
          setCalcApplyHandler(() => onApply);
          setCalcOpen(true);
        }}
        onNavigateCategories={() => setActiveTab('settings')}
        onNavigateWallets={() => {
          setAsetSection('savings');
          setActiveTab('aset');
        }}
      />

      {/* Built-In Calculator Drawer */}
      <CalculatorDrawer
        isOpen={calcOpen}
        onClose={() => setCalcOpen(false)}
        onApplyValue={calcApplyHandler}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <KasHarianApp />
    </ErrorBoundary>
  );
}
