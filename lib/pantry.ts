import { createHash } from 'node:crypto';
import { CATALOG, dollars, POLICY, price, type Line } from './catalog.ts';
import { Store } from './store.ts';
import type { Destination, PaymentResult, PaymentTransport, Purchase, Status } from './types.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const terminal: Status[] = ['paid', 'refused', 'failed', 'rejected'];
export const reserves = (p: Purchase) => !['refused', 'failed', 'rejected'].includes(p.status);
export type Consent = { accountId: string; railId: string; address: string; network: string; totalCents: number; allowedAmountsCents: number[]; confirmedAt: string };
export class PaymentError extends Error {
  constructor(readonly outcome: 'not-submitted' | 'unknown', readonly code: string, readonly intentId?: string) { super(code); }
}
export class Pantry {
  constructor(readonly store: Store, readonly transport: PaymentTransport, readonly destination: Destination,
    readonly consent?: Consent, readonly now = () => new Date()) {}
  prepare(requestId: string, lines: Line[], rationale: string): Purchase {
    return this.store.transaction(() => {
      const existing = this.store.forRequest(requestId);
      if (existing) return existing; // One immutable purchase per inbound request, even across tool replays.
      const request = this.store.request(requestId);
      let priced: { items: ReturnType<typeof price>['items']; vendor: string; amountCents: number } = { items: [], vendor: '', amountCents: 0 };
      let reason = '';
      try {
        priced = price(lines);
        if (!rationale.trim() || rationale.length > 280) throw new Error('Provide a short business rationale (1–280 characters).');
        if (priced.amountCents > POLICY.purchaseCents) reason = `$${dollars(priced.amountCents)} exceeds the $${dollars(POLICY.purchaseCents)} hard purchase cap. Approval cannot override this rule.`;
      } catch (error) { reason = error instanceof Error ? error.message : 'Invalid purchase.'; }
      const at = this.now().toISOString();
      const id = `pantry_${hash(requestId).slice(0, 24)}`;
      const p: Purchase = {
        id, requestId, sessionId: request.sessionId, requester: request.requester, originalRequest: request.original,
        rationale: rationale.slice(0, 280), ...priced, currency: 'USD', destination: { ...this.destination },
        digest: '', idempotencyKey: `office-pantry-${hash(requestId)}`,
        status: reason ? 'refused' : 'prepared', explanation: reason || 'Catalog and purchase cap checked.',
        createdAt: at, updatedAt: at, mode: this.transport.mode,
        approval: { required: priced.amountCents > POLICY.approvalAboveCents, outcome: priced.amountCents > POLICY.approvalAboveCents ? 'pending' : 'not_required' },
        policy: { ...POLICY, window: 'unverified-lifetime' },
      };
      p.digest = hash(JSON.stringify({ items: p.items, amountCents: p.amountCents, destination: p.destination, currency: p.currency, rationale: p.rationale, requestId }));
      if (!reason) {
        const budgetReason = this.budgetReason(p);
        if (budgetReason) { p.status = 'refused'; p.explanation = budgetReason; }
      }
      if (p.status === 'refused') p.approval.outcome = 'not_applicable';
      this.store.save(p);
      return p;
    });
  }
  budgetReason(p: Purchase): string | undefined {
    // Until Catena's monthly boundary is confirmed, do not reset local spend.
    // This is a conservative lifetime guard, explicitly NOT verified provider-window accounting.
    const committed = this.store.all().filter(other => other.id !== p.id && other.mode === p.mode && reserves(other)).reduce((n, other) => n + other.amountCents, 0);
    if (committed + p.amountCents > POLICY.monthlyCents) return `The $500.00 budget guard has only $${dollars(Math.max(0, POLICY.monthlyCents - committed))} available, including in-flight purchases. Monthly reset is disabled until Catena's window is confirmed.`;
  }
  owned(id: string, sessionId: string) {
    const p = this.store.get(id);
    if (p.sessionId !== sessionId) throw new Error('This purchase belongs to another session.');
    return p;
  }
  approvalGate(id: string, sessionId: string, callId: string): 'user-approval' | 'not-applicable' | { type: 'denied'; reason: string } {
    return this.store.transaction(() => {
      const p = this.owned(id, sessionId);
      if (['refused', 'rejected', 'failed'].includes(p.status)) return { type: 'denied', reason: p.explanation };
      if (terminal.includes(p.status) || ['submitting', 'pending', 'processing', 'uncertain'].includes(p.status)) return 'not-applicable';
      const reason = this.budgetReason(p);
      if (reason) { p.status = 'refused'; p.explanation = reason; p.approval.outcome = 'not_applicable'; this.store.save(p); return { type: 'denied', reason }; }
      if (!p.approval.required || (p.approval.outcome === 'approved' && p.approval.digest === p.digest)) return 'not-applicable';
      p.status = 'awaiting_approval'; p.explanation = `Approve exactly $${dollars(p.amountCents)} to ${p.vendor} at ${p.destination.address || '(recipient not configured)'}.`;
      p.updatedAt = this.now().toISOString(); this.store.save(p); this.store.bind(callId, p.id);
      return 'user-approval';
    });
  }
  // Called only by Eve's authenticated approval lifecycle, never by a model tool.
  approve(id: string, sessionId: string, by: string, requestId: string) {
    return this.store.transaction(() => {
      const p = this.owned(id, sessionId);
      if (!['awaiting_approval', 'approved'].includes(p.status)) throw new Error('Purchase is not awaiting approval.');
      p.approval = { required: true, outcome: 'approved', by, requestId, digest: p.digest, at: this.now().toISOString() };
      p.status = 'approved'; p.updatedAt = this.now().toISOString(); this.store.save(p); return p;
    });
  }
  reject(requestId: string, by: string) {
    this.store.transaction(() => {
      const id = this.store.approvalPurchase(requestId); if (!id) return;
      const p = this.store.get(id);
      if (!['awaiting_approval', 'approved'].includes(p.status)) return;
      p.status = 'rejected'; p.explanation = 'The local operator rejected this exact purchase; no payment submitted.';
      p.approval = { required: true, outcome: 'rejected', by, requestId, digest: p.digest, at: this.now().toISOString() };
      p.updatedAt = this.now().toISOString(); this.store.save(p);
    });
  }
  checkConsent(p: Purchase) {
    if (p.mode !== 'live') return;
    const c = this.consent;
    if (!c || !c.confirmedAt || !Number.isSafeInteger(c.totalCents) || c.totalCents <= 0 || c.totalCents > 200 ||
      c.accountId !== p.destination.accountId || c.railId !== p.destination.railId || c.address.toLowerCase() !== p.destination.address.toLowerCase() || c.network !== p.destination.network || !c.allowedAmountsCents.includes(p.amountCents)) {
      throw new Error('Live payment disabled: exact recipient, amounts, and project allowance need operator confirmation.');
    }
    const attempts = this.store.all().filter(other => other.mode === 'live' && other.id !== p.id && other.submittedAt);
    // Each entry authorizes one payment, not unlimited repeats of that price.
    const slots = c.allowedAmountsCents.filter(amount => amount === p.amountCents).length;
    if (attempts.filter(other => other.amountCents === p.amountCents).length >= slots) throw new Error('The authorized test payment for this amount has already been attempted. Reconcile the original purchase.');
    const used = attempts.reduce((n, other) => n + other.amountCents, 0);
    if (used + p.amountCents > c.totalCents) throw new Error('Cumulative project test allowance exhausted (including uncertain attempts).');
  }
  async pay(id: string, sessionId: string): Promise<Purchase> {
    let p = this.owned(id, sessionId);
    if (terminal.includes(p.status)) return p;
    if (['submitting', 'uncertain', 'pending', 'processing'].includes(p.status)) return this.reconcile(id);
    if (p.approval.required && (p.approval.outcome !== 'approved' || p.approval.digest !== p.digest)) return p;
    if (p.mode !== this.transport.mode) throw new Error('Purchase mode cannot change; use its original runtime.');
    try {
      this.checkConsent(p);
      const evidence = await this.transport.inspect(p); // Fresh provider checks after the approval pause.
      const claimed = this.store.transaction(() => {
        p = this.store.get(id);
        if (!['prepared', 'approved'].includes(p.status)) return false;
        const reason = this.budgetReason(p);
        if (reason) { p.status = 'refused'; p.explanation = reason; this.store.save(p); return false; }
        this.checkConsent(p);
        p.policy.provider = evidence; p.status = 'submitting'; p.submittedAt = this.now().toISOString(); p.updatedAt = p.submittedAt;
        p.explanation = 'Submission started; amount remains reserved until a definitive outcome.';
        this.store.save(p); return true;
      });
      if (!claimed) return p;
    } catch (error) {
      // Inspection is read-only; a failure here cannot have moved money.
      return this.store.transaction(() => {
        p = this.store.get(id);
        if (['prepared', 'approved'].includes(p.status)) { p.explanation = error instanceof Error ? error.message : 'Preflight unavailable.'; p.updatedAt = this.now().toISOString(); this.store.save(p); }
        return p;
      });
    }
    return this.submitSaved(p);
  }
  private async submitSaved(p: Purchase): Promise<Purchase> {
    try { return this.apply(p.id, await this.transport.submit(p)); }
    catch (error) {
      return this.store.transaction(() => {
        const latest = this.store.get(p.id);
        if (terminal.includes(latest.status)) return latest;
        latest.status = error instanceof PaymentError && error.outcome === 'not-submitted' ? 'failed' : 'uncertain';
        latest.intentId = error instanceof PaymentError ? error.intentId ?? latest.intentId : latest.intentId;
        latest.explanation = error instanceof PaymentError ? `Catena ${error.code}; ${error.outcome}.` : 'Payment outcome uncertain; reconcile before any retry. Raw provider errors are not logged.';
        latest.updatedAt = this.now().toISOString(); this.store.save(latest); return latest;
      });
    }
  }
  async reconcile(id: string): Promise<Purchase> {
    const p = this.store.get(id);
    if (!p.intentId) return p;
    try { return this.apply(id, await this.transport.get(p.intentId)); }
    catch { return p; } // Keep the reservation and last known state on a read failure.
  }
  // Operator-only recovery command; never exposed to the model. Same action/key after a create timeout.
  async recoverUnknown(id: string): Promise<Purchase> {
    const p = this.store.get(id);
    if (p.intentId) return this.reconcile(id);
    if (!['submitting', 'uncertain'].includes(p.status)) return p;
    this.checkConsent(p);
    return this.submitSaved(p);
  }
  private apply(id: string, result: PaymentResult): Purchase {
    return this.store.transaction(() => {
      const p = this.store.get(id);
      p.intentId = result.id; p.providerStatus = result.status; p.movementNextStep = result.movementNextStep; p.transactionId = result.transactionId;
      const mapped: Record<string, Status> = { completed: 'paid', pending: 'pending', processing: 'processing', blocked: 'refused', failed: 'failed' };
      let status = mapped[result.status] ?? 'uncertain';
      if (result.crossChain) status = 'uncertain'; // Cross-chain operation is outside this application's scope.
      if (result.movementNextStep && result.movementNextStep !== 'done' && status === 'paid') status = 'uncertain';
      if (result.movementNextStep === 'blocked') status = 'refused';
      // Don't let an older concurrent poll regress a completed payment.
      if (p.status === 'paid' && status !== 'failed') {
        if (status === 'paid' && result.completedAt) { p.paidAt = result.completedAt; p.paidAtBasis = 'provider_completion'; this.store.save(p); }
        return p;
      }
      p.status = status; p.updatedAt = this.now().toISOString();
      if (status === 'paid') { p.paidAt = result.completedAt ?? p.updatedAt; p.paidAtBasis = result.completedAt ? 'provider_completion' : 'observed_completion'; }
      p.explanation = result.crossChain ? 'Unexpected cross-chain payment: operator reconciliation required; no automatic continuation.' : result.reasons.join('; ').slice(0, 1000) || ({paid:'Catena reports the send completed.',pending:'Catena is waiting for human approval. Use the Catena console; the agent cannot approve.',processing:'Catena is processing; a human-approved payment may still need an admin signature.',refused:'Catena blocked or an operator declined the payment.',failed:'Catena reports failure, expiry, or reversal.',uncertain:'The payment is not confirmed complete.'} as Record<string,string>)[status]!;
      this.store.save(p); return p;
    });
  }
}
export function purchaseReview(p: Purchase) {
  return `USD ${dollars(p.amountCents)} | ${p.items.map(i => `${i.quantity} x ${i.name}`).join(', ')} | ${p.vendor} | to ${p.destination.address || 'not configured'} on ${p.destination.network}`;
}
export function validateReview(p: Purchase, review: string) {
  if (review !== purchaseReview(p)) throw new Error('Approval review does not match the saved purchase. Copy approvalReview exactly from prepare_purchase or purchase_status.');
}
export function summary(p: Purchase) {
  return { purchaseId: p.id, approvalReview: purchaseReview(p), requester: p.requester, vendor: p.vendor, items: p.items.map(i => ({item: i.name, quantity: i.quantity, total: dollars(i.totalCents)})), amount: dollars(p.amountCents), currency: p.currency, recipient: p.destination.address || 'not configured', network: p.destination.network, rationale: p.rationale, status: p.status, explanation: p.explanation, approval: p.approval.outcome, intentId: p.intentId, simulated: p.mode === 'fake' };
}
export { CATALOG };
