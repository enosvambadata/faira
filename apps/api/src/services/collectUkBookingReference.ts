import { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

// FC-{company slug}-{6-digit zero-padded sequence}, e.g.
// FC-abc-logistics-000001. Mirrors generateShipmentReference's per-hub
// sequence pattern, but keyed by the company's slug rather than a short
// hub code (Collect UK companies self-register with arbitrary names, so
// there's no equivalent of Hub's manually-assigned unique 3-letter code --
// the slug is already globally unique, so using it directly guarantees a
// unique reference without needing a separate short-code scheme).
//
// No QR code generated here -- unlike Fulfilment's physical parcel label,
// nothing in Collect UK scans a booking reference yet (that's the Driver
// Mobile / Proof of Collection epics' job, not this ticket's).
export async function generateBookingReference(tx: TxClient, companyId: string): Promise<string> {
  // Single UPDATE ... RETURNING under the hood -- Postgres serializes
  // concurrent updates to the same row, so two bookings for the same
  // company at once can never receive the same sequence number.
  const company = await tx.collectUkCompany.update({
    where: { id: companyId },
    data: { nextBookingSequence: { increment: 1 } },
  });

  const sequence = company.nextBookingSequence - 1;
  return `FC-${company.slug}-${String(sequence).padStart(6, '0')}`;
}
