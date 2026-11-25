/** A point the route goes through. */
export interface RoutePoint { latitude: number; longitude: number }

/** A driving route: real (Google Routes) or a straight-line estimate when the provider is unavailable. */
export interface RoutePlan {
  distanceKm: number;
  durationMinutes: number;
  /** Google encoded polyline of the road path, for drawing it on the map. */
  polyline?: string;
  provider: 'GOOGLE_ROUTES' | 'GEODESIC_ESTIMATE';
}

export interface RouteProvider {
  plan(origin: RoutePoint, destination: RoutePoint): Promise<RoutePlan>;
}

const EARTH_RADIUS_KM = 6371;
/** Straight-line distance between two points (km). */
export function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Fallback: straight line at 40 km/h (no road data). */
export class GeodesicRouteProvider implements RouteProvider {
  async plan(origin: RoutePoint, destination: RoutePoint): Promise<RoutePlan> {
    const distanceKm = Math.max(Number(haversineKm(origin, destination).toFixed(3)), 0.001);
    return { distanceKm, durationMinutes: Math.max(1, Math.ceil(distanceKm / 40 * 60)), provider: 'GEODESIC_ESTIMATE' };
  }
}
