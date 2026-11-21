import React, { useEffect, useState } from 'react';
import { Fingerprint, KeyRound, Lock } from 'lucide-react';
import { BiometricSettings } from '../types/finance';
import {
  verifySecurityPin,
  verifyWebAuthnCredential,
} from '../lib/biometric';

interface LockScreenProps {
  biometric: BiometricSettings;
  onUnlock: () => void;
}

const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 30;

export function LockScreen({ biometric, onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = setInterval(() => {
      setCooldownLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownLeft]);

  const handleBiometricUnlock = async () => {
    if (!biometric.credentialId) return;
    setError(null);
    setVerifying(true);
    try {
      const ok = await verifyWebAuthnCredential(biometric.credentialId);
      if (ok) {
        setFailedAttempts(0);
        setCooldownLeft(0);
        onUnlock();
      } else {
        setError('Verifikasi biometrik gagal.');
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Biometrik dibatalkan. Gunakan PIN keamanan Anda.'
      );
    } finally {
      setVerifying(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!biometric.pinHash || cooldownLeft > 0) return;
    setError(null);
    const ok = await verifySecurityPin(pin, biometric.pinHash);
    if (ok) {
      setPin('');
      setFailedAttempts(0);
      setCooldownLeft(0);
      onUnlock();
    } else {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      setPin('');
      if (nextAttempts >= MAX_ATTEMPTS) {
        setCooldownLeft(COOLDOWN_SECONDS);
        setFailedAttempts(0);
        setError(
          `Terlalu banyak percobaan gagal. Tunggu ${COOLDOWN_SECONDS} detik sebelum mencoba lagi.`
        );
      } else {
        setError(
          `PIN tidak sesuai (${nextAttempts}/${MAX_ATTEMPTS} percobaan).`
        );
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <Lock className="w-6 h-6" />
        </div>

        <div className="space-y-1">
          <h1 className="text-xl font-bold font-display text-slate-900 dark:text-slate-100">
            KasHarian Terkunci
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Data keuangan Anda terlindungi. Verifikasi identitas untuk melanjutkan.
          </p>
        </div>

        {biometric.credentialId && (
          <button
            type="button"
            disabled={verifying}
            onClick={handleBiometricUnlock}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            <Fingerprint className="w-5 h-5" />
            {verifying ? 'Memverifikasi...' : 'Buka dengan Biometrik'}
          </button>
        )}

        {biometric.pinHash && (
          <form onSubmit={handlePinSubmit} className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label
              htmlFor="unlock-pin"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Atau masukkan PIN Keamanan
            </label>
            <input
              id="unlock-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              disabled={cooldownLeft > 0}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="••••"
              className="w-full text-center tracking-[0.4em] px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono-tabular text-lg text-slate-900 dark:text-slate-100 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={cooldownLeft > 0 || pin.length < 4}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              <KeyRound className="w-4 h-4" />
              {cooldownLeft > 0
                ? `Tunggu ${cooldownLeft} detik...`
                : 'Buka dengan PIN'}
            </button>
          </form>
        )}

        {error && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
        )}
      </div>
    </div>
  );
}
