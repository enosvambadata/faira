import { describe, it, expect, vi, beforeEach } from 'vitest';

const bookingFindUniqueMock = vi.fn();
const sendSmsMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    collectUkCollectionBooking: { findUnique: (...args: unknown[]) => bookingFindUniqueMock(...args) },
  },
}));

vi.mock('../lib/sms', () => ({
  sendSms: (...args: unknown[]) => sendSmsMock(...args),
}));

vi.mock('../lib/collectUkBookingToken', () => ({
  generateBookingTrackingToken: () => 'test-tracking-token',
}));

const {
  notifyBookingConfirmed,
  notifyCollectionScheduled,
  notifyParcelCollected,
  notifyUnableToCollect,
  notifyArrivedAtWarehouse,
  notifyHandedOver,
} = await import('./collectUkNotifications');

const BOOKING = {
  id: 'booking-1',
  reference: 'FC-abc-logistics-000001',
  customerContact: '+447700900000',
  destinationCountry: 'Zimbabwe',
  preferredDate: new Date('2026-08-01T00:00:00Z'),
  company: { name: 'ABC Logistics' },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEB_APP_URL = 'https://app.example.com';
  bookingFindUniqueMock.mockResolvedValue(BOOKING);
  sendSmsMock.mockResolvedValue(undefined);
});

describe('collectUkNotifications', () => {
  it('booking confirmed: includes company, reference, date and tracking link', async () => {
    await notifyBookingConfirmed('booking-1');

    expect(sendSmsMock).toHaveBeenCalledWith(
      '+447700900000',
      'ABC Logistics: collection FC-abc-logistics-000001 booked for 1 Aug 2026. Track your parcel: https://app.example.com/collect-uk/track/test-tracking-token',
    );
  });

  it('collection scheduled: includes the route date, not the preferred date', async () => {
    await notifyCollectionScheduled('booking-1', new Date('2026-08-03T00:00:00Z'));

    expect(sendSmsMock).toHaveBeenCalledWith(
      '+447700900000',
      'ABC Logistics: your parcel FC-abc-logistics-000001 is scheduled for collection on 3 Aug 2026.',
    );
  });

  it('parcel collected', async () => {
    await notifyParcelCollected('booking-1');

    expect(sendSmsMock).toHaveBeenCalledWith(
      '+447700900000',
      "ABC Logistics: we've collected your parcel FC-abc-logistics-000001. It's on its way to our warehouse.",
    );
  });

  it('unable to collect: includes the driver-entered reason', async () => {
    await notifyUnableToCollect('booking-1', 'No answer at the door');

    expect(sendSmsMock).toHaveBeenCalledWith(
      '+447700900000',
      "ABC Logistics: we couldn't collect your parcel FC-abc-logistics-000001 (No answer at the door). Please contact us to rearrange.",
    );
  });

  it('arrived at warehouse', async () => {
    await notifyArrivedAtWarehouse('booking-1');

    expect(sendSmsMock).toHaveBeenCalledWith(
      '+447700900000',
      'ABC Logistics: your parcel FC-abc-logistics-000001 has arrived at our warehouse.',
    );
  });

  it('handed over: includes the destination country', async () => {
    await notifyHandedOver('booking-1');

    expect(sendSmsMock).toHaveBeenCalledWith(
      '+447700900000',
      'ABC Logistics: your parcel FC-abc-logistics-000001 has been received and will be shipped to Zimbabwe.',
    );
  });

  it('sends nothing for a nonexistent booking', async () => {
    bookingFindUniqueMock.mockResolvedValue(null);

    await notifyParcelCollected('nonexistent');

    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it('is best-effort: a DB failure during lookup never propagates to the caller', async () => {
    bookingFindUniqueMock.mockRejectedValue(new Error('db down'));

    await expect(notifyParcelCollected('booking-1')).resolves.toBeUndefined();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});
