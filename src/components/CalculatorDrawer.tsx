import { useEffect, useState } from 'react';
import { Check, Delete, History, X } from 'lucide-react';
import { evaluateMathExpression, formatIDR } from '../lib/formatters';

interface CalculatorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyValue?: (value: number) => void;
  applyLabel?: string;
}

interface CalcHistoryItem {
  expression: string;
  result: number;
}

const KEYS = [
  ['C', '⌫', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['000', '0', '.', '='],
];

export function CalculatorDrawer({
  isOpen,
  onClose,
  onApplyValue,
  applyLabel = 'Gunakan Nominal',
}: CalculatorDrawerProps) {
  const [expression, setExpression] = useState('0');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<CalcHistoryItem[]>([]);

  const previewResult = evaluateMathExpression(expression);

  const handleKeyPress = (key: string) => {
    setErrorMsg(null);
    if (key === 'C') {
      setExpression('0');
      return;
    }
    if (key === '⌫') {
      setExpression((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
      return;
    }
    if (key === '=') {
      const evaluated = evaluateMathExpression(expression);
      if (evaluated === null) {
        setErrorMsg('Ekspresi tidak valid');
        return;
      }
      setHistory((prev) =>
        [{ expression, result: evaluated }, ...prev].slice(0, 8)
      );
      setExpression(String(evaluated));
      return;
    }

    const operators = ['+', '-', '×', '÷', '%'];
    setExpression((prev) => {
      if (prev === '0' && !operators.includes(key) && key !== '.') {
        return key === '000' ? '0' : key;
      }
      const lastChar = prev.slice(-1);
      if (operators.includes(lastChar) && operators.includes(key)) {
        return prev.slice(0, -1) + key;
      }
      return prev + key;
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (/^[0-9.]$/.test(e.key)) {
        handleKeyPress(e.key);
      } else if (e.key === '+') handleKeyPress('+');
      else if (e.key === '-') handleKeyPress('-');
      else if (e.key === '*') handleKeyPress('×');
      else if (e.key === '/') {
        e.preventDefault();
        handleKeyPress('÷');
      } else if (e.key === '%') handleKeyPress('%');
      else if (e.key === 'Backspace') handleKeyPress('⌫');
      else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleKeyPress('=');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, expression, onClose]);

  if (!isOpen) return null;

  const usableAmount =
    previewResult !== null && previewResult > 0 ? Math.round(previewResult) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-sm h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between p-5 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        aria-label="Kalkulator Bawaan"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold font-display text-slate-900 dark:text-slate-100">
                Kalkulator Cepat
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hitung pembagian tagihan, diskon, atau total belanja
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Tutup Kalkulator"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Display */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-right text-sm font-mono-tabular text-slate-500 dark:text-slate-400 min-h-[20px] break-all">
              {expression}
            </div>
            <div className="text-right text-2xl font-bold font-mono-tabular text-slate-900 dark:text-slate-100 truncate">
              {previewResult !== null ? formatIDR(previewResult) : '—'}
            </div>
            {errorMsg && (
              <p className="text-xs text-rose-600 dark:text-rose-400 text-right">
                {errorMsg}
              </p>
            )}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-4 gap-2">
            {KEYS.flat().map((key) => {
              const isOperator = ['÷', '×', '-', '+', '%'].includes(key);
              const isEqual = key === '=';
              const isClear = key === 'C' || key === '⌫';

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleKeyPress(key)}
                  className={`h-12 rounded-lg font-mono-tabular text-base font-semibold transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isEqual
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : isOperator
                      ? 'bg-slate-100 dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      : isClear
                      ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {key === '⌫' ? <Delete className="w-4 h-4" /> : key}
                </button>
              );
            })}
          </div>

          {onApplyValue && (
            <button
              type="button"
              disabled={!usableAmount}
              onClick={() => {
                if (usableAmount) {
                  onApplyValue(usableAmount);
                  onClose();
                }
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <Check className="w-4 h-4" />
              {applyLabel} {usableAmount ? `(${formatIDR(usableAmount)})` : ''}
            </button>
          )}
        </div>

        {/* History Tape */}
        <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              Riwayat Perhitungan
            </span>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setHistory([])}
                className="hover:text-slate-900 dark:hover:text-slate-200"
              >
                Bersihkan
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-2">
              Tekan &quot;=&quot; untuk menyimpan hasil perhitungan di sini.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {history.map((item, idx) => (
                <button
                  key={`${item.expression}-${idx}`}
                  type="button"
                  onClick={() => setExpression(String(item.result))}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="font-mono-tabular text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                    {item.expression}
                  </span>
                  <span className="font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                    = {formatIDR(item.result)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
