const REVEAL_WINDOW_DAYS = 7;

export function getOrderCompletedAt(order: {
  updatedAt: Date;
  escrowEntries: { type: string; createdAt: Date }[];
}): Date {
  return order.escrowEntries.find(e => e.type === 'RELEASE')?.createdAt ?? order.updatedAt;
}

// Reviews are blind (SCRUM-67): a party can't see the other side's review
// until they've submitted their own, or REVEAL_WINDOW_DAYS have passed
// since the order completed — whichever comes first.
export function isRevealed(viewerHasReviewed: boolean, completedAt: Date, now: Date = new Date()): boolean {
  if (viewerHasReviewed) return true;
  const revealAt = new Date(completedAt.getTime() + REVEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return now >= revealAt;
}
