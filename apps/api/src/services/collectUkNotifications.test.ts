import { describe, it, expect, vi, beforeEach } from 'vitest';

const bookingFindUniqueMock = vi.fn();
const driverFindUniqueMock = vi.fn();
const sendSmsMock = vi.fn();
const sendEmailMock = vi.fn();
const getUserByIdMock = vi.fn();

vi.mock('../prisma', () => ({
  prisma: {
    collectUkCollectionBooking: { findUnique: (...args: unknown[]) => bookingFindUniqueMock(...args) },
    collectUkDriver: { findUnique: (...args: unknown[]) => driverFindUniqueMock(...args) },
  },
}));

vi.mock('../lib/sms', () => ({
  sendSms: (...args: unknown[]) => sendSmsMock(...args),
}));

vi.mock('../lib/email', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { admin: { getUserById: (...args: unknown[]) => getUserByIdMock(...args) } } },
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
  notifyDriverApproved,
  notifyDriverRejected,
} = await import('./collectUkNotifications');

const BOOKING = {
  id: 'booking-1',
  reference: 'FC-abc-logistics-000001',
  customerContact: '+447700900000',
  destinationCountry: 'Zimbabwe',
  preferredDate: new Date('2026-08-01T00:00:00Z'),
  company: { name: 'ABC Logistics' },
  collectionWindow: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEB_APP_URL = 'https://app.example.com';
  bookingFindUniqueMock.mockResolvedValue(BOOKING);
  sendSmsMock.mockResolvedValue(undefined);
  sendEmailMock.mockResolvedValue(undefined);
  driverFindUniqueMock.mockResolvedValue({ userId: 'u-1', phone: '+447700900201', fullName: 'Tendai' });
  getUserByIdMock.mockResolvedValue({ data: { user: { email: 'tendai@example.com' } } });
});

describe('collectUkNotifications', () => {
  it('booking confirmed with a collection window: includes the week and tracking link', async () => {
    bookingFindUniqueMock.mockResolvedValue({
      ...BOOKING,
      collectionWindow: { startDate: new Date('2026-08-03T00:00:00Z'), endDate: new Date('2026-08-09T00:00:00Z') },
    });

    await notifyBookingConfirmed('booking-1');

    expect(sendSmsMock).toHaveBeenCalledWith(
      '+447700900000',
      'ABC Logistics: booking FC-abc-logistics-000001 received -- collection week 3 Aug 2026 - 9 Aug 2026. Track your parcel: https://app.example.com/collect-uk/track/test-tracking-token',
    );
  });

  it('booking confirmed without a window: promises the week will be texted', async () => {
    await notifyBookingConfirmed('booking-1');

    expect(sendSmsMock).toHaveBeenCalledWith(
      '+447700900000',
      "ABC Logistics: booking FC-abc-logistics-000001 received -- we'll text you when your collection week is set. Track your parcel: https://app.example.com/collect-uk/track/test-tracking-token",
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

describe('driver decision notifications', () => {
  it('approval emails and texts the driver', async () => {
    await notifyDriverApproved('d-1');

    expect(sendEmailMock).toHaveBeenCalledWith(
      'tendai@example.com',
      expect.stringMatching(/approved/i),
      expect.stringContaining('driver portal'),
    );
    expect(sendSmsMock).toHaveBeenCalledWith('+447700900201', expect.stringMatching(/approved/i));
  });

  it('rejection includes the reason on both channels', async () => {
    await notifyDriverRejected('d-1', 'GIT certificate expired');

    expect(sendEmailMock).toHaveBeenCalledWith('tendai@example.com', expect.any(String), expect.stringContaining('GIT certificate expired'));
    expect(sendSmsMock).toHaveBeenCalledWith('+447700900201', expect.stringContaining('GIT certificate expired'));
  });

  it('HTML-escapes the driver name in the approval email', async () => {
    driverFindUniqueMock.mockResolvedValue({ userId: 'u-1', phone: '+447700900201', fullName: '<img src=x onerror=alert(1)>' });

    await notifyDriverApproved('d-1');

    const html = sendEmailMock.mock.calls[0][2] as string;
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('HTML-escapes the reason in the rejection email but keeps the SMS plaintext', async () => {
    await notifyDriverRejected('d-1', 'Docs <bad> & "wrong"');

    const html = sendEmailMock.mock.calls[0][2] as string;
    expect(html).toContain('&lt;bad&gt; &amp; &quot;wrong&quot;');
    expect(html).not.toContain('<bad>');

    // SMS is plaintext -- it must carry the raw reason, not HTML entities.
    const sms = sendSmsMock.mock.calls[0][1] as string;
    expect(sms).toContain('Docs <bad> & "wrong"');
    expect(sms).not.toContain('&lt;');
  });

  it('still texts when the driver has no account email', async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: null } });

    await notifyDriverApproved('d-1');

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendSmsMock).toHaveBeenCalled();
  });

  it('is best-effort: a lookup failure never throws', async () => {
    driverFindUniqueMock.mockRejectedValue(new Error('db down'));

    await expect(notifyDriverApproved('d-1')).resolves.toBeUndefined();
  });
});
