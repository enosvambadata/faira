import { ParcelSizeTier } from '@prisma/client';
import { prisma } from '../prisma';
import { SYSTEM_CONFIG_KEYS } from '../lib/systemConfigKeys';

// Used when no route exists between the two hubs, or a route exists but has
// no PricingRule for the requested size tier — mirrors deliveryFee.ts's
// FALLBACK_FEE shape so a quote never blocks the shipment flow just because
// that exact (route, size) combination hasn't been priced yet.
const DEFAULT_FALLBACK_FEE = 15;

export type ShipmentQuoteSource = 'pricing_rule' | 'fallback_default';

export interface ShipmentQuote {
  fee: number;
  source: ShipmentQuoteSource;
}

export async function calculateShipmentQuote(
  originHubId: string,
  destinationHubId: string,
  sizeTier: ParcelSizeTier,
): Promise<ShipmentQuote> {
  const route = await prisma.transportRoute.findUnique({
    where: { originHubId_destinationHubId: { originHubId, destinationHubId } },
  });

  const pricingRule = route
    ? await prisma.pricingRule.findUnique({
        where: { routeId_sizeTier: { routeId: route.id, sizeTier } },
      })
    : null;

  if (pricingRule) {
    return { fee: Number(pricingRule.fee), source: 'pricing_rule' };
  }

  const config = await prisma.systemConfiguration.findUnique({
    where: { key: SYSTEM_CONFIG_KEYS.SHIPMENT_QUOTE_FALLBACK_FEE },
  });

  return { fee: config ? Number(config.value) : DEFAULT_FALLBACK_FEE, source: 'fallback_default' };
}
