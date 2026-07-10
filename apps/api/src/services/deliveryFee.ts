import { WeightTier } from '@prisma/client';
import { prisma } from '../prisma';

// The buyer's checkout-time delivery option that's always free, regardless
// of city/weight — matches the literal string in
// apps/mobile/src/data/deliveryOptions.ts's DELIVERY_OPTIONS.
export const FREE_DELIVERY_OPTION = 'Buyer collects';

// Used when no admin-configured rate exists for a given (city, weightTier)
// pair, so a quote never hard-fails checkout just because that exact
// combination hasn't been set up yet.
const FALLBACK_FEE = 5;

export async function calculateDeliveryFee(
  city: string,
  weightTier: WeightTier,
  deliveryOption: string,
): Promise<number> {
  if (deliveryOption === FREE_DELIVERY_OPTION) return 0;

  const rate = await prisma.deliveryFeeRate.findUnique({
    where: { city_weightTier: { city, weightTier } },
  });

  return rate ? Number(rate.fee) : FALLBACK_FEE;
}
