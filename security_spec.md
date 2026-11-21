# Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every document under `/users/{userId}` and its subcollections (`settings`, `categories`, `wallets`, `transactions`) belongs strictly to `{userId}` (`request.auth.uid == userId`), and every document payload must contain `userId == request.auth.uid`.
2. **Verified Identity**: Only authenticated users with verified Google emails (`request.auth.token.email_verified == true`) can read or write user documents.
3. **Immutable Ownership & Timestamps**: `userId` and `createdAt` can never be modified after creation. `createdAt` and `updatedAt` must equal `request.time`.
4. **Strict Payload Boundaries**: Every string has explicit `.size()` bounds, `amount` must be a positive finite number (`amount > 0 && amount <= 1000000000000`), `date` must match `YYYY-MM-DD`, `time` must match `HH:mm`, and `id` path variables must match `^[a-zA-Z0-9_\-]+$` (max 128 chars).
5. **Wallet & Transfer Integrity**: `WalletAccount` `initialBalance` must be `>= 0 && <= 1000000000000` with `kind` in `['cash', 'ewallet', 'bank', 'savings']`. Any transaction with `type == 'transfer'` must specify distinct `walletId` and `toWalletId`.
6. **No Ghost Fields**: `keys().hasAll(...)` and `keys().hasOnly(...)` on create, plus `incoming().diff(existing()).affectedKeys().hasOnly(...)` on update.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Cross-Tenant Transaction & Wallet Read**: User B attempts `get(/users/userA/transactions/tx1)` or `get(/users/userA/wallets/wal1)` -> `PERMISSION_DENIED`.
2. **Cross-Tenant List Query**: User B attempts `list(/users/userA/transactions)` -> `PERMISSION_DENIED`.
3. **Identity Spoofing on Create**: User A writes `/users/userA/transactions/tx1` with `userId: "userB"` -> `PERMISSION_DENIED`.
4. **Unverified Email Write**: User with `email_verified: false` attempts to create a transaction -> `PERMISSION_DENIED`.
5. **Ghost Field Injection (Shadow Update)**: User A creates/updates transaction with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
6. **Negative or Zero Amount**: User A creates transaction with `amount: -50000` or `amount: 0` -> `PERMISSION_DENIED`.
7. **Invalid Transaction Type**: User A creates transaction with `type: "crypto"` -> `PERMISSION_DENIED`.
8. **Oversized Note (Denial of Wallet)**: User A creates transaction with `note` of 2,000 characters (> 500) -> `PERMISSION_DENIED`.
9. **ID Poisoning**: User A writes `/users/userA/transactions/invalid$id..` -> `PERMISSION_DENIED`.
10. **Immortal Field Mutation**: User A updates transaction changing `createdAt` or `userId` -> `PERMISSION_DENIED`.
11. **Self-Transfer Forgery**: User A creates `type: "transfer"` where `walletId == toWalletId` or `toWalletId` is omitted -> `PERMISSION_DENIED`.
12. **PII Leak on User Profile**: User B reads `/users/userA` -> `PERMISSION_DENIED`.
