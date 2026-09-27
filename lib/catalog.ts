// Artificial USD test prices. No scaling occurs at the payment boundary.
export const POLICY = { monthlyCents: 50_000, purchaseCents: 90, approvalAboveCents: 50 } as const;
export const CATALOG = [
  { id: 'premium-coffee', name: 'Premium coffee pack', vendor: 'Roast Office', cents: 25 },
  { id: 'house-coffee', name: 'House coffee pack', vendor: 'Roast Office', cents: 20 },
  { id: 'snack-box', name: 'Team snack box', vendor: 'Pantry Supply', cents: 60 },
  { id: 'energy-drink', name: 'Energy drink', vendor: 'Pantry Supply', cents: 3 },
] as const;
export type Line = { itemId: string; quantity: number };
export const dollars = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
export function usdMicros(value: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) throw new Error('Invalid USD decimal');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}
export function price(lines: Line[]) {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 10) throw new Error('Choose 1–10 catalog lines.');
  const seen = new Set<string>();
  const items = lines.map(line => {
    const item = CATALOG.find(item => item.id === line.itemId);
    if (!item) throw new Error(`Unsupported catalog item: ${String(line.itemId).slice(0, 80)}.`);
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || line.quantity > 10_000) throw new Error('Quantities must be whole numbers from 1 to 10,000.');
    if (seen.has(item.id)) throw new Error('Combine duplicate catalog lines.');
    seen.add(item.id);
    return { ...item, quantity: line.quantity, totalCents: item.cents * line.quantity };
  });
  const vendors = new Set(items.map(item => item.vendor));
  if (vendors.size !== 1) throw new Error('One vendor per purchase; request mixed-vendor orders separately.');
  return { items, vendor: items[0]!.vendor, amountCents: items.reduce((sum, item) => sum + item.totalCents, 0) };
}
