import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCollectionCode } from './collectionCode';

const systemConfigFindUniqueMock = vi.fn();
const collectionCodeCreateMock = vi.fn();

function fakeTx() {
  return {
    systemConfiguration: { findUnique: (...args: unknown[]) => systemConfigFindUniqueMock(...args) },
    collectionCode: { create: (...args: unknown[]) => collectionCodeCreateMock(...args) },
  } as unknown as Parameters<typeof generateCollectionCode>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  collectionCodeCreateMock.mockResolvedValue({});
});

describe('generateCollectionCode', () => {
  it('returns a 6-digit numeric plaintext code', async () => {
    systemConfigFindUniqueMock.mockResolvedValue({ value: '30' });

    const code = await generateCollectionCode(fakeTx(), 'shipment-1');

    expect(code).toMatch(/^\d{6}$/);
  });

  it('never persists the plaintext -- only a SHA-256 hash of it', async () => {
    systemConfigFindUniqueMock.mockResolvedValue({ value: '30' });

    const code = await generateCollectionCode(fakeTx(), 'shipment-1');

    expect(collectionCodeCreateMock).toHaveBeenCalledTimes(1);
    const createArgs = collectionCodeCreateMock.mock.calls[0][0];
    expect(createArgs.data.shipmentId).toBe('shipment-1');
    expect(createArgs.data.codeHash).not.toBe(code);
    expect(createArgs.data.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sets expiresAt from the configured expiry, falling back to 30 days', async () => {
    systemConfigFindUniqueMock.mockResolvedValue(null);
    const before = Date.now();

    await generateCollectionCode(fakeTx(), 'shipment-1');

    const createArgs = collectionCodeCreateMock.mock.calls[0][0];
    const expiresAt: Date = createArgs.data.expiresAt;
    const expectedMs = before + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt.getTime() - expectedMs)).toBeLessThan(5000);
  });
});
