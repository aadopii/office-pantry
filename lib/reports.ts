import { POLICY, dollars } from './catalog.ts';
import { reserves } from './pantry.ts';
import type { Store } from './store.ts';
import type { Purchase } from './types.ts';

export function monthBounds(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Use a UTC reporting month in YYYY-MM format.');
  const start = new Date(`${period}-01T00:00:00.000Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString(), endExclusive: end.toISOString() };
}
export function previousMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}
export function makeReport(purchases: Purchase[], period: string, mode: 'live' | 'fake', now = new Date()) {
  const bounds = monthBounds(period);
  const all = purchases.filter(p => p.mode === mode);
  const settled = all.filter(p => p.status === 'paid' && p.paidAt && p.paidAt >= bounds.start && p.paidAt < bounds.endExclusive);
  const outstanding = all.filter(p => reserves(p) && p.status !== 'paid');
  const committed = all.filter(reserves).reduce((sum, p) => sum + p.amountCents, 0);
  const settledCents = settled.reduce((sum, p) => sum + p.amountCents, 0);
  const pendingCents = outstanding.reduce((sum, p) => sum + p.amountCents, 0);
  return {
    period, ...bounds, timezone: 'UTC', generatedAt: now.toISOString(), mode,
    simulated: mode === 'fake', settledUSD: dollars(settledCents),
    purchases: settled.map(p => ({ purchaseId: p.id, requester: p.requester, vendor: p.vendor, items: p.items, amountUSD: dollars(p.amountCents), rationale: p.rationale, completedAt: p.paidAt, timestampBasis: p.paidAtBasis ?? 'observed_completion' })),
    outstandingUSD: dollars(pendingCents),
    outstanding: outstanding.map(p => ({ purchaseId: p.id, vendor: p.vendor, amountUSD: dollars(p.amountCents), status: p.status, createdAt: p.createdAt })),
    commitmentBasis: 'Current unresolved commitments across all months as of generatedAt, including prepared and approval-waiting purchases. This is not a historical month-end snapshot.',
    calendarComparisonRemainingUSD: dollars(Math.max(0, POLICY.monthlyCents - settledCents)),
    calendarComparisonBasis: '$500 minus this UTC calendar month\'s completed purchases only. Not available money or permission to spend.',
    conservativeRemainingUSD: dollars(Math.max(0, POLICY.monthlyCents - committed)),
    conservativeBasis: '$500 minus all locally recorded completed purchases and current unresolved commitments, across all months. No automatic reset.',
    providerRemainingUSD: null,
    providerBasis: 'Catena enforces its monthly policy independently. Its window and usage are unverified; this report does not establish provider-window parity or account funding.',
    completionBasis: 'Use the provider completion timestamp when supplied; otherwise the first local observation of completion. Reconciliation can update a report without creating a duplicate.',
  };
}
export function publishReport(store: Store, period: string, mode: 'live' | 'fake', source: 'manual' | 'schedule', now = new Date()) {
  return store.transaction(() => {
    const report = makeReport(store.all(), period, mode, now);
    store.db.prepare('INSERT INTO reports VALUES(?,?,?) ON CONFLICT(period,mode) DO UPDATE SET body=excluded.body').run(period, mode, JSON.stringify(report));
    store.db.prepare('INSERT INTO report_runs(period,mode,source,at) VALUES(?,?,?,?)').run(period, mode, source, now.toISOString());
    return report;
  });
}
export function reportInbox(store: Store, mode: 'live' | 'fake') {
  return store.db.prepare('SELECT body FROM reports WHERE mode=? ORDER BY period DESC').all(mode).map(r => JSON.parse(r.body as string));
}
