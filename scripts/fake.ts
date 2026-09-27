import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
const [operation = 'dev', ...args] = process.argv.slice(2);
if (!['dev', 'eval', 'report', 'ledger'].includes(operation)) throw new Error('Unknown fake operation.');
if (operation === 'eval' && args.some(arg => arg === '--url' || arg.startsWith('--url='))) throw new Error('Evals must use their isolated local server.');
const directory = operation === 'eval' ? mkdtempSync(join(tmpdir(), 'office-pantry-evals-')) : resolve('.pantry-demo');
mkdirSync(directory, { recursive: true, mode: 0o700 });
writeFileSync(join(directory, '.fake-payments-only'), 'No real payments.\n', { mode: 0o600 });
const env = { ...process.env, PANTRY_MODE: 'fake', PANTRY_DATA_DIR: directory, PANTRY_REQUESTER: 'demo-operator', EVE_TELEMETRY_DISABLED: '1' };
for (const key of Object.keys(env)) if (key.startsWith('CATENA_')) delete env[key as keyof typeof env];
// Empty overrides also prevent Eve's dotenv loader from supplying live credentials.
Object.assign(env, { CATENA_SECRET_KEY: '', CATENA_ACCOUNT_ID: '', CATENA_COUNTERPARTY_ID: '', CATENA_RAIL_ID: '', CATENA_RECIPIENT_ADDRESS: '', CATENA_NETWORK: '' });
const command = operation === 'eval' ? ['node_modules/eve/bin/eve.js', 'eval', '--max-concurrency', '1', ...args]
  : operation === 'dev' ? ['--import', 'tsx', 'scripts/dev.ts', '--port', '2002', ...args]
  : ['--import', 'tsx', `scripts/${operation}.ts`, ...args];
console.log(`SIMULATION ONLY. No real payments. Storage: ${directory}`);
const child = spawn(process.execPath, command, { stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
