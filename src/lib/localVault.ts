/**
 * Encrypted local browser storage vault using Web Crypto AES-256-GCM
 * with a non-extractable CryptoKey stored in IndexedDB.
 * Ensures local financial data in localStorage is never stored in readable plaintext.
 */

const DB_NAME = 'kasharian_vault_keystore';
const STORE_NAME = 'keys';
const MASTER_KEY_ID = 'device_master_key_v1';

interface EncryptedEnvelope {
  v: 1;
  iv: string;
  ct: string;
}

function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function openKeyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Gagal membuka keystore'));
  });
}

function getStoredKey(db: IDBDatabase): Promise<CryptoKey | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(MASTER_KEY_ID);
    req.onsuccess = () => resolve((req.result as CryptoKey) || null);
    req.onerror = () => reject(req.error);
  });
}

function saveStoredKey(db: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(key, MASTER_KEY_ID);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

let cachedKeyPromise: Promise<CryptoKey | null> | null = null;

async function getOrCreateDeviceKey(): Promise<CryptoKey | null> {
  if (
    typeof window === 'undefined' ||
    !window.crypto?.subtle ||
    typeof indexedDB === 'undefined'
  ) {
    return null;
  }

  if (!cachedKeyPromise) {
    cachedKeyPromise = (async () => {
      try {
        const db = await openKeyDatabase();
        const existing = await getStoredKey(db);
        if (existing) return existing;

        const key = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
        await saveStoredKey(db, key);
        return key;
      } catch {
        return null;
      }
    })();
  }

  return cachedKeyPromise;
}

function isEncryptedEnvelope(obj: unknown): obj is EncryptedEnvelope {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as EncryptedEnvelope).v === 1 &&
    typeof (obj as EncryptedEnvelope).iv === 'string' &&
    typeof (obj as EncryptedEnvelope).ct === 'string'
  );
}

export async function isLocalEncryptionSupported(): Promise<boolean> {
  const key = await getOrCreateDeviceKey();
  return key !== null;
}

export async function writeEncryptedStorage(
  key: string,
  value: unknown
): Promise<boolean> {
  const json = JSON.stringify(value);
  const cryptoKey = await getOrCreateDeviceKey();
  if (!cryptoKey) {
    return false;
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(json);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    cryptoKey,
    encoded
  );

  const envelope: EncryptedEnvelope = {
    v: 1,
    iv: bufferToBase64(iv),
    ct: bufferToBase64(cipherBuffer),
  };
  localStorage.setItem(key, JSON.stringify(envelope));
  return true;
}

export async function readEncryptedStorage<T>(
  key: string,
  fallback: T
): Promise<{ value: T; encrypted: boolean }> {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return { value: fallback, encrypted: await isLocalEncryptionSupported() };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isEncryptedEnvelope(parsed)) {
      const cryptoKey = await getOrCreateDeviceKey();
      if (!cryptoKey) {
        return { value: fallback, encrypted: false };
      }
      const iv = base64ToUint8Array(parsed.iv);
      const ct = base64ToUint8Array(parsed.ct);
      const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        cryptoKey,
        ct as unknown as BufferSource
      );
      const plainJson = new TextDecoder().decode(plainBuffer);
      return { value: JSON.parse(plainJson) as T, encrypted: true };
    }

    // Legacy plaintext value: migrate immediately to encrypted AES-GCM storage
    const encryptedNow = await writeEncryptedStorage(key, parsed);
    return { value: parsed as T, encrypted: encryptedNow };
  } catch {
    return { value: fallback, encrypted: await isLocalEncryptionSupported() };
  }
}

export async function wipeLocalFinancialVault(keys: string[]): Promise<void> {
  for (const key of keys) {
    localStorage.removeItem(key);
  }
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('kasharian_notif_sent_')) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) {
    localStorage.removeItem(k);
  }
}
