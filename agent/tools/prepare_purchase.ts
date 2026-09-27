import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { pantry } from '../../lib/runtime.ts';
import { summary } from '../../lib/pantry.ts';
export default defineTool({
  description: 'Validate and record one immutable purchase for the current request. Does not pay. Invalid quantities and unsupported catalog IDs are refused and recorded.',
  inputSchema: z.object({ items: z.array(z.object({ itemId: z.string(), quantity: z.number() })), rationale: z.string() }),
  execute(input, ctx) { return summary(pantry().prepare(`${ctx.session.id}:${ctx.session.turn.id}`, input.items, input.rationale)); },
});
