import { randomInt, createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { SYSTEM_CONFIG_KEYS } from '../lib/systemConfigKeys';

type TxClient = Prisma.TransactionClient;

const DEFAULT_COLLECTION_CODE_EXPIRY_DAYS = 30;

// Exported for reuse by the collection-verification endpoint (SCRUM-145),
// which needs to hash a buyer-provided code the exact same way to compare
// against the stored hash.
export function hashCollectionCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// Only the hash is ever persisted (CollectionCode.codeHash) -- same
// principle as password hashing, per the schema's own comment. The
// plaintext returned here exists in memory just long enough to be sent to
// the buyer over SMS (see fulfilmentNotifications.notifyBuyerReadyForCollection)
// and is never logged or stored anywhere else. expiresAt is also handed back
// so the caller can mirror it onto Shipment.collectionWindowEndsAt -- the
// buyer-facing "collect by" date is the same deadline as the code itself.
export async function generateCollectionCode(
  tx: TxClient,
  shipmentId: string,
): Promise<{ code: string; expiresAt: Date }> {
  const config = await tx.systemConfiguration.findUnique({
    where: { key: SYSTEM_CONFIG_KEYS.COLLECTION_CODE_EXPIRY_DAYS },
  });
  const expiryDays = config ? Number(config.value) : DEFAULT_COLLECTION_CODE_EXPIRY_DAYS;

  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  await tx.collectionCode.create({
    data: { shipmentId, codeHash: hashCollectionCode(code), expiresAt },
  });

  return { code, expiresAt };
}
