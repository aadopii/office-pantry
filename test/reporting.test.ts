import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../lib/store.ts';
import { Pantry, PaymentError, purchaseReview, validateReview } from '../lib/pantry.ts';
import { FakeTransport, fakeDestination } from '../lib/fake.ts';
import { makeReport, monthBounds, previousMonth, publishReport, reportInbox } from '../lib/reports.ts';

function fixture(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(join(tmpdir(), 'pantry-report-test-'));
  const store = new Store(join(dir, 'ledger.sqlite'));
  const transport = new FakeTransport(store);
  const pantry = new Pantry(store, transport, fakeDestination);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const prepare = (id: string, itemId = 'premium-coffee', quantity = 1) => {
    store.capture({ id, sessionId: 'test', requester: 'test-operator', original: 'Fixture purchase', at: new Date().toISOString() });
    return pantry.prepare(id, [{ itemId, quantity }], 'Fixture purchase.');
  };
  return { store, transport, pantry, prepare };
}
test('exact cap and approval boundaries are deterministic', t => {
  const f = fixture(t);
  const fifty = f.prepare('fifty', 'premium-coffee', 2);
  assert.equal(fifty.amountCents, 50); assert.equal(fifty.approval.required, false);
  const fiftyOne = f.prepare('fifty-one', 'energy-drink', 17);
  assert.equal(fiftyOne.amountCents, 51);
  assert.equal(f.pantry.approvalGate(fiftyOne.id, 'test', 'a51'), 'user-approval');
  assert.equal(f.prepare('ninety', 'energy-drink', 30).status, 'prepared');
  assert.equal(f.prepare('ninety-three', 'energy-drink', 31).status, 'refused');
});
test('UTC report boundaries use completion, not order or polling time', t => {
  const f = fixture(t);
  const prior = f.prepare('prior'); prior.status = 'paid'; prior.paidAt = '2026-08-31T23:59:59.999Z'; f.store.save(prior);
  const first = f.prepare('first'); first.status = 'paid'; first.paidAt = '2026-09-01T00:00:00.000Z'; f.store.save(first);
  const next = f.prepare('next'); next.status = 'paid'; next.paidAt = '2026-10-01T00:00:00.000Z'; f.store.save(next);
  const report = makeReport(f.store.all(), '2026-09', 'fake', new Date('2026-10-02T00:00:00Z'));
  assert.equal(report.settledUSD, '0.25'); assert.equal(report.purchases[0]?.purchaseId, first.id);
  assert.equal(report.conservativeRemainingUSD, '499.25'); assert.equal(report.providerRemainingUSD, null);
  assert.equal(previousMonth(new Date('2026-01-01T00:00:00Z')), '2025-12');
  assert.equal(monthBounds('2024-02').endExclusive, '2024-03-01T00:00:00.000Z');
  assert.throws(() => monthBounds('2026-13'));
});
test('uncertain commitments stay reserved; definitive failures release them; periods do not reset the guard', async t => {
  const f = fixture(t);
  const prior = f.prepare('older'); prior.status = 'paid'; prior.amountCents = 49_940; prior.paidAt = '2025-01-01T00:00:00.000Z'; f.store.save(prior);
  const pending = f.prepare('pending', 'snack-box'); pending.status = 'uncertain'; pending.intentId = 'fake-uncertain'; pending.submittedAt = new Date().toISOString(); f.store.save(pending);
  assert.equal(f.prepare('blocked').status, 'refused');
  let report = makeReport(f.store.all(), '2026-09', 'fake');
  assert.equal(report.settledUSD, '0.00'); assert.equal(report.outstandingUSD, '0.60'); assert.equal(report.conservativeRemainingUSD, '0.00');
  f.transport.get = async () => ({ id: 'fake-uncertain', status: 'failed', reasons: ['Definitive test failure.'] });
  await f.pantry.reconcile(pending.id);
  report = makeReport(f.store.all(), '2026-09', 'fake'); assert.equal(report.outstandingUSD, '0.00'); assert.equal(report.conservativeRemainingUSD, '0.60');
  assert.equal(f.prepare('available').status, 'prepared');
});
test('report inbox refreshes one entry per period and keeps schedule-run evidence', t => {
  const f = fixture(t); f.prepare('pending');
  publishReport(f.store, '2026-09', 'fake', 'manual');
  publishReport(f.store, '2026-09', 'fake', 'schedule');
  assert.equal(reportInbox(f.store, 'fake').length, 1);
  assert.equal(reportInbox(f.store, 'live').length, 0);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM report_runs WHERE source='schedule'").get()!.n, 1);
});
test('provider completion time survives delayed reconciliation and repeat checks', async t => {
  const f = fixture(t); const p = f.prepare('delayed');
  f.transport.submit = async () => ({ id: 'fake-delayed', status: 'processing', reasons: [] });
  await f.pantry.pay(p.id, 'test');
  f.transport.get = async () => ({ id: 'fake-delayed', status: 'completed', completedAt: '2026-08-31T23:59:59.000Z', reasons: [] });
  await f.pantry.reconcile(p.id); await f.pantry.reconcile(p.id);
  assert.equal(f.store.get(p.id).paidAt, '2026-08-31T23:59:59.000Z');
  assert.equal(f.store.get(p.id).paidAtBasis, 'provider_completion');
  assert.equal(makeReport(f.store.all(), '2026-09', 'fake').settledUSD, '0.00');
});
test('unknown create recovery reuses the saved key and ordinary retries do not resubmit', async t => {
  const f = fixture(t); const p = f.prepare('unknown');
  let calls = 0;
  f.transport.submit = async purchase => { calls++; assert.equal(purchase.idempotencyKey, p.idempotencyKey); if (calls === 1) throw new PaymentError('unknown', 'timeout'); return { id: 'fake-recovered', status: 'completed', reasons: [] }; };
  assert.equal((await f.pantry.pay(p.id, 'test')).status, 'uncertain');
  assert.equal((await f.pantry.pay(p.id, 'test')).status, 'uncertain'); assert.equal(calls, 1);
  assert.equal((await f.pantry.recoverUnknown(p.id)).status, 'paid'); assert.equal(calls, 2);
  assert.equal((await f.pantry.pay(p.id, 'test')).status, 'paid'); assert.equal(calls, 2);
});

test('approval prompt review must match the saved amount, items and recipient', t => {
  const f = fixture(t); const p = f.prepare('review', 'snack-box');
  const review = purchaseReview(p);
  assert.match(review, /USD 0\.60/); assert.match(review, /1 x Team snack box/);
  assert.ok(review.includes(p.destination.address));
  assert.doesNotThrow(() => validateReview(p, review));
  assert.throws(() => validateReview(p, review.replace('0.60', '0.06')));
  assert.throws(() => validateReview(p, review.replace(p.destination.address, 'another recipient')));
});
