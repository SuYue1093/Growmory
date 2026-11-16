import assert from 'node:assert/strict';
import test from 'node:test';
import { recurringReminders } from '../server/recurring-reminders.mjs';

test('recurring reminders are scoped to the platform or product and reset only on qualifying work', () => {
  const now = Date.parse('2026-11-08T00:00:00Z');
  const ago = days => new Date(now - days * 86_400_000).toISOString();
  const data = {
    products: [{ id: 'a', appStore: { appId: 'current' } }, { id: 'b' }],
    analyticsReports: [
      { productId: 'a', createdAt: ago(14), updatedAt: ago(0) },
      { createdAt: ago(0) },
    ],
    socialAnalytics: {
      accounts: [{ id: 'x', platform: 'x' }, { id: 'r', platform: 'reddit' }],
      snapshots: [{ accountId: 'x', observedAt: ago(7) }, { accountId: 'r', observedAt: ago(6) }],
    },
  };
  const success = { appId: 'current', outcome: 'success', changes: [{}], at: ago(30) };
  const events = [
    { ...success, at: ago(0), outcome: 'unconfirmed' },
    { ...success, at: ago(0), appId: 'previous' },
    { ...success, at: ago(0), changes: [] },
    success,
  ];
  const store = { read: () => ({ data }), asoEvents: () => events };
  assert.deepEqual(recurringReminders(store, now), [
    { kind: 'operations', targetId: 'x', days: 7, lastAt: ago(7) },
    { kind: 'report', targetId: 'a', days: 14, lastAt: ago(14) },
    { kind: 'aso', targetId: 'a', days: 30, lastAt: ago(30) },
    { kind: 'report', targetId: 'b', days: 14, lastAt: null },
  ]);
  data.socialAnalytics.snapshots.push({ accountId: 'x', observedAt: ago(0) });
  data.analyticsReports.push({ productId: 'a', createdAt: ago(0) });
  events.unshift({ ...success, at: ago(0) });
  assert.deepEqual(recurringReminders(store, now), [
    { kind: 'report', targetId: 'b', days: 14, lastAt: null },
  ]);
});
