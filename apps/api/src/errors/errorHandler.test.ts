import { describe, it, expect, vi } from 'vitest';
import { Response } from 'express';
import { ApiError } from './ApiError';
import { errorHandler } from './errorHandler';

function mockResponse() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  it('serializes an ApiError into the standard envelope', () => {
    const res = mockResponse();
    const err = new ApiError('LISTING_NOT_FOUND', 'Listing not found', 404, { listingId: '123' });

    errorHandler(err, {} as never, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'LISTING_NOT_FOUND',
        message: 'Listing not found',
        details: { listingId: '123' },
      },
    });
  });

  it('falls back to a 500 INTERNAL_ERROR envelope for unexpected errors', () => {
    const res = mockResponse();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    errorHandler(new Error('boom'), {} as never, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: null,
      },
    });

    consoleSpy.mockRestore();
  });
});
