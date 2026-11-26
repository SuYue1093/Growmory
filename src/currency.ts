import { useEffect, useState } from 'react';

export type CurrencyMode = 'CNY' | 'USD';
export type RevenueRate = { date: string; cnyPerUsd: number; stale: boolean };

const STORAGE_KEY = 'growmory_demo_currency_mode';
const CHANGE_EVENT = 'growmory:currency-change';

export function getCurrencyMode(): CurrencyMode {
  if (typeof window === 'undefined') return 'CNY';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'USD' ? 'USD' : 'CNY';
  } catch {
    return 'CNY';
  }
}

export function getCurrencySymbol(): string {
  return getCurrencyMode() === 'USD' ? '$' : '¥';
}

export function toggleCurrencyMode(): CurrencyMode {
  const current = getCurrencyMode();
  const next: CurrencyMode = current === 'CNY' ? 'USD' : 'CNY';
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch { }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  }
  return next;
}

export function setCurrencyMode(mode: CurrencyMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch { }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: mode }));
  }
}

export function useCurrency() {
  const [mode, setMode] = useState<CurrencyMode>(getCurrencyMode);

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<CurrencyMode>;
      setMode(custom.detail || getCurrencyMode());
    };
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  return {
    mode,
    symbol: mode === 'USD' ? '$' : '¥',
    toggle: toggleCurrencyMode,
    setMode: setCurrencyMode,
  };
}

/**
 * 格式化金额，在货币切换时不变更数值，仅切换货币符号
 */
export function formatMoney(amount: number, rate: RevenueRate | null): string {
  const symbol = getCurrencySymbol();
  const val = rate ? amount * rate.cnyPerUsd : amount;
  return `${symbol}${val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 替换已有文本中的货币符号（¥ <-> $），不改变数字
 * 如 "¥18" -> "$18" 或 "$2.99" -> "¥2.99"
 */
export function replaceCurrencySymbol(text?: string | null): string {
  if (!text) return '';
  const sym = getCurrencySymbol();
  if (sym === '$') {
    return text.replace(/¥/g, '$');
  } else {
    return text.replace(/\$/g, '¥');
  }
}

/**
 * 格式化价格，使用当前的货币符号，不改变数字
 */
export function formatDisplayPrice(
  price: string | number | undefined | null,
  free?: boolean,
  _fallbackCurrency?: string
): string {
  if (free) return '';
  if (price === undefined || price === null || price === '') return '';
  const str = String(price).trim();
  if (str === '免费' || str.toLowerCase() === 'free') return str;

  const currentSym = getCurrencySymbol();

  if (str.includes('¥') || str.includes('$')) {
    return str.replace(/[¥$]/g, currentSym);
  }

  if (/^[0-9]/.test(str)) {
    return `${currentSym}${str}`;
  }

  return str;
}
