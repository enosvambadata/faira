import { logger } from '../logger';

// Geocoding + distance estimation for Collect UK route planning.
//
// postcodes.io is free, UK-specific, and needs no API key -- the right
// weight for pilot-scale mileage ESTIMATES (driver pay, per-collection
// pricing inputs). When turn-by-turn routing is worth paying for, swap
// this module's internals for Google Routes / Mapbox; nothing outside
// this file knows which provider is underneath.

const POSTCODES_IO = 'https://api.postcodes.io';

// Surface roads are longer than the straight line between two points --
// 1.4 is the commonly used urban UK circuity factor.
const ROAD_FACTOR = 1.4;
const EARTH_RADIUS_MILES = 3958.8;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// Best-effort: returns null on any failure (bad postcode, network, API
// down) -- callers must treat coordinates as optional enrichment, never
// a prerequisite for taking a booking.
export async function geocodePostcode(postcode: string): Promise<GeoPoint | null> {
  try {
    const res = await fetch(`${POSTCODES_IO}/postcodes/${encodeURIComponent(postcode.trim())}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: { latitude?: number; longitude?: number } };
    if (typeof json.result?.latitude !== 'number' || typeof json.result?.longitude !== 'number') return null;
    return { latitude: json.result.latitude, longitude: json.result.longitude };
  } catch (err) {
    logger.error({ err, postcode }, 'postcode geocoding failed');
    return null;
  }
}

function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

export function estimatedRoadMiles(a: GeoPoint, b: GeoPoint): number {
  return Math.round(haversineMiles(a, b) * ROAD_FACTOR * 10) / 10;
}

// Nearest-neighbour ordering: repeatedly visit the closest unvisited
// point, starting from `start` (or the first point when no start is
// given). O(n^2) and not globally optimal, but within a few percent of
// optimal at pilot route sizes (< 30 stops) and trivially explainable
// to a dispatcher looking at the result.
export function orderByNearestNeighbour<T>(items: T[], getPoint: (item: T) => GeoPoint, start?: GeoPoint): T[] {
  const remaining = [...items];
  const ordered: T[] = [];
  let current = start ?? null;

  while (remaining.length > 0) {
    if (!current) {
      ordered.push(remaining.shift()!);
      current = getPoint(ordered[ordered.length - 1]);
      continue;
    }
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMiles(current, getPoint(remaining[i]));
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    current = getPoint(next);
  }
  return ordered;
}
