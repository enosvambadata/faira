import { randomInt, createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { SYSTEM_CONFIG_KEYS } from '../lib/systemConfigKeys';

type TxClient = Prisma.TransactionClient;

const DEFAULT_COLLECTION_CODE_EXPIRY_DAYS = 30;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// Only the hash is ever persisted (CollectionCode.codeHash) -- same
// principle as password hashing, per the schema's own comment. The
// plaintext returned here exists in memory just long enough to be sent to
// the buyer over SMS (see fulfilmentNotifications.notifyBuyerReadyForCollection)
// and is never logged or stored anywhere else.
export async function generateCollectionCode(tx: TxClient, shipmentId: string): Promise<string> {
  const config = await tx.systemConfiguration.findUnique({
    where: { key: SYSTEM_CONFIG_KEYS.COLLECTION_CODE_EXPIRY_DAYS },
  });
  const expiryDays = config ? Number(config.value) : DEFAULT_COLLECTION_CODE_EXPIRY_DAYS;

  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  await tx.collectionCode.create({
    data: { shipmentId, codeHash: hashCode(code), expiresAt },
  });

  return code;
}
