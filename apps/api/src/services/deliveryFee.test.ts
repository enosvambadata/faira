import { describe, it, expect, vi, beforeEach } from 'vitest';

const deliveryFeeRateFindUniqueMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    deliveryFeeRate: {
      findUnique: (...args: unknown[]) => deliveryFeeRateFindUniqueMock(...args),
    },
  },
}));

const { calculateDeliveryFee } = await import('./deliveryFee');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('calculateDeliveryFee', () => {
  it('is always free for Buyer collects, regardless of city/weight', async () => {
    const fee = await calculateDeliveryFee('Harare', 'HEAVY', 'Buyer collects');

    expect(fee).toBe(0);
    expect(deliveryFeeRateFindUniqueMock).not.toHaveBeenCalled();
  });

  it('returns the configured rate for a city/weight tier combo', async () => {
    deliveryFeeRateFindUniqueMock.mockResolvedValue({ fee: { toString: () => '4.50' } });

    const fee = await calculateDeliveryFee('Mutare', 'MEDIUM', 'Courier');

    expect(fee).toBe(4.5);
    expect(deliveryFeeRateFindUniqueMock).toHaveBeenCalledWith({
      where: { city_weightTier: { city: 'Mutare', weightTier: 'MEDIUM' } },
    });
  });

  it('falls back to a default fee when no rate is configured', async () => {
    deliveryFeeRateFindUniqueMock.mockResolvedValue(null);

    const fee = await calculateDeliveryFee('Somewhere Remote', 'HEAVY', 'Courier');

    expect(fee).toBe(5);
  });
});
