/**
 * Security Rules Verification Suite (Phase 0 TDD Reference)
 * Evaluates the "Dirty Dozen" adversarial payloads against Firestore rules invariants.
 */

export interface SecurityTestCase {
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  authUid: string | null;
  emailVerified: boolean;
  payload?: Record<string, unknown>;
  expected: 'ALLOW' | 'PERMISSION_DENIED';
}

export const dirtyDozenTestCases: SecurityTestCase[] = [
  {
    name: '1. Cross-Tenant Transaction Read',
    operation: 'get',
    path: '/users/userA/transactions/tx_001',
    authUid: 'userB',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Cross-Tenant Wallet List Query',
    operation: 'list',
    path: '/users/userA/wallets',
    authUid: 'userB',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Identity Spoofing on Create',
    operation: 'create',
    path: '/users/userA/transactions/tx_002',
    authUid: 'userA',
    emailVerified: true,
    payload: { id: 'tx_002', userId: 'userB', type: 'expense', amount: 15000 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Unverified Email Write',
    operation: 'create',
    path: '/users/userA/transactions/tx_003',
    authUid: 'userA',
    emailVerified: false,
    payload: { id: 'tx_003', userId: 'userA', type: 'expense', amount: 15000 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Ghost Field Injection',
    operation: 'create',
    path: '/users/userA/transactions/tx_004',
    authUid: 'userA',
    emailVerified: true,
    payload: { id: 'tx_004', userId: 'userA', type: 'expense', amount: 15000, isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Negative Amount',
    operation: 'create',
    path: '/users/userA/transactions/tx_005',
    authUid: 'userA',
    emailVerified: true,
    payload: { id: 'tx_005', userId: 'userA', type: 'expense', amount: -1000 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. Invalid Transaction Type',
    operation: 'create',
    path: '/users/userA/transactions/tx_006',
    authUid: 'userA',
    emailVerified: true,
    payload: { id: 'tx_006', userId: 'userA', type: 'crypto', amount: 50000 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Oversized Note (> 500 chars)',
    operation: 'create',
    path: '/users/userA/transactions/tx_007',
    authUid: 'userA',
    emailVerified: true,
    payload: { id: 'tx_007', userId: 'userA', type: 'expense', amount: 50000, note: 'x'.repeat(2000) },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. ID Poisoning',
    operation: 'create',
    path: '/users/userA/transactions/bad$id',
    authUid: 'userA',
    emailVerified: true,
    payload: { id: 'bad$id', userId: 'userA', type: 'expense', amount: 50000 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Immortal Field Mutation (createdAt)',
    operation: 'update',
    path: '/users/userA/transactions/tx_001',
    authUid: 'userA',
    emailVerified: true,
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Self-Transfer Forgery (Same Source and Target Wallet)',
    operation: 'create',
    path: '/users/userA/transactions/tx_008',
    authUid: 'userA',
    emailVerified: true,
    payload: {
      id: 'tx_008',
      userId: 'userA',
      type: 'transfer',
      amount: 50000,
      walletId: 'wal_bca',
      toWalletId: 'wal_bca',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. PII Leak on User Profile',
    operation: 'get',
    path: '/users/userA',
    authUid: 'userB',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
];
