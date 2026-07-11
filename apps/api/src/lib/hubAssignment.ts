import { FulfilmentRequest } from '../middleware/requireFulfilmentRole';

// Same check as requireHubAssignment.ts's middleware, but usable when the
// target hub is only known after loading a record (e.g. a shipment's
// originHubId) rather than being present in the URL params up front.
export function isAssignedToHub(req: FulfilmentRequest, hubId: string): boolean {
  return (req.fulfilmentRoles ?? []).some(r => r.hubId === hubId);
}
