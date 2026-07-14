import { describe, it, expect, vi, beforeEach } from 'vitest';

const auditLogCreateMock = vi.fn();
const loggerErrorMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: { auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) } },
}));
vi.mock('../logger', () => ({
  logger: { error: (...args: unknown[]) => loggerErrorMock(...args), info: vi.fn() },
}));

const { recordAuditLog } = await import('./fulfilmentAuditLog');

describe('recordAuditLog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes an audit row on the happy path', async () => {
    auditLogCreateMock.mockResolvedValue({});

    await recordAuditLog('user-1', 'SOME_ACTION', { foo: 'bar' });

    expect(auditLogCreateMock).toHaveBeenCalledWith({
      data: { userId: 'user-1', action: 'SOME_ACTION', details: { foo: 'bar' } },
    });
  });

  it('never throws when the audit write fails (best-effort) and logs the error', async () => {
    // recordAuditLog is awaited AFTER the real transaction has committed, so a
    // failed audit insert must not surface as a 500 for an operation that
    // already succeeded.
    auditLogCreateMock.mockRejectedValue(new Error('db down'));

    await expect(recordAuditLog('user-1', 'SOME_ACTION')).resolves.toBeUndefined();
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});
