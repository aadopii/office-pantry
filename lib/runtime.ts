import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Store } from './store.ts';
import { Pantry, type Consent } from './pantry.ts';
import { CatenaTransport } from './catena.ts';
import type { Destination, PaymentTransport } from './types.ts';
import { FakeTransport, fakeDestination, requireFakeStorage } from './fake.ts';
export function destination(): Destination {
  return { accountId: process.env.CATENA_ACCOUNT_ID ?? '', counterpartyId: process.env.CATENA_COUNTERPARTY_ID ?? '', railId: process.env.CATENA_RAIL_ID ?? '', address: process.env.CATENA_RECIPIENT_ADDRESS ?? '', network: process.env.CATENA_NETWORK ?? 'base' };
}
export function dataDir() { return resolve(process.env.PANTRY_DATA_DIR ?? '.pantry'); }
export function openStore() { return new Store(resolve(dataDir(), 'ledger.sqlite')); }
let singleton: Pantry | undefined;
export function pantry(): Pantry {
  if (singleton) return singleton;
  if (process.env.PANTRY_MODE === 'fake') {
    requireFakeStorage(dataDir());
    const store = openStore();
    singleton = new Pantry(store, new FakeTransport(store), fakeDestination);
    return singleton;
  }
  const consentPath = resolve(dataDir(), 'live-consent.json');
  const consent = existsSync(consentPath) ? JSON.parse(readFileSync(consentPath, 'utf8')) as Consent : undefined;
  const disabled: PaymentTransport = { mode: 'disabled', async inspect() { throw new Error('Live payments are disabled. Configure Catena and obtain the exact test allowance confirmation.'); }, async submit() { throw new Error('Disabled'); }, async get() { throw new Error('Disabled'); } };
  const transport = process.env.PANTRY_MODE === 'live' ? new CatenaTransport() : disabled;
  singleton = new Pantry(openStore(), transport, destination(), consent);
  return singleton;
}
