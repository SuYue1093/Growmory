import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage and window events for node environment
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
};

const listeners = new Map();
globalThis.window = {
  addEventListener: (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  },
  removeEventListener: (type, fn) => {
    listeners.get(type)?.delete(fn);
  },
  dispatchEvent: (event) => {
    const set = listeners.get(event.type);
    if (set) {
      for (const fn of set) fn(event);
    }
    return true;
  },
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};

// Import currency functions directly from ts file
const {
  getCurrencyMode,
  getCurrencySymbol,
  toggleCurrencyMode,
  setCurrencyMode,
  formatDisplayPrice,
  replaceCurrencySymbol,
  formatMoney,
} = await import('../src/currency.ts');

test('演示后门货币符号切换：默认 CNY / ¥', () => {
  setCurrencyMode('CNY');
  assert.equal(getCurrencyMode(), 'CNY');
  assert.equal(getCurrencySymbol(), '¥');
});

test('演示后门货币符号切换：toggleCurrencyMode 在 CNY 与 USD 之间切换', () => {
  setCurrencyMode('CNY');
  const next1 = toggleCurrencyMode();
  assert.equal(next1, 'USD');
  assert.equal(getCurrencyMode(), 'USD');
  assert.equal(getCurrencySymbol(), '$');

  const next2 = toggleCurrencyMode();
  assert.equal(next2, 'CNY');
  assert.equal(getCurrencyMode(), 'CNY');
  assert.equal(getCurrencySymbol(), '¥');
});

test('formatMoney 在货币切换时不变更数值，仅切换货币符号', () => {
  const mockRate = { date: '2026-11-10', cnyPerUsd: 7.2, stale: false };
  const rawSalesUsd = 100; // 100 * 7.2 = 720

  // 1. 人民币模式
  setCurrencyMode('CNY');
  const cnyResult = formatMoney(rawSalesUsd, mockRate);
  assert.equal(cnyResult, '¥720.00');

  // 2. 切换为美元模式（后门触发）：符号变$，数字依然是 720.00，不变更数字
  setCurrencyMode('USD');
  const usdResult = formatMoney(rawSalesUsd, mockRate);
  assert.equal(usdResult, '$720.00');

  // 切回人民币模式
  setCurrencyMode('CNY');
  assert.equal(formatMoney(rawSalesUsd, mockRate), '¥720.00');
});

test('formatDisplayPrice 与 replaceCurrencySymbol 切换符号且保持数字完全不变', () => {
  // USD 模式
  setCurrencyMode('USD');
  assert.equal(replaceCurrencySymbol('¥18'), '$18');
  assert.equal(replaceCurrencySymbol('¥18 / 含内购'), '$18 / 含内购');
  assert.equal(formatDisplayPrice(18), '$18');
  assert.equal(formatDisplayPrice('18'), '$18');
  assert.equal(formatDisplayPrice('¥18'), '$18');
  assert.equal(formatDisplayPrice('免费', true), '');

  // CNY 模式
  setCurrencyMode('CNY');
  assert.equal(replaceCurrencySymbol('$18'), '¥18');
  assert.equal(replaceCurrencySymbol('$2.99 / In-App'), '¥2.99 / In-App');
  assert.equal(formatDisplayPrice(18), '¥18');
  assert.equal(formatDisplayPrice('18'), '¥18');
  assert.equal(formatDisplayPrice('$18'), '¥18');
  assert.equal(formatDisplayPrice('免费', true), '');
});
