import { describe, it, expect } from 'vitest';
import { getOrderCompletedAt, isRevealed } from './orderReviews';

describe('getOrderCompletedAt', () => {
  it('uses the escrow RELEASE timestamp when present', () => {
    const releasedAt = new Date('2026-07-01T00:00:00Z');
    const completedAt = getOrderCompletedAt({
      updatedAt: new Date('2026-07-02T00:00:00Z'),
      escrowEntries: [{ type: 'HOLD', createdAt: new Date('2026-06-30T00:00:00Z') }, { type: 'RELEASE', createdAt: releasedAt }],
    });
    expect(completedAt).toEqual(releasedAt);
  });

  it('falls back to updatedAt when there is no RELEASE entry (cash-on-delivery orders)', () => {
    const updatedAt = new Date('2026-07-02T00:00:00Z');
    const completedAt = getOrderCompletedAt({ updatedAt, escrowEntries: [] });
    expect(completedAt).toEqual(updatedAt);
  });
});

describe('isRevealed', () => {
  const completedAt = new Date('2026-07-01T00:00:00Z');

  it('is revealed immediately once the viewer has reviewed', () => {
    expect(isRevealed(true, completedAt, new Date('2026-07-01T00:00:01Z'))).toBe(true);
  });

  it('is not revealed before 7 days if the viewer has not reviewed', () => {
    expect(isRevealed(false, completedAt, new Date('2026-07-05T00:00:00Z'))).toBe(false);
  });

  it('is revealed once 7 days have passed, even without a review', () => {
    expect(isRevealed(false, completedAt, new Date('2026-07-08T00:00:01Z'))).toBe(true);
  });
});
