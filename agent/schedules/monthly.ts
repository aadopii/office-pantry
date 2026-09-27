import { defineSchedule } from 'eve/schedules';
import { openStore } from '../../lib/runtime.ts';
import { previousMonth, publishReport } from '../../lib/reports.ts';

export default defineSchedule({
  cron: '0 9 1 * *',
  run() {
    if (process.env.PANTRY_SCHEDULE_DISABLED === '1') return;
    const store = openStore();
    try { publishReport(store, previousMonth(), process.env.PANTRY_MODE === 'fake' ? 'fake' : 'live', 'schedule'); }
    finally { store.close(); }
  },
});
