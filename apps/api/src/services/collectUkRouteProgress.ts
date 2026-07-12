import { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

// Called after every stop resolution (collected or unable-to-collect) so
// CollectUkCollectionRoute.status reflects real progress instead of
// sitting at PLANNED forever -- mirrors Fulfilment's maybeMarkRunDeparted
// pattern: the route implicitly starts on its first resolved stop, and
// implicitly completes once every stop has an outcome.
export async function advanceRouteProgress(tx: TxClient, routeId: string): Promise<void> {
  const route = await tx.collectUkCollectionRoute.findUnique({ where: { id: routeId } });
  if (!route) return;

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
    await tx.collectUkCollectionRoute.updateMany({
      where: { id: routeId, status: 'IN_PROGRESS' },
      data: { status: 'COMPLETED' },
    });
  }
}
