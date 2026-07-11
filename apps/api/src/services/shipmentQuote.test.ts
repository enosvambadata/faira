import { describe, it, expect, vi, beforeEach } from 'vitest';

const routeFindUniqueMock = vi.fn();
const pricingRuleFindUniqueMock = vi.fn();
const systemConfigFindUniqueMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    transportRoute: { findUnique: (...args: unknown[]) => routeFindUniqueMock(...args) },
    pricingRule: { findUnique: (...args: unknown[]) => pricingRuleFindUniqueMock(...args) },
    systemConfiguration: { findUnique: (...args: unknown[]) => systemConfigFindUniqueMock(...args) },
  },
}));

const { calculateShipmentQuote } = await import('./shipmentQuote');

const ORIGIN_ID = '11111111-1111-4111-8111-111111111111';
const DESTINATION_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('calculateShipmentQuote', () => {
  it('uses the exact-match PricingRule for the route and size tier', async () => {
    routeFindUniqueMock.mockResolvedValue({ id: 'route-1' });
    pricingRuleFindUniqueMock.mockResolvedValue({ fee: { toString: () => '12.5' } });

    const quote = await calculateShipmentQuote(ORIGIN_ID, DESTINATION_ID, 'MEDIUM');

    expect(quote).toEqual({ fee: 12.5, source: 'pricing_rule' });
    expect(pricingRuleFindUniqueMock).toHaveBeenCalledWith({
      where: { routeId_sizeTier: { routeId: 'route-1', sizeTier: 'MEDIUM' } },
    });
  });

  it('falls back to the configured default when no route exists between the hubs', async () => {
    routeFindUniqueMock.mockResolvedValue(null);
    systemConfigFindUniqueMock.mockResolvedValue({ value: '20' });

    const quote = await calculateShipmentQuote(ORIGIN_ID, DESTINATION_ID, 'SMALL');

    expect(quote).toEqual({ fee: 20, source: 'fallback_default' });
    expect(pricingRuleFindUniqueMock).not.toHaveBeenCalled();
  });

  it('falls back to the configured default when the route exists but has no rule for the size tier', async () => {
    routeFindUniqueMock.mockResolvedValue({ id: 'route-1' });
    pricingRuleFindUniqueMock.mockResolvedValue(null);
    systemConfigFindUniqueMock.mockResolvedValue({ value: '20' });

    const quote = await calculateShipmentQuote(ORIGIN_ID, DESTINATION_ID, 'EXTRA_LARGE');

    expect(quote).toEqual({ fee: 20, source: 'fallback_default' });
  });

  it('falls back to the hardcoded default when no SystemConfiguration row exists either', async () => {
    routeFindUniqueMock.mockResolvedValue(null);
    systemConfigFindUniqueMock.mockResolvedValue(null);

    const quote = await calculateShipmentQuote(ORIGIN_ID, DESTINATION_ID, 'LARGE');

    expect(quote).toEqual({ fee: 15, source: 'fallback_default' });
  });
});
