import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
// The built Eve/Nitro process owns the cadence. Dev mode never fires cron.
const child = spawn(process.execPath, ['node_modules/eve/bin/eve.js', 'start', '--host', '127.0.0.1', '--port', process.env.PANTRY_SCHEDULE_PORT ?? '2001'], {
  stdio: 'inherit', env: { ...process.env, TZ: 'UTC', PANTRY_MODE: process.env.PANTRY_MODE === 'fake' ? 'fake' : 'disabled', PANTRY_DATA_DIR: resolve(process.env.PANTRY_DATA_DIR ?? '.pantry'), EVE_TELEMETRY_DISABLED: '1' },
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
