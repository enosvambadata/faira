import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUniqueMock = vi.fn();
const updateManyMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    collectUkPayment: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      updateMany: (...args: unknown[]) => updateManyMock(...args),
    },
  },
}));

const { confirmCollectUkPayment } = await import('./collectUkPaymentConfirmation');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('confirmCollectUkPayment', () => {
  it('flips a pending payment to PAID', async () => {
    findUniqueMock.mockResolvedValue({ id: 'pay-1', status: 'PENDING' });
    updateManyMock.mockResolvedValue({ count: 1 });

    await confirmCollectUkPayment('cs_test_1', 'pi_test_1');

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: 'pay-1', status: 'PENDING' },
      data: expect.objectContaining({ status: 'PAID', stripePaymentIntentId: 'pi_test_1' }),
    });
  });

  it('is idempotent — a repeated webhook is a no-op (guard count 0)', async () => {
    findUniqueMock.mockResolvedValue({ id: 'pay-1', status: 'PAID' });
    updateManyMock.mockResolvedValue({ count: 0 });
    await expect(confirmCollectUkPayment('cs_test_1', 'pi_test_1')).resolves.toBeUndefined();
  });

  it('does nothing for an unknown session', async () => {
    findUniqueMock.mockResolvedValue(null);
    await confirmCollectUkPayment('cs_unknown', null);
    expect(updateManyMock).not.toHaveBeenCalled();
  });
});
