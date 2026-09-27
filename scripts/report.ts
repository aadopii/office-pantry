import { openStore } from '../lib/runtime.ts';
import { publishReport, reportInbox } from '../lib/reports.ts';
const [period] = process.argv.slice(2);
const store = openStore();
const mode = process.env.PANTRY_MODE === 'fake' ? 'fake' : 'live';
try { console.log(JSON.stringify(period === '--list' ? reportInbox(store, mode) : publishReport(store, period ?? new Date().toISOString().slice(0, 7), mode, 'manual'), null, 2)); }
finally { store.close(); }
