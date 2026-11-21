import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  BLUEPRINT_LIMITS,
  Category,
  Transaction,
  UserPreferences,
  WalletAccount,
  WalletKind,
} from '../types/finance';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const VALID_WALLET_KINDS: WalletKind[] = ['cash', 'ewallet', 'bank', 'savings'];

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

testConnection();

export async function signInWithGooglePopup(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

function sanitizeId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, BLUEPRINT_LIMITS.MAX_ID_LENGTH);
  return cleaned || `id_${Date.now()}`;
}

export async function ensureUserProfile(user: User): Promise<void> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const displayName = (user.displayName || user.email || 'Pengguna KasHarian')
    .trim()
    .slice(0, 100);
  const email = (user.email || '').trim().slice(0, 200);

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        userId: user.uid,
        displayName,
        ...(email ? { email } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName,
        ...(email ? { email } : {}),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function savePreferencesToCloud(
  userId: string,
  prefs: UserPreferences
): Promise<void> {
  const prefPath = `users/${userId}/settings/preferences`;
  const prefRef = doc(db, 'users', userId, 'settings', 'preferences');
  const reminderTime = /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(
    prefs.reminderTime
  )
    ? prefs.reminderTime
    : '20:00';
  const reminderMessage = (prefs.reminderMessage || '')
    .trim()
    .slice(0, BLUEPRINT_LIMITS.MAX_REMINDER_MESSAGE);

  try {
    const existingSnap = await getDoc(prefRef);
    const payload = {
      userId,
      darkMode: Boolean(prefs.darkMode),
      reminderEnabled: Boolean(prefs.reminderEnabled),
      reminderTime,
      reminderMessage,
      currency: prefs.currency === 'USD' ? 'USD' : 'IDR',
      updatedAt: serverTimestamp(),
    };
    if (existingSnap.exists()) {
      await updateDoc(prefRef, {
        darkMode: payload.darkMode,
        reminderEnabled: payload.reminderEnabled,
        reminderTime: payload.reminderTime,
        reminderMessage: payload.reminderMessage,
        currency: payload.currency,
        updatedAt: payload.updatedAt,
      });
    } else {
      await setDoc(prefRef, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, prefPath);
  }
}

export async function upsertCategoryInCloud(
  userId: string,
  category: Category,
  isNew: boolean
): Promise<void> {
  const safeId = sanitizeId(category.id);
  const path = `users/${userId}/categories/${safeId}`;
  const ref = doc(db, 'users', userId, 'categories', safeId);

  const name = category.name.trim().slice(0, BLUEPRINT_LIMITS.MAX_CATEGORY_NAME);
  const color = /^#[0-9a-fA-F]{3,8}$/.test(category.color)
    ? category.color
    : '#059669';
  const icon = category.icon.trim().slice(0, 32) || 'tag';
  const monthlyBudget =
    category.type === 'expense'
      ? Math.min(
          Math.max(Math.round(Number(category.monthlyBudget) || 0), 0),
          BLUEPRINT_LIMITS.MAX_AMOUNT
        )
      : 0;

  try {
    if (isNew) {
      await setDoc(ref, {
        id: safeId,
        userId,
        name: name || 'Kategori',
        type: category.type,
        color,
        icon,
        isDefault: Boolean(category.isDefault),
        monthlyBudget,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingSnap = await getDoc(ref);
      if (!existingSnap.exists()) {
        await setDoc(ref, {
          id: safeId,
          userId,
          name: name || 'Kategori',
          type: category.type,
          color,
          icon,
          isDefault: Boolean(category.isDefault),
          monthlyBudget,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, {
          name: name || 'Kategori',
          type: category.type,
          color,
          icon,
          isDefault: Boolean(category.isDefault),
          monthlyBudget,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function saveCategoryBudgetsInCloud(
  userId: string,
  categories: Category[]
): Promise<void> {
  await Promise.all(
    categories.map((cat) => upsertCategoryInCloud(userId, cat, false))
  );
}

export async function deleteCategoryInCloud(
  userId: string,
  categoryId: string
): Promise<void> {
  const safeId = sanitizeId(categoryId);
  const path = `users/${userId}/categories/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'categories', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function upsertWalletInCloud(
  userId: string,
  wallet: WalletAccount,
  isNew: boolean
): Promise<void> {
  const safeId = sanitizeId(wallet.id);
  const path = `users/${userId}/wallets/${safeId}`;
  const ref = doc(db, 'users', userId, 'wallets', safeId);

  const name =
    wallet.name.trim().slice(0, BLUEPRINT_LIMITS.MAX_WALLET_NAME) || 'Simpanan';
  const kind: WalletKind = VALID_WALLET_KINDS.includes(wallet.kind)
    ? wallet.kind
    : 'ewallet';
  const initialBalance = Math.min(
    Math.max(Math.round(Number(wallet.initialBalance) || 0), 0),
    BLUEPRINT_LIMITS.MAX_AMOUNT
  );
  const color = /^#[0-9a-fA-F]{3,8}$/.test(wallet.color)
    ? wallet.color
    : '#0284C7';
  const icon = wallet.icon.trim().slice(0, 32) || 'wallet';

  try {
    const existingSnap = isNew ? null : await getDoc(ref);
    if (isNew || !existingSnap?.exists()) {
      await setDoc(ref, {
        id: safeId,
        userId,
        name,
        kind,
        initialBalance,
        color,
        icon,
        isDefault: Boolean(wallet.isDefault),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        name,
        kind,
        initialBalance,
        color,
        icon,
        isDefault: Boolean(wallet.isDefault),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteWalletInCloud(
  userId: string,
  walletId: string
): Promise<void> {
  const safeId = sanitizeId(walletId);
  const path = `users/${userId}/wallets/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'wallets', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

function buildWalletTxFields(tx: Transaction) {
  const walletId = tx.walletId?.trim() ? sanitizeId(tx.walletId) : undefined;
  const walletName = tx.walletName?.trim()
    ? tx.walletName.trim().slice(0, BLUEPRINT_LIMITS.MAX_WALLET_NAME)
    : undefined;
  const toWalletId =
    tx.type === 'transfer' && tx.toWalletId?.trim()
      ? sanitizeId(tx.toWalletId)
      : undefined;
  const toWalletName =
    tx.type === 'transfer' && tx.toWalletName?.trim()
      ? tx.toWalletName.trim().slice(0, BLUEPRINT_LIMITS.MAX_WALLET_NAME)
      : undefined;

  return { walletId, walletName, toWalletId, toWalletName };
}

export async function upsertTransactionInCloud(
  userId: string,
  tx: Transaction,
  isNew: boolean
): Promise<void> {
  const safeId = sanitizeId(tx.id);
  const safeCatId = sanitizeId(tx.categoryId);
  const path = `users/${userId}/transactions/${safeId}`;
  const ref = doc(db, 'users', userId, 'transactions', safeId);

  const txType =
    tx.type === 'income' || tx.type === 'expense' || tx.type === 'transfer'
      ? tx.type
      : 'expense';
  const amount = Math.min(
    Math.max(Number(tx.amount) || 1, 1),
    BLUEPRINT_LIMITS.MAX_AMOUNT
  );
  const categoryName =
    tx.categoryName.trim().slice(0, BLUEPRINT_LIMITS.MAX_CATEGORY_NAME) ||
    (txType === 'transfer' ? 'Transfer Saldo' : 'Lainnya');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(tx.date)
    ? tx.date
    : new Date().toISOString().slice(0, 10);
  const time = /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(tx.time)
    ? tx.time
    : '12:00';
  const note = (tx.note || '').trim().slice(0, BLUEPRINT_LIMITS.MAX_NOTE_LENGTH);
  const paymentMethod = BLUEPRINT_LIMITS.PAYMENT_METHODS.includes(
    tx.paymentMethod || 'Tunai'
  )
    ? tx.paymentMethod || 'Tunai'
    : 'Tunai';

  const { walletId, walletName, toWalletId, toWalletName } = buildWalletTxFields({
    ...tx,
    type: txType,
  });

  try {
    const existingSnap = isNew ? null : await getDoc(ref);
    if (isNew || !existingSnap?.exists()) {
      await setDoc(ref, {
        id: safeId,
        userId,
        type: txType,
        amount,
        categoryId: safeCatId,
        categoryName,
        ...(walletId ? { walletId } : {}),
        ...(walletName ? { walletName } : {}),
        ...(toWalletId ? { toWalletId } : {}),
        ...(toWalletName ? { toWalletName } : {}),
        date,
        time,
        note,
        paymentMethod,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        type: txType,
        amount,
        categoryId: safeCatId,
        categoryName,
        walletId: walletId ?? deleteField(),
        walletName: walletName ?? deleteField(),
        toWalletId: toWalletId ?? deleteField(),
        toWalletName: toWalletName ?? deleteField(),
        date,
        time,
        note,
        paymentMethod,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteTransactionInCloud(
  userId: string,
  transactionId: string
): Promise<void> {
  const safeId = sanitizeId(transactionId);
  const path = `users/${userId}/transactions/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'transactions', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncLocalDataToCloud(
  userId: string,
  localCategories: Category[],
  localTransactions: Transaction[],
  localWallets: WalletAccount[],
  prefs: UserPreferences
): Promise<{
  uploadedCategories: number;
  uploadedTransactions: number;
  uploadedWallets: number;
}> {
  await ensureUserProfile(auth.currentUser!);

  const catPath = `users/${userId}/categories`;
  const txPath = `users/${userId}/transactions`;
  const walletPath = `users/${userId}/wallets`;

  let existingCatIds = new Set<string>();
  let existingTxIds = new Set<string>();
  let existingWalletIds = new Set<string>();

  try {
    const catSnap = await getDocs(
      query(collection(db, catPath), where('userId', '==', userId))
    );
    existingCatIds = new Set(catSnap.docs.map((d) => d.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, catPath);
  }

  try {
    const walletSnap = await getDocs(
      query(collection(db, walletPath), where('userId', '==', userId))
    );
    existingWalletIds = new Set(walletSnap.docs.map((d) => d.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, walletPath);
  }

  try {
    const txSnap = await getDocs(
      query(collection(db, txPath), where('userId', '==', userId))
    );
    existingTxIds = new Set(txSnap.docs.map((d) => d.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, txPath);
  }

  let uploadedCategories = 0;
  let uploadedTransactions = 0;
  let uploadedWallets = 0;

  const missingCategories = localCategories.filter(
    (c) => !existingCatIds.has(sanitizeId(c.id))
  );
  const missingWallets = localWallets.filter(
    (w) => !existingWalletIds.has(sanitizeId(w.id))
  );
  const missingTransactions = localTransactions.filter(
    (t) => !existingTxIds.has(sanitizeId(t.id))
  );

  const allOps: Array<
    | { kind: 'cat'; item: Category }
    | { kind: 'wallet'; item: WalletAccount }
    | { kind: 'tx'; item: Transaction }
  > = [
    ...missingCategories.map((item) => ({ kind: 'cat' as const, item })),
    ...missingWallets.map((item) => ({ kind: 'wallet' as const, item })),
    ...missingTransactions.map((item) => ({ kind: 'tx' as const, item })),
  ];

  for (let i = 0; i < allOps.length; i += 400) {
    const chunk = allOps.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.kind === 'cat') {
        const safeId = sanitizeId(op.item.id);
        const monthlyBudget =
          op.item.type === 'expense'
            ? Math.min(
                Math.max(Math.round(Number(op.item.monthlyBudget) || 0), 0),
                BLUEPRINT_LIMITS.MAX_AMOUNT
              )
            : 0;
        batch.set(doc(db, 'users', userId, 'categories', safeId), {
          id: safeId,
          userId,
          name: op.item.name.trim().slice(0, BLUEPRINT_LIMITS.MAX_CATEGORY_NAME) || 'Kategori',
          type: op.item.type,
          color: /^#[0-9a-fA-F]{3,8}$/.test(op.item.color) ? op.item.color : '#059669',
          icon: op.item.icon.trim().slice(0, 32) || 'tag',
          isDefault: Boolean(op.item.isDefault),
          monthlyBudget,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        uploadedCategories++;
      } else if (op.kind === 'wallet') {
        const safeId = sanitizeId(op.item.id);
        const kind: WalletKind = VALID_WALLET_KINDS.includes(op.item.kind)
          ? op.item.kind
          : 'ewallet';
        const initialBalance = Math.min(
          Math.max(Math.round(Number(op.item.initialBalance) || 0), 0),
          BLUEPRINT_LIMITS.MAX_AMOUNT
        );
        batch.set(doc(db, 'users', userId, 'wallets', safeId), {
          id: safeId,
          userId,
          name: op.item.name.trim().slice(0, BLUEPRINT_LIMITS.MAX_WALLET_NAME) || 'Simpanan',
          kind,
          initialBalance,
          color: /^#[0-9a-fA-F]{3,8}$/.test(op.item.color) ? op.item.color : '#0284C7',
          icon: op.item.icon.trim().slice(0, 32) || 'wallet',
          isDefault: Boolean(op.item.isDefault),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        uploadedWallets++;
      } else {
        const safeId = sanitizeId(op.item.id);
        const safeCatId = sanitizeId(op.item.categoryId);
        const txType =
          op.item.type === 'income' ||
          op.item.type === 'expense' ||
          op.item.type === 'transfer'
            ? op.item.type
            : 'expense';
        const { walletId, walletName, toWalletId, toWalletName } = buildWalletTxFields({
          ...op.item,
          type: txType,
        });
        batch.set(doc(db, 'users', userId, 'transactions', safeId), {
          id: safeId,
          userId,
          type: txType,
          amount: Math.min(Math.max(Number(op.item.amount) || 1, 1), BLUEPRINT_LIMITS.MAX_AMOUNT),
          categoryId: safeCatId,
          categoryName:
            op.item.categoryName.trim().slice(0, BLUEPRINT_LIMITS.MAX_CATEGORY_NAME) ||
            (txType === 'transfer' ? 'Transfer Saldo' : 'Lainnya'),
          ...(walletId ? { walletId } : {}),
          ...(walletName ? { walletName } : {}),
          ...(toWalletId ? { toWalletId } : {}),
          ...(toWalletName ? { toWalletName } : {}),
          date: /^\d{4}-\d{2}-\d{2}$/.test(op.item.date)
            ? op.item.date
            : new Date().toISOString().slice(0, 10),
          time: /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(op.item.time) ? op.item.time : '12:00',
          note: (op.item.note || '').trim().slice(0, BLUEPRINT_LIMITS.MAX_NOTE_LENGTH),
          paymentMethod: BLUEPRINT_LIMITS.PAYMENT_METHODS.includes(op.item.paymentMethod || 'Tunai')
            ? op.item.paymentMethod || 'Tunai'
            : 'Tunai',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        uploadedTransactions++;
      }
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
    }
  }

  await savePreferencesToCloud(userId, prefs);

  return { uploadedCategories, uploadedTransactions, uploadedWallets };
}
