import { GeodesicRouteProvider, RoutePlan, RoutePoint, RouteProvider } from '../../application/transport/ports/route-provider';

type Fetch = typeof fetch;
const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELD_MASK = 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline';

/**
 * Driving routes from the Google Routes API (UC-TRA-09/45/72). Any failure (no key, quota, timeout,
 * no route) falls back to the straight-line estimate, so the app never loses the ETA.
 * Results are cached briefly: the client polls the ETA every few seconds.
 */
export class GoogleRoutesProvider implements RouteProvider {
  private readonly cache = new Map<string, { at: number; plan: RoutePlan }>();
  private readonly fallback = new GeodesicRouteProvider();

  constructor(private readonly apiKey: string, private readonly fetchImpl: Fetch = fetch,
    private readonly options: { timeoutMs?: number; cacheMs?: number; maxEntries?: number; onError?: (reason: string) => void } = {}) {}

  async plan(origin: RoutePoint, destination: RoutePoint): Promise<RoutePlan> {
    // ~11 m precision: a truck moving a few metres reuses the cached route.
    const key = [origin.latitude, origin.longitude, destination.latitude, destination.longitude].map(v => v.toFixed(4)).join(',');
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < (this.options.cacheMs ?? 120_000)) return cached.plan;
    const plan = await this.request(origin, destination);
    if (plan.provider === 'GOOGLE_ROUTES') {
      if (this.cache.size >= (this.options.maxEntries ?? 1000)) this.cache.delete(this.cache.keys().next().value as string);
      this.cache.set(key, { at: Date.now(), plan });
    }
    return plan;
  }

  private async request(origin: RoutePoint, destination: RoutePoint): Promise<RoutePlan> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 5000);
    try {
      const response = await this.fetchImpl(ENDPOINT, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': FIELD_MASK },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
          destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
          travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', languageCode: 'es-419', units: 'METRIC',
        }),
      });
      if (!response.ok) throw new Error(`Google Routes HTTP ${response.status}`);
      const data = await response.json() as { routes?: Array<{ distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }> };
      const route = data.routes?.[0];
      const seconds = Number(String(route?.duration ?? '').replace(/s$/, ''));
      if (!route || !Number.isFinite(route.distanceMeters) || !Number.isFinite(seconds)) throw new Error('Google Routes returned no route');
      return { distanceKm: Number((route.distanceMeters! / 1000).toFixed(3)), durationMinutes: Math.max(1, Math.ceil(seconds / 60)),
        polyline: route.polyline?.encodedPolyline, provider: 'GOOGLE_ROUTES' };
    } catch (error) {
      // Never log the key or the request: only the reason.
      this.options.onError?.(error instanceof Error ? error.message : 'unknown error');
      return this.fallback.plan(origin, destination);
    } finally {
      clearTimeout(timer);
    }
  }
}
