import { createCatenaClient, ApiError } from '@catena/sdk';
import { destination } from '../lib/runtime.ts';
import { checkPolicy } from '../lib/catena.ts';
if (!process.env.CATENA_SECRET_KEY) { console.error('CATENA_SECRET_KEY is not configured in ignored .env. No payment attempted.'); process.exit(1); }
try {
  const client=createCatenaClient({appInfo:{name:'office-pantry',version:'0.1.0'},timeout:20_000});
  const [agent,policy,accounts,counterparties]=await Promise.all([client.whoami(),client.getPolicy(),client.listAccounts(),client.listCounterparties()]);
  const d=destination();
  console.log(JSON.stringify({agent:{id:agent.id,status:agent.status},policy:{id:policy.id,name:policy.name,version:policy.version,kind:policy.kind,capabilities:policy.policyCapabilities,counterpartyRules:policy.counterpartyRules},accounts:accounts.accounts,counterparties:counterparties.counterparties},null,2));
  if (d.accountId) { console.log(JSON.stringify({policyCheck:checkPolicy(policy,d.accountId),balance:await client.getAccountBalance(d.accountId)},null,2)); }
  else console.log('Select the source and approved wallet rail IDs in .env. This command is read-only.');
} catch(error) {console.error(error instanceof ApiError ? `Catena preflight failed: ${error.code ?? 'api_error'} (${error.status})` : 'Preflight failed; verify the local configuration and effective policy.');process.exitCode=1;}
