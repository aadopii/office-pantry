import type { price } from './catalog.ts';
export type Status = 'refused' | 'prepared' | 'awaiting_approval' | 'approved' | 'rejected' | 'submitting' | 'pending' | 'processing' | 'paid' | 'failed' | 'uncertain';
export type Destination = { accountId: string; counterpartyId: string; railId: string; address: string; network: string };
export type Purchase = {
  id: string; requestId: string; sessionId: string; requester: string; originalRequest: string;
  rationale: string; vendor: string; items: ReturnType<typeof price>['items']; amountCents: number; currency: 'USD';
  destination: Destination; digest: string; idempotencyKey: string;
  status: Status; explanation: string; createdAt: string; updatedAt: string; submittedAt?: string; paidAt?: string; paidAtBasis?: 'provider_completion' | 'observed_completion';
  approval: { required: boolean; outcome: 'not_required' | 'not_applicable' | 'pending' | 'approved' | 'rejected'; by?: string; at?: string; digest?: string; requestId?: string };
  policy: { monthlyCents: number; purchaseCents: number; approvalAboveCents: number; window: string; provider?: PolicyEvidence };
  intentId?: string; providerStatus?: string; movementNextStep?: string; transactionId?: string; mode: 'disabled' | 'fake' | 'live';
};
export type Request = { id: string; sessionId: string; requester: string; original: string; at: string };
export type PolicyEvidence = { checkedAt: string; id?: string; version?: number; monthlyRuleId: string; purchaseRuleId: string; approvalRuleIds: string[] };
export type PaymentResult = { id: string; status: string; reasons: string[]; movementNextStep?: string; crossChain?: boolean; transactionId?: string; completedAt?: string };
export interface PaymentTransport {
  mode: 'fake' | 'live' | 'disabled';
  inspect(purchase: Purchase): Promise<PolicyEvidence>;
  submit(purchase: Purchase): Promise<PaymentResult>;
  get(intentId: string): Promise<PaymentResult>;
}
