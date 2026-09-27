import { defineHook } from 'eve/hooks';
import { pantry } from '../../lib/runtime.ts';
export default defineHook({ events: {
  'message.received': (event, ctx) => {
    if (event.data.kind) return;
    const requester = process.env.PANTRY_REQUESTER?.trim();
    if (!requester) throw new Error('Start the local terminal with PANTRY_REQUESTER set.');
    pantry().store.capture({ id: `${ctx.session.id}:${event.data.turnId}`, sessionId: ctx.session.id, requester,
      original: event.data.message, at: event.meta.at });
  },
  'input.requested': event => {
    for (const request of event.data.requests) {
      if (request.kind === 'tool-approval') pantry().store.bindRequest(request.action.callId, request.requestId);
    }
  },
  'approval.settled': event => {
    if (event.data.outcome === 'cancelled') pantry().reject(event.data.requestId, event.data.responderPrincipalId);
  },
} });
