import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Store } from './store.ts';
import type { PaymentTransport, Purchase, PaymentResult } from './types.ts';

export function requireFakeStorage(directory: string) {
  if (resolve(directory) === resolve('.pantry') || !existsSync(resolve(directory, '.fake-payments-only'))) throw new Error('Fake payments require separate marked storage. Use npm run demo or npm run eval.');
}
export const fakeDestination = { accountId: 'fake-account', counterpartyId: 'fake-vendor', railId: 'fake-rail', address: 'FAKE RECIPIENT: no money moves', network: 'simulation' };
export class FakeTransport implements PaymentTransport {
  readonly mode = 'fake' as const;
  constructor(readonly store: Store) {
    store.db.exec('CREATE TABLE IF NOT EXISTS fake_payments(key TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS fake_attempts(id INTEGER PRIMARY KEY, key TEXT NOT NULL);');
  }
  async inspect() { return { checkedAt: new Date().toISOString(), monthlyRuleId: 'fake-monthly', purchaseRuleId: 'fake-purchase', approvalRuleIds: [] }; }
  async submit(p: Purchase): Promise<PaymentResult> {
    return this.store.transaction(() => {
      this.store.db.prepare('INSERT INTO fake_attempts(key) VALUES(?)').run(p.idempotencyKey);
      const result: PaymentResult = { id: `fake-${p.id}`, status: 'completed', reasons: ['SIMULATED payment. No real money moved.'], transactionId: `fake-txn-${p.id}`, completedAt: new Date().toISOString() };
      this.store.db.prepare('INSERT OR IGNORE INTO fake_payments VALUES(?,?)').run(p.idempotencyKey, JSON.stringify(result));
      return JSON.parse(this.store.db.prepare('SELECT body FROM fake_payments WHERE key=?').get(p.idempotencyKey)!.body as string);
    });
  }
  async get(id: string): Promise<PaymentResult> {
    const result = this.store.db.prepare('SELECT body FROM fake_payments').all().map(r => JSON.parse(r.body as string) as PaymentResult).find(r => r.id === id);
    if (!result) throw new Error('Unknown simulated payment.');
    return result;
  }
}
