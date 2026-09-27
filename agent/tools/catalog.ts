import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { CATALOG, POLICY, dollars } from '../../lib/catalog.ts';
export default defineTool({
  description: 'Read the trusted artificial-price office snack catalog and local policy.',
  inputSchema: z.object({}),
  execute() { return { items: CATALOG.map(i => ({ ...i, priceUSD: dollars(i.cents) })), policy: POLICY, artificialTestPrices: true }; },
});
