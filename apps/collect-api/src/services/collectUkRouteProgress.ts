import { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

// Called after every stop resolution (collected or unable-to-collect) so
// CollectUkCollectionRoute.status reflects real progress instead of
// sitting at PLANNED forever -- mirrors Fulfilment's maybeMarkRunDeparted
// pattern: the route implicitly starts on its first resolved stop, and
// implicitly completes once every stop has an outcome.
//
// Returns the ids of bookings transitioned to AT_WAREHOUSE, so the caller
// can send arrival notifications AFTER its transaction commits -- an SMS
// must never fire for a transition that ends up rolled back.
export async function advanceRouteProgress(tx: TxClient, routeId: string): Promise<string[]> {
  const route = await tx.collectUkCollectionRoute.findUnique({ where: { id: routeId } });
  if (!route) return [];

  if (route.status === 'PLANNED') {
    await tx.collectUkCollectionRoute.updateMany({
      where: { id: routeId, status: 'PLANNED' },
      data: { status: 'IN_PROGRESS' },
    });
  }

  const pendingCount = await tx.collectUkCollectionStop.count({
    where: { routeId, status: 'PENDING' },
  });
  if (pendingCount === 0) {
    const completedResult = await tx.collectUkCollectionRoute.updateMany({
      where: { id: routeId, status: 'IN_PROGRESS' },
      data: { status: 'COMPLETED' },
    });

    // The real-world moment every parcel collected on this route has
    // physically reached the destination -- driven by route completion,
    // not a separate manual step, mirroring Fulfilment's
    // maybeMarkRunDeparted retrofit for the IN_TRANSIT transition.
    if (completedResult.count > 0) {
      const collectedStops = await tx.collectUkCollectionStop.findMany({
        where: { routeId, status: 'COLLECTED' },
        select: { bookingId: true },
      });
      const arrivedBookingIds: string[] = [];
      for (const { bookingId } of collectedStops) {
        const arrived = await tx.collectUkCollectionBooking.updateMany({
          where: { id: bookingId, status: 'COLLECTED' },
          data: { status: 'AT_WAREHOUSE' },
        });
        if (arrived.count > 0) arrivedBookingIds.push(bookingId);
      }
      return arrivedBookingIds;
    }
  }
  return [];
}
