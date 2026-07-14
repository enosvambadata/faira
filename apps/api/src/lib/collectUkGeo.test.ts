import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geocodePostcode, estimatedRoadMiles, orderByNearestNeighbour } from './collectUkGeo';

// Wolverhampton (WV1) and central Birmingham (B1) -- about 12.5 miles
// apart in a straight line, a well-known pair to sanity-check haversine.
const WOLVERHAMPTON = { latitude: 52.585, longitude: -2.134 };
const BIRMINGHAM = { latitude: 52.4796, longitude: -1.9026 };
const LONDON = { latitude: 51.5074, longitude: -0.1278 };

describe('estimatedRoadMiles', () => {
  it('applies the road factor to the great-circle distance', () => {
    const miles = estimatedRoadMiles(WOLVERHAMPTON, BIRMINGHAM);
    // straight line ~12.3mi, x1.4 road factor => ~17.2mi
    expect(miles).toBeGreaterThan(15);
    expect(miles).toBeLessThan(20);
  });

  it('is zero for identical points', () => {
    expect(estimatedRoadMiles(LONDON, LONDON)).toBe(0);
  });
});

describe('orderByNearestNeighbour', () => {
  it('orders points by proximity from the given start', () => {
    const stops = [
      { name: 'london', point: LONDON },
      { name: 'birmingham', point: BIRMINGHAM },
    ];
    const ordered = orderByNearestNeighbour(stops, s => s.point, WOLVERHAMPTON);
    expect(ordered.map(s => s.name)).toEqual(['birmingham', 'london']);
  });

  it('starts from the first item when no start point is given', () => {
    const stops = [
      { name: 'london', point: LONDON },
      { name: 'wolverhampton', point: WOLVERHAMPTON },
      { name: 'birmingham', point: BIRMINGHAM },
    ];
    const ordered = orderByNearestNeighbour(stops, s => s.point);
    // From London the nearest is Birmingham, then Wolverhampton.
    expect(ordered.map(s => s.name)).toEqual(['london', 'birmingham', 'wolverhampton']);
  });

  it('handles an empty list', () => {
    expect(orderByNearestNeighbour([], () => LONDON)).toEqual([]);
  });
});

describe('geocodePostcode', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('returns coordinates for a valid postcode', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { latitude: 52.585, longitude: -2.134 } }),
    });

    const geo = await geocodePostcode('WV1 1AA');

    expect(geo).toEqual({ latitude: 52.585, longitude: -2.134 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.postcodes.io/postcodes/WV1%201AA',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('applies an abort timeout so a stalled upstream never hangs the request', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { latitude: 1, longitude: 2 } }),
    });

    await geocodePostcode('WV1 1AA');

    const [, options] = fetchMock.mock.calls[0];
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns null on a 404 (unknown postcode)', async () => {
    fetchMock.mockResolvedValue({ ok: false });

    expect(await geocodePostcode('ZZ99 9ZZ')).toBeNull();
  });

  it('returns null when the API is unreachable (best-effort)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    expect(await geocodePostcode('WV1 1AA')).toBeNull();
  });
});
