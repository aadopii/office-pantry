import { createCatenaClient, ApiError, IntentSubmitError, type CatenaClient, type IntentResult, type Policy } from '@catena/sdk';
import { dollars, POLICY, usdMicros } from './catalog.ts';
import { PaymentError } from './pantry.ts';
import type { PaymentTransport, Purchase, PolicyEvidence, PaymentResult } from './types.ts';
export function checkPolicy(policy: Policy, accountId: string): PolicyEvidence {
  if (policy.kind === 'override') throw new Error('Temporary provider policy overrides are not accepted for this demo.');
  const sends = policy.policyCapabilities.filter(c => c.capability === 'send' && c.accountId === accountId);
  // Multiple grants have undocumented combination semantics: refuse to guess.
  if (sends.length !== 1) throw new Error('Expected exactly one provider send capability for the selected account.');
  const rules = sends[0]!.rules;
  const amountRule = (type: string, cents: number) => rules.find(r => !r.counterpartyId && r.ruleType === type && r.action === 'block' && r.thresholdAmount?.asset_id === 'USD' && usdMicros(r.thresholdAmount.amount) <= BigInt(cents) * 10_000n);
  const monthly = amountRule('monthly_amount', POLICY.monthlyCents);
  const purchase = amountRule('per_transaction_amount', POLICY.purchaseCents);
  if (!monthly || !purchase) throw new Error('Catena must have account-wide USD block rules: monthly amount at most $500.00 and per-transaction amount at most $0.90. Configure the dedicated agent policy in the console.');
  return { checkedAt: new Date().toISOString(), id: policy.id, version: policy.version, monthlyRuleId: monthly.id, purchaseRuleId: purchase.id, approvalRuleIds: rules.filter(r => r.action === 'require_approval').map(r => r.id) };
}
function result(intent: IntentResult): PaymentResult {
  const transaction = intent.data?.transaction;
  const transactionId = transaction && typeof transaction === 'object' && 'id' in transaction && typeof transaction.id === 'string' ? transaction.id : undefined;
  const completedAt = transaction && typeof transaction === 'object' && 'completedAt' in transaction && typeof transaction.completedAt === 'string' && Number.isFinite(Date.parse(transaction.completedAt)) ? new Date(transaction.completedAt).toISOString() : undefined;
  return { id: intent.id, status: intent.status, reasons: intent.reasons, movementNextStep: intent.movement?.nextStep, crossChain: Boolean(intent.crossChain), transactionId, completedAt };
}
export function action(p: Purchase) {
  return { type: 'send' as const, accountId: p.destination.accountId, counterpartyRailId: p.destination.railId,
    amount: dollars(p.amountCents), method: 'on-chain' as const, description: `Office Pantry ${p.id}` };
}
export class CatenaTransport implements PaymentTransport {
  readonly mode = 'live' as const;
  constructor(readonly client: CatenaClient = createCatenaClient({ appInfo: { name: 'office-pantry', version: '0.1.0' }, timeout: 20_000 })) {}
  async inspect(p: Purchase): Promise<PolicyEvidence> {
    try {
      if (!p.destination.accountId || !p.destination.railId || !/^0x[0-9a-fA-F]{40}$/.test(p.destination.address)) throw new Error('Configure the approved source account and wallet recipient first.');
      const [policy, accounts, counterparties, balance] = await Promise.all([
        this.client.getPolicy(), this.client.listAccounts(), this.client.listCounterparties(), this.client.getAccountBalance(p.destination.accountId),
      ]);
      const evidence = checkPolicy(policy, p.destination.accountId);
      if (!accounts.accounts.some(a => a.id === p.destination.accountId && a.currency === 'USD')) throw new Error('The configured USD source account is unavailable.');
      const counterparty = counterparties.counterparties.find(c => c.id === p.destination.counterpartyId);
      const rail = counterparty?.rails.find(r => r.id === p.destination.railId);
      if (!rail || rail.type !== 'wallet' || rail.walletAddress?.toLowerCase() !== p.destination.address.toLowerCase() || rail.network !== p.destination.network) throw new Error('Approved recipient rail, address, or network changed; no payment submitted.');
      if (policy.counterpartyRules?.mode !== 'restricted' || !policy.counterpartyRules.allowedCounterparties?.includes(p.destination.counterpartyId)) throw new Error('Use a provider policy restricted to approved counterparties.');
      const available = balance.balances?.byNetwork?.find(b => b.network === p.destination.network)?.available;
      if (!available || !['USD', 'USDC'].includes(available.asset_id) || usdMicros(available.amount) < BigInt(p.amountCents) * 10_000n) throw new Error('Verified same-network available funds are insufficient or unavailable; cross-chain fallback is disabled.');
      return evidence;
    } catch (error) {
      if (error instanceof ApiError) throw new Error(`Catena preflight unavailable (${error.code}). No payment submitted.`);
      if (error instanceof Error && !('code' in error)) throw error;
      throw new Error('Catena preflight unavailable. No payment submitted.');
    }
  }
  async submit(p: Purchase): Promise<PaymentResult> {
    if (!Number.isSafeInteger(p.amountCents) || p.amountCents <= 0 || p.amountCents > POLICY.purchaseCents || p.amountCents >= 100) throw new PaymentError('not-submitted', 'invalid_demo_amount');
    try { return result(await this.client.submitIntent({ action: action(p), idempotencyKey: p.idempotencyKey })); }
    catch (error) {
      if (error instanceof IntentSubmitError) throw new PaymentError(error.outcome, 'intent_submission_interrupted', error.intentId);
      // A generic HTTP error may follow signing/submission. Do not free its reservation.
      throw new PaymentError('unknown', error instanceof ApiError ? error.code ?? 'api_error' : 'transport_interrupted');
    }
  }
  async get(id: string) { return result(await this.client.getIntent(id)); }
}
