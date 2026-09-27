import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { pantry } from '../../lib/runtime.ts';
import { summary, validateReview } from '../../lib/pantry.ts';
export default defineTool({
  description: 'Pay the exact saved purchase. Deterministic approval above $0.50; hard caps take precedence. Repeated calls do not create another payment.',
  inputSchema: z.object({ purchaseId: z.string(), review: z.string().describe('Copy approvalReview exactly from the saved purchase. This amount, items and recipient appear in the native human approval prompt.') }),
  label: { start: ({ purchaseId }) => { const p = pantry().store.get(purchaseId); return `Pay USD ${(p.amountCents / 100).toFixed(2)}: ${p.items.map(i => `${i.quantity} x ${i.name}`).join(', ')} to ${p.destination.address || '(not configured)'} on ${p.destination.network}`; } },
  approval: {
    request: ({ toolInput, session, callId }) => {
      if (!toolInput) return { type: 'denied', reason: 'Missing purchase ID.' };
      const p = pantry().owned(toolInput.purchaseId, session.id);
      try { validateReview(p, toolInput.review); } catch (error) { return { type: 'denied', reason: (error as Error).message }; }
      return pantry().approvalGate(p.id, session.id, callId);
    },
    response: ({ responder, request, session }) => {
      if (!request.toolInput) return { status: 'rejected', reason: 'Missing purchase.' };
      if (responder.principalType === 'runtime' || responder.authenticator === 'app') return { status: 'rejected', reason: 'Only the local human operator may approve.' };
      validateReview(pantry().owned(request.toolInput.purchaseId, session.id), request.toolInput.review);
      pantry().approve(request.toolInput.purchaseId, session.id, responder.principalId, request.requestId);
      return { status: 'allowed' };
    },
  },
  execute: async ({ purchaseId, review }, ctx) => { validateReview(pantry().owned(purchaseId, ctx.session.id), review); return summary(await pantry().pay(purchaseId, ctx.session.id)); },
});
