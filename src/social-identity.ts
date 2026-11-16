// A title is metadata, never a content identity.
export function socialUrl(value: string) {
  const u = new URL(value);
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const reddit = (host === 'reddit.com' || host.endsWith('.reddit.com')) && u.pathname.match(/\/comments\/([a-z0-9]+)(?:\/|$)/i);
  if (reddit) return `reddit.com/post/${reddit[1].toLowerCase()}`;
  if (host === 'redd.it' && /^\/[a-z0-9]+\/?$/i.test(u.pathname)) return `reddit.com/post/${u.pathname.split('/')[1].toLowerCase()}`;
  const post = ['x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com'].includes(host) &&
    u.pathname.match(/^\/(?:[a-z0-9_]+\/status|i\/web\/status)\/(\d+)(?:\/|$)/i);
  if (post) return `x.com/post/${post[1]}`;
  const note = host === 'xiaohongshu.com' && u.pathname.match(/^\/(?:explore|discovery\/item)\/([^/]+)/);
  return note ? `xiaohongshu.com/note/${note[1]}` : `${host}${u.pathname.replace(/\/$/, '')}`;
}
export type ReportLink = { accountId: string; externalId: string; url: string };
export type SocialRow = { id: string; accountId: string; kind: string; url?: string; externalId?: string; period: string; periodStart?: string; periodEnd: string; observedAt: string; source: string; sourceNote: string; body?: string; title?: string; articleDetails?: { bodyStatus?: 'complete' | 'empty'; author?: string; community?: string; tags?: string[] }; metrics: Record<string, number | null | undefined> };
export function socialIdentity(s: SocialRow, links: ReportLink[] = []) {
  const linked = s.url ? undefined : links.find(l => l.accountId === s.accountId && l.externalId === s.externalId)?.url;
  return JSON.stringify([s.accountId, s.kind, s.kind === 'account' ? '' : s.url || linked ? socialUrl((s.url || linked)!) : s.externalId || s.id]);
}
export function hasCompleteBody(s: Pick<SocialRow, 'body' | 'articleDetails'>) {
  return !!s.body?.trim() || (s.body === '' && s.articleDetails?.bodyStatus === 'empty');
}
export function summarizeSocial<T extends SocialRow>(rows: T[], links: ReportLink[] = []) {
  const groups = new Map<string, T[]>();
  const bodies = new Map<string, T>();
  for (const s of rows) if (hasCompleteBody(s)) {
    const key = socialIdentity(s, links);
    const old = bodies.get(key);
    if (!old || Date.parse(s.observedAt) > Date.parse(old.observedAt)) bodies.set(key, s);
  }
  for (const s of rows) {
    // Range snapshots must match both boundaries. Lifetime metrics may have different freshness.
    const key = JSON.stringify([socialIdentity(s, links), s.period, s.period === 'range' ? [s.periodStart, s.periodEnd] : '']);
    groups.set(key, [...(groups.get(key) || []), s]);
  }
  return [...groups.values()].map(group => {
    group.sort((a,b) => b.periodEnd.localeCompare(a.periodEnd) || Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.id.localeCompare(b.id));
    const metrics: SocialRow['metrics'] = {};
    const metricOrigins: Record<string, { source: string; sourceNote: string; observedAt: string; periodEnd: string; snapshotId: string }> = {};
    for (const s of group) for (const [k,v] of Object.entries(s.metrics)) if (v != null && metrics[k] == null) {
      metrics[k] = v;
      metricOrigins[k] = { source: s.source, sourceNote: s.sourceNote, observedAt: s.observedAt, periodEnd: s.periodEnd, snapshotId: s.id };
    }
    const first = group[0];
    const url = group.find(s => s.url)?.url || links.find(l => l.accountId === first.accountId && l.externalId === first.externalId)?.url;
    const bodyRow = bodies.get(socialIdentity(first, links));
    return { ...first, url, body: bodyRow?.body, articleDetails: bodyRow?.articleDetails || first.articleDetails, bodyObservedAt: bodyRow?.observedAt, bodyTitle: bodyRow?.title, metrics, metricOrigins, snapshotIds: group.map(s => s.id) };
  });
}
