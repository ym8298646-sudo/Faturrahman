import { PeriodFilter, Transaction } from '../types/finance';

export function formatIDR(amount: number): string {
  const rounded = Math.round(amount);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rounded);
}

export function maskAmount(formatted: string, hide: boolean): string {
  if (!hide) return formatted;
  const trimmed = formatted.trim();
  if (trimmed.startsWith('+')) return '+ Rp •••••••';
  if (trimmed.startsWith('-')) return '- Rp •••••••';
  return 'Rp •••••••';
}

export function formatCompactIDR(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace('.', ',')} Jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp ${Math.round(abs / 1_000)} Rb`;
  }
  return `${sign}Rp ${Math.round(abs)}`;
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentTimeHHMM(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatDateID(dateISO: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return dateISO;
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatShortDayID(dateISO: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return dateISO;
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

export function filterTransactionsByPeriod(
  transactions: Transaction[],
  period: PeriodFilter,
  referenceDateISO = getTodayISO()
): Transaction[] {
  if (period === 'all') return transactions;

  const [refY, refM, refD] = referenceDateISO.split('-').map(Number);
  const refDate = new Date(refY, refM - 1, refD);

  if (period === 'month') {
    const prefix = `${refY}-${String(refM).padStart(2, '0')}`;
    return transactions.filter((tx) => tx.date.startsWith(prefix));
  }

  const days = period === '7d' ? 6 : 29;
  const startDate = new Date(refDate);
  startDate.setDate(startDate.getDate() - days);
  const startISO = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

  return transactions.filter(
    (tx) => tx.date >= startISO && tx.date <= referenceDateISO
  );
}

export function generateSafeId(prefix: string): string {
  let randomPart = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    randomPart = Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 10);
  } else {
    randomPart = Math.random().toString(36).slice(2, 10);
  }
  const timePart = Date.now().toString(36);
  return `${prefix}_${timePart}_${randomPart}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Safe arithmetic expression evaluator (no eval/Function).
 * Supports +, -, *, /, %, decimals, and unary minus.
 */
export function evaluateMathExpression(raw: string): number | null {
  const sanitized = raw
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/,/g, '.')
    .replace(/\s+/g, '');

  if (!sanitized || !/^[0-9+\-*/.%()]+$/.test(sanitized)) {
    return null;
  }

  let index = 0;

  function parseExpression(): number {
    let left = parseTerm();
    while (index < sanitized.length) {
      const op = sanitized[index];
      if (op === '+' || op === '-') {
        index++;
        const right = parseTerm();
        left = op === '+' ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (index < sanitized.length) {
      const op = sanitized[index];
      if (op === '*' || op === '/' || op === '%') {
        index++;
        const right = parseFactor();
        if (op === '*') left *= right;
        else if (op === '/') {
          if (right === 0) throw new Error('Division by zero');
          left /= right;
        } else {
          left = (left * right) / 100;
        }
      } else {
        break;
      }
    }
    return left;
  }

  function parseFactor(): number {
    if (sanitized[index] === '+') {
      index++;
      return parseFactor();
    }
    if (sanitized[index] === '-') {
      index++;
      return -parseFactor();
    }
    if (sanitized[index] === '(') {
      index++;
      const val = parseExpression();
      if (sanitized[index] === ')') index++;
      return val;
    }
    const start = index;
    while (
      index < sanitized.length &&
      ((sanitized[index] >= '0' && sanitized[index] <= '9') ||
        sanitized[index] === '.')
    ) {
      index++;
    }
    if (start === index) {
      throw new Error('Unexpected token');
    }
    const num = Number(sanitized.slice(start, index));
    if (!Number.isFinite(num)) throw new Error('Invalid number');
    return num;
  }

  try {
    const result = parseExpression();
    if (index !== sanitized.length || !Number.isFinite(result)) {
      return null;
    }
    return Math.round(result * 100) / 100;
  } catch {
    return null;
  }
}
