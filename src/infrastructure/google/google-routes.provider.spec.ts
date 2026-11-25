import { GoogleRoutesProvider } from './google-routes.provider';

const A = { latitude: 18.4735, longitude: -69.9406 }, B = { latitude: 18.5601, longitude: -68.3725 };
const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

describe('Google Routes provider (UC-TRA-09/45/72)', () => {
  it('asks Google for a driving route with the key in a header and only the needed fields', async () => {
    const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(() => ok({ routes: [{ distanceMeters: 187450, duration: '9012s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' } }] }));
    const provider = new GoogleRoutesProvider('test-key', fetchMock as unknown as typeof fetch);
    expect(await provider.plan(A, B)).toEqual({ distanceKm: 187.45, durationMinutes: 151, polyline: '_p~iF~ps|U_ulLnnqC', provider: 'GOOGLE_ROUTES' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe('test-key');
    expect(headers['X-Goog-FieldMask']).toBe('routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline');
    expect(String(url)).not.toContain('test-key');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({ travelMode: 'DRIVE', origin: { location: { latLng: A } }, destination: { location: { latLng: B } } });
  });

  it('reuses a recent route for practically the same points', async () => {
    const fetchMock = jest.fn(() => ok({ routes: [{ distanceMeters: 1000, duration: '120s' }] }));
    const provider = new GoogleRoutesProvider('k', fetchMock as unknown as typeof fetch);
    await provider.plan(A, B);
    await provider.plan({ latitude: A.latitude + 0.00001, longitude: A.longitude }, B);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await provider.plan({ latitude: 18.48, longitude: -69.95 }, B);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the straight-line estimate on errors, without caching the fallback', async () => {
    const errors: string[] = [];
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(new Response('{"error":{"status":"PERMISSION_DENIED"}}', { status: 403 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockRejectedValueOnce(new Error('network down'))
      .mockImplementationOnce(() => ok({ routes: [{ distanceMeters: 200000, duration: '9000s' }] }));
    const provider = new GoogleRoutesProvider('secret-key', fetchMock as unknown as typeof fetch, { onError: r => errors.push(r) });
    for (let i = 0; i < 3; i++) {
      const plan = await provider.plan(A, B);
      expect(plan.provider).toBe('GEODESIC_ESTIMATE');
      expect(plan.distanceKm).toBeGreaterThan(160);
      expect(plan.polyline).toBeUndefined();
    }
    expect((await provider.plan(A, B)).provider).toBe('GOOGLE_ROUTES');
    expect(errors).toEqual(['Google Routes HTTP 403', 'Google Routes returned no route', 'network down']);
    expect(errors.join(' ')).not.toContain('secret-key');
  });

  it('gives up after the timeout and still answers', async () => {
    const hang = jest.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const provider = new GoogleRoutesProvider('k', hang as unknown as typeof fetch, { timeoutMs: 20 });
    expect((await provider.plan(A, B)).provider).toBe('GEODESIC_ESTIMATE');
  });
});
