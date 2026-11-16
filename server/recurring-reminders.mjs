const day = 86_400_000;
const intervals = { operations: 7, report: 14, aso: 30 };

function latest(times, now) {
  let result = 0;
  for (const time of times) {
    const value = Date.parse(time);
    if (value > result && value <= now) result = value;
  }
  return result;
}

export function recurringReminders(store, now = Date.now()) {
  const { products, analyticsReports, socialAnalytics } = store.read().data;
  const reminders = [];
  const add = (kind, targetId, times) => {
    const last = latest(times, now);
    const days = intervals[kind];
    if (!last || now - last >= days * day) {
      reminders.push({ kind, targetId, days, lastAt: last ? new Date(last).toISOString() : null });
    }
  };

  const platformByAccount = new Map(socialAnalytics?.accounts.map(a => [a.id, a.platform]));
  const snapshotsByPlatform = new Map([...new Set(platformByAccount.values())].map(platform => [platform, []]));
  for (const snapshot of socialAnalytics?.snapshots || []) {
    snapshotsByPlatform.get(platformByAccount.get(snapshot.accountId))?.push(snapshot.observedAt);
  }
  for (const [platform, times] of snapshotsByPlatform) add('operations', platform, times);

  for (const product of products) {
    add('report', product.id, (analyticsReports || []).filter(report => report.productId === product.id).map(report => report.createdAt));
    if (product.appStore?.appId) {
      add('aso', product.id, store.asoEvents(product.id)
        .filter(event => event.appId === product.appStore.appId && event.outcome === 'success' && event.changes?.length)
        .map(event => event.at));
    }
  }
  return reminders;
}
