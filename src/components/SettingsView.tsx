import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Bell,
  Cloud,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  LogOut,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  BiometricSettings,
  BLUEPRINT_LIMITS,
  UserPreferences,
} from '../types/finance';
import {
  hashSecurityPin,
  isBiometricHardwareAvailable,
  registerWebAuthnCredential,
} from '../lib/biometric';

interface SettingsViewProps {
  user: User | null;
  authLoading: boolean;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  onGoogleSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onManualSync: () => Promise<void>;
  preferences: UserPreferences;
  onUpdatePreferences: (next: Partial<UserPreferences>) => Promise<void> | void;
  biometric: BiometricSettings;
  onUpdateBiometric: (next: BiometricSettings) => void;
  onLockNow: () => void;
  onSendTestNotification: () => Promise<string>;
  localVaultEncrypted: boolean;
  hideAmounts: boolean;
  onToggleHideAmounts: () => void;
  onWipeLocalData: () => Promise<void>;
}

export function SettingsView({
  user,
  authLoading,
  syncStatus,
  onGoogleSignIn,
  onSignOut,
  onManualSync,
  preferences,
  onUpdatePreferences,
  biometric,
  onUpdateBiometric,
  onLockNow,
  onSendTestNotification,
  localVaultEncrypted,
  hideAmounts,
  onToggleHideAmounts,
  onWipeLocalData,
}: SettingsViewProps) {
  const [hwAvailable, setHwAvailable] = useState<boolean | null>(null);
  const [securityMsg, setSecurityMsg] = useState<string | null>(null);
  const [securityErr, setSecurityErr] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    isBiometricHardwareAvailable().then(setHwAvailable);
  }, []);

  const handleEnableWebAuthn = async () => {
    setSecurityErr(null);
    setSecurityMsg(null);
    try {
      const { credentialId } = await registerWebAuthnCredential(
        user?.email || user?.displayName || 'Pengguna KasHarian'
      );
      onUpdateBiometric({
        ...biometric,
        enabled: true,
        credentialId,
        lockOnLaunch: true,
        autoLockMinutes: biometric.autoLockMinutes ?? 5,
      });
      setSecurityMsg(
        'Autentikasi biometrik perangkat berhasil didaftarkan dan diaktifkan.'
      );
    } catch (err) {
      setSecurityErr(
        err instanceof Error
          ? `${err.message} Anda tetap dapat menggunakan PIN Keamanan di bawah ini.`
          : 'Biometrik tidak tersedia di konteks iframe/perangkat ini. Gunakan PIN Keamanan.'
      );
    }
  };

  const handleSavePin = async () => {
    setSecurityErr(null);
    setSecurityMsg(null);
    if (!/^\d{4,6}$/.test(pinInput)) {
      setSecurityErr('PIN harus terdiri dari 4 hingga 6 angka.');
      return;
    }
    const pinHash = await hashSecurityPin(pinInput);
    onUpdateBiometric({
      ...biometric,
      enabled: true,
      pinHash,
      lockOnLaunch: true,
      autoLockMinutes: biometric.autoLockMinutes ?? 5,
    });
    setPinInput('');
    setSecurityMsg('PIN keamanan berhasil dienkripsi (PBKDF2) dan proteksi kunci diaktifkan.');
  };

  const handleDisableSecurity = () => {
    onUpdateBiometric({
      enabled: false,
      credentialId: null,
      pinHash: null,
      lockOnLaunch: false,
      autoLockMinutes: 0,
      lockOnHide: false,
    });
    setSecurityMsg('Kunci biometrik & PIN dinonaktifkan.');
    setSecurityErr(null);
  };

  const handleTestNotification = async () => {
    const result = await onSendTestNotification();
    if (typeof Notification !== 'undefined') {
      setNotifPermission(Notification.permission);
    }
    setNotifFeedback(result);
  };

  const handleConfirmWipe = async () => {
    setWiping(true);
    try {
      await onWipeLocalData();
      setConfirmWipe(false);
      setSecurityMsg('Seluruh cache data lokal browser telah dibersihkan dengan aman.');
      setSecurityErr(null);
    } finally {
      setWiping(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Cloud Sync Card */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold font-display text-slate-900 dark:text-slate-100">
                Sinkronisasi Cloud &amp; Isolasi Akun
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Data cloud dikunci eksklusif untuk akun Google terverifikasi Anda
              </p>
            </div>
          </div>
        </div>

        {user ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {user.displayName || 'Pengguna Terhubung'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {user.email} · Status:{' '}
                  {syncStatus === 'syncing'
                    ? 'Menyinkronkan...'
                    : syncStatus === 'error'
                    ? 'Gagal sinkronisasi'
                    : 'Tersinkronisasi & terisolasi per UID'}
                </p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                Keluar
              </button>
            </div>

            <button
              type="button"
              disabled={syncStatus === 'syncing'}
              onClick={onManualSync}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              <RefreshCw
                className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
              />
              {syncStatus === 'syncing'
                ? 'Menyinkronkan Data...'
                : 'Sinkronkan Data Lokal ke Cloud Sekarang'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Saat ini Anda menggunakan brankas lokal terenkripsi di browser ini. Masuk dengan akun Google untuk pencadangan cloud pribadi yang hanya dapat diakses oleh akun Anda.
            </p>
            <button
              type="button"
              disabled={authLoading}
              onClick={onGoogleSignIn}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              <Cloud className="w-4 h-4" />
              {authLoading ? 'Menghubungkan...' : 'Masuk dengan Google untuk Sinkronisasi Cloud'}
            </button>
          </div>
        )}
      </section>

      {/* Biometric, Vault & Privacy Protection Card */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold font-display text-slate-900 dark:text-slate-100">
                Brankas Privasi, Biometrik &amp; Kunci Otomatis
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enkripsi penyimpanan lokal AES-256-GCM, kunci layar, dan samarkan nominal
              </p>
            </div>
          </div>

          {biometric.enabled && (
            <button
              type="button"
              onClick={onLockNow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-medium whitespace-nowrap shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              Kunci Layar
            </button>
          )}
        </div>

        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
          <p>
            Penyimpanan Lokal:{' '}
            <strong className="text-emerald-700 dark:text-emerald-400">
              {localVaultEncrypted
                ? 'Terenkripsi AES-256-GCM (Kunci Perangkat Terisolasi)'
                : 'Mode Kompatibilitas Browser'}
            </strong>
          </p>
          <p>
            Akses Cloud:{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {user
                ? 'Terkunci per Akun Google Terverifikasi'
                : 'Belum terhubung (hanya lokal)'}
            </strong>
          </p>
          <p>
            Kunci Aplikasi:{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {biometric.enabled ? 'Aktif' : 'Belum diaktifkan'}
            </strong>
            {biometric.credentialId ? ' · Biometrik WebAuthn' : ''}
            {biometric.pinHash ? ' · PIN PBKDF2' : ''}
          </p>
          <p>
            Sensor Biometrik Perangkat:{' '}
            {hwAvailable === null
              ? 'Memeriksa...'
              : hwAvailable
              ? 'Tersedia (Touch ID / Face ID / Windows Hello)'
              : 'Gunakan PIN Keamanan di bawah'}
          </p>
        </div>

        {/* Privacy Mask & Auto-Lock Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onToggleHideAmounts}
            className={`p-3 rounded-lg border text-left transition-colors flex items-center justify-between gap-2 ${
              hideAmounts
                ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30 text-slate-900 dark:text-slate-100'
                : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold">Mode Privasi Layar</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {hideAmounts ? 'Nominal disamarkan' : 'Nominal terlihat'}
              </p>
            </div>
            {hideAmounts ? (
              <EyeOff className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <Eye className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </button>

          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
            <label
              htmlFor="auto-lock-select"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Kunci Otomatis saat Idle
            </label>
            <select
              id="auto-lock-select"
              disabled={!biometric.enabled}
              value={biometric.autoLockMinutes ?? 5}
              onChange={(e) =>
                onUpdateBiometric({
                  ...biometric,
                  autoLockMinutes: Number(e.target.value),
                })
              }
              className="w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 disabled:opacity-50"
            >
              <option value={0}>Tidak otomatis</option>
              <option value={1}>Setelah 1 menit</option>
              <option value={5}>Setelah 5 menit</option>
              <option value={15}>Setelah 15 menit</option>
            </select>
          </div>
        </div>

        {biometric.enabled && (
          <label className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer">
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Kunci Otomatis saat Pindah Tab / Minimize
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Segera kunci layar saat Anda meninggalkan tab browser
              </p>
            </div>
            <input
              type="checkbox"
              checked={Boolean(biometric.lockOnHide)}
              onChange={(e) =>
                onUpdateBiometric({
                  ...biometric,
                  lockOnHide: e.target.checked,
                })
              }
              className="w-4 h-4 accent-emerald-600 rounded"
            />
          </label>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleEnableWebAuthn}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <Fingerprint className="w-4 h-4" />
            {biometric.credentialId
              ? 'Daftarkan Ulang Biometrik'
              : 'Aktifkan Biometrik Perangkat'}
          </button>

          {biometric.enabled && (
            <button
              type="button"
              onClick={handleDisableSecurity}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              Nonaktifkan Kunci
            </button>
          )}
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <label
            htmlFor="pin-setup-input"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            Atur / Ubah PIN Keamanan (4–6 Digit Angka)
          </label>
          <div className="flex items-center gap-2">
            <input
              id="pin-setup-input"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Masukkan 4-6 digit PIN"
              className="flex-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={handleSavePin}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-medium whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Simpan PIN
            </button>
          </div>
        </div>

        {/* Shared-device wipe local data control */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
          {!confirmWipe ? (
            <button
              type="button"
              onClick={() => setConfirmWipe(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Bersihkan Data Lokal dari Perangkat Ini
            </button>
          ) : (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 space-y-2">
              <p className="text-xs text-rose-800 dark:text-rose-200">
                Hapus seluruh cache transaksi, simpanan, dan kategori lokal di browser ini? Data cloud yang sudah tersinkronisasi tidak akan terhapus.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={wiping}
                  onClick={handleConfirmWipe}
                  className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium"
                >
                  {wiping ? 'Membersihkan...' : 'Ya, Hapus Data Lokal'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmWipe(false)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                >
                  Batal
                </button>
              </div>
            </div>
          )}
        </div>

        {securityMsg && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            {securityMsg}
          </p>
        )}
        {securityErr && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            {securityErr}
          </p>
        )}
      </section>

      {/* Daily Reminder Notification Settings */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold font-display text-slate-900 dark:text-slate-100">
                Notifikasi Pengingat Harian
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pengingat otomatis agar transaksi harian tidak terlewat
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={preferences.reminderEnabled}
            onClick={() =>
              onUpdatePreferences({
                reminderEnabled: !preferences.reminderEnabled,
              })
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              preferences.reminderEnabled
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {preferences.reminderEnabled ? 'Aktif' : 'Nonaktif'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="reminder-time"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              Jam Pengingat
            </label>
            <input
              id="reminder-time"
              type="time"
              value={preferences.reminderTime}
              onChange={(e) =>
                onUpdatePreferences({ reminderTime: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="reminder-msg"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              Pesan Pengingat
            </label>
            <input
              id="reminder-msg"
              type="text"
              maxLength={BLUEPRINT_LIMITS.MAX_REMINDER_MESSAGE}
              value={preferences.reminderMessage}
              onChange={(e) =>
                onUpdatePreferences({ reminderMessage: e.target.value })
              }
              placeholder="Waktunya mencatat pemasukan & pengeluaran hari ini!"
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Izin Notifikasi Browser:{' '}
            <strong className="text-slate-700 dark:text-slate-200">
              {notifPermission === 'granted'
                ? 'Diizinkan'
                : notifPermission === 'denied'
                ? 'Diblokir Browser'
                : notifPermission === 'unsupported'
                ? 'Tidak Didukung'
                : 'Belum Diminta'}
            </strong>
          </span>

          <button
            type="button"
            onClick={handleTestNotification}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <Bell className="w-3.5 h-3.5" />
            Uji &amp; Aktifkan Notifikasi
          </button>
        </div>

        {notifFeedback && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            {notifFeedback}
          </p>
        )}
      </section>

      {/* Theme Mode Card */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
            {preferences.darkMode ? (
              <Moon className="w-5 h-5" />
            ) : (
              <Sun className="w-5 h-5" />
            )}
          </div>
          <div>
            <h3 className="text-base font-semibold font-display text-slate-900 dark:text-slate-100">
              Mode Tampilan Aplikasi
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pilih mode terang atau mode gelap yang nyaman untuk mata
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onUpdatePreferences({ darkMode: false })}
            className={`p-4 rounded-xl border text-left transition-colors flex items-center gap-3 ${
              !preferences.darkMode
                ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30 text-slate-900 dark:text-slate-100'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Sun className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Mode Terang</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Latar putih bersih
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onUpdatePreferences({ darkMode: true })}
            className={`p-4 rounded-xl border text-left transition-colors flex items-center gap-3 ${
              preferences.darkMode
                ? 'border-emerald-500 bg-emerald-950/40 text-slate-100'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Moon className="w-5 h-5 text-indigo-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Mode Gelap</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kontras rendah silau
              </p>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
