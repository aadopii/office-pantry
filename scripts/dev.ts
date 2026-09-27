import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
if (!process.env.PANTRY_REQUESTER?.trim()) {
  console.error('Set PANTRY_REQUESTER in .env to the trusted local operator identity.'); process.exit(1);
}
const child = spawn(process.execPath, ['node_modules/eve/bin/eve.js', 'dev', '--no-default-extensions', '--name', 'Office Pantry', '--host', '127.0.0.1', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, PANTRY_DATA_DIR: resolve(process.env.PANTRY_DATA_DIR ?? '.pantry'), EVE_TELEMETRY_DISABLED: '1' },
});
child.on('exit', code => process.exit(code ?? 1));
