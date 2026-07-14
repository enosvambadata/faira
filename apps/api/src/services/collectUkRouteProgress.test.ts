import { describe, it, expect, vi } from 'vitest';
import { advanceRouteProgress } from './collectUkRouteProgress';

// advanceRouteProgress takes a Prisma TransactionClient; build a minimal fake.
function makeTx(cfg: {
  route: { id: string; status: string } | null;
  routeUpdateCount?: number;
  pendingCount?: number;
  collectedStops?: { bookingId: string }[];
  bookingArrivedCount?: number;
}) {
  return {
    collectUkCollectionRoute: {
      findUnique: vi.fn().mockResolvedValue(cfg.route),
      updateMany: vi.fn().mockResolvedValue({ count: cfg.routeUpdateCount ?? 1 }),
    },
    collectUkCollectionStop: {
      count: vi.fn().mockResolvedValue(cfg.pendingCount ?? 0),
      findMany: vi.fn().mockResolvedValue(cfg.collectedStops ?? []),
    },
    collectUkCollectionBooking: {
      updateMany: vi.fn().mockResolvedValue({ count: cfg.bookingArrivedCount ?? 1 }),
    },
  };
}

describe('advanceRouteProgress', () => {
  it('returns [] and touches nothing when the route does not exist', async () => {
    const tx = makeTx({ route: null });
    const result = await advanceRouteProgress(tx as never, 'r1');
    expect(result).toEqual([]);
    expect(tx.collectUkCollectionRoute.updateMany).not.toHaveBeenCalled();
  });

  it('starts a PLANNED route (->IN_PROGRESS) but does not complete it while stops remain', async () => {
    const tx = makeTx({ route: { id: 'r1', status: 'PLANNED' }, pendingCount: 1 });
    const result = await advanceRouteProgress(tx as never, 'r1');
    expect(tx.collectUkCollectionRoute.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: 'PLANNED' },
      data: { status: 'IN_PROGRESS' },
    });
    expect(tx.collectUkCollectionBooking.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('completes an IN_PROGRESS route and arrives its collected bookings when the last stop resolves', async () => {
    const tx = makeTx({
      route: { id: 'r1', status: 'IN_PROGRESS' },
      routeUpdateCount: 1,
      pendingCount: 0,
      collectedStops: [{ bookingId: 'b1' }, { bookingId: 'b2' }],
      bookingArrivedCount: 1,
    });

    const result = await advanceRouteProgress(tx as never, 'r1');

    expect(tx.collectUkCollectionRoute.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: 'IN_PROGRESS' },
      data: { status: 'COMPLETED' },
    });
    expect(tx.collectUkCollectionBooking.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', status: 'COLLECTED' },
      data: { status: 'AT_WAREHOUSE' },
    });
    expect(result).toEqual(['b1', 'b2']);
  });

  it('does not arrive bookings when a concurrent call already completed the route (count 0)', async () => {
    const tx = makeTx({
      route: { id: 'r1', status: 'IN_PROGRESS' },
      routeUpdateCount: 0, // IN_PROGRESS->COMPLETED matched nothing: someone else won
      pendingCount: 0,
      collectedStops: [{ bookingId: 'b1' }],
    });

    const result = await advanceRouteProgress(tx as never, 'r1');

    expect(tx.collectUkCollectionBooking.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
