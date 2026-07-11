import QRCode from 'qrcode';
import { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

// FF-{hub code}-{6-digit zero-padded sequence}, e.g. FF-HRE-000123. The
// sequence is per-origin-hub (not global), so it stays short and
// human-readable while still being unique per hub — global uniqueness
// comes from pairing it with the hub code, enforced by Shipment.reference's
// own @unique constraint as a belt-and-braces check.
//
// Deliberately NOT a security credential: SCRUM-135's security note calls
// out that this reference must never grant tracking access on its own
// (that's the buyer's separate secure link/token, SCRUM-120) — it only
// identifies the parcel physically, so its sequential-per-hub shape isn't
// a guessability concern.
export async function generateShipmentReference(
  tx: TxClient,
  originHubId: string,
): Promise<{ reference: string; qrCodeUrl: string }> {
  // Single UPDATE ... RETURNING under the hood — Postgres serializes
  // concurrent updates to the same row, so two shipments confirming
  // against the same origin hub at once can never receive the same
  // sequence number.
  const hub = await tx.hub.update({
    where: { id: originHubId },
    data: { nextShipmentSequence: { increment: 1 } },
  });

  const sequence = hub.nextShipmentSequence - 1;
  const reference = `FF-${hub.code}-${String(sequence).padStart(6, '0')}`;
  const qrCodeUrl = await QRCode.toDataURL(reference);

  return { reference, qrCodeUrl };
}
