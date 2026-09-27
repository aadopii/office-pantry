import { defineEvalConfig } from 'eve/evals';
import { dataDir, openStore } from '../lib/runtime.ts';
import { FakeTransport, requireFakeStorage } from '../lib/fake.ts';
export default defineEvalConfig({
  maxConcurrency: 1, timeoutMs: 120_000,
  setup() {
    if (process.env.PANTRY_MODE !== 'fake') throw new Error('Use npm run eval. Live or shared targets are forbidden.');
    requireFakeStorage(dataDir());
    const store = openStore(); new FakeTransport(store);
    return { store };
  },
  teardown(context) { context?.store.close(); },
});
