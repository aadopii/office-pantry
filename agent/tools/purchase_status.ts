import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { pantry } from '../../lib/runtime.ts';
import { summary } from '../../lib/pantry.ts';
export default defineTool({
  description: 'Read and reconcile a saved purchase without submitting a payment.',
  inputSchema: z.object({ purchaseId: z.string() }),
  async execute({ purchaseId }, ctx) { pantry().owned(purchaseId, ctx.session.id); return summary(await pantry().reconcile(purchaseId)); },
});
