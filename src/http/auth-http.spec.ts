import { createHmac } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { createTransportServer } from './server';
import { jwtAuthenticator } from './auth';
import { swaggerHtml } from './openapi';

// End to end over HTTP with the real authenticator: a carrier token reaches POST /carrier/requests/:id/confirm.
describe('Bearer tokens over HTTP', () => {
  const secret = 'shared-test-secret-between-user-and-transport';
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = (extra: Record<string, unknown> = {}) => {
    const input = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'carrier-1', role: 'transportista', exp: Math.floor(Date.now() / 1000) + 900, iss: 'baney-user-service', aud: 'baney-transport-service', ...extra })}`;
    return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
  };
  let server: Server, base: string, confirmedBy: string | undefined;
  beforeEach(async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    confirmedBy = undefined;
    const operations = { confirm: async (_requestId: string, userId: string) => { confirmedBy = userId; return { state: 'programado' }; } };
    server = createTransportServer({ execute: (action: (r: unknown) => unknown) => action({ operations }), health: async () => undefined } as never,
      jwtAuthenticator({ secret, issuer: 'baney-user-service', audience: 'baney-transport-service' }));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { jest.restoreAllMocks(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const confirm = (authorization?: string) => fetch(`${base}/carrier/requests/e531508d-2993-41b5-92fa-66f1b5fd44e6/confirm`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) }, body: '{}' });

  it('the carrier token from the User Service confirms the trip as that carrier', async () => {
    const response = await confirm(`Bearer ${token()}`);
    expect(response.status).toBe(200);
    expect(confirmedBy).toBe('carrier-1');
  });
  it('a 401 explains the cause and never echoes the token', async () => {
    const expired = token({ exp: Math.floor(Date.now() / 1000) - 600 });
    const response = await confirm(`Bearer ${expired}`);
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer error="invalid_token", error_description="expired"');
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ message: 'A valid bearer token is required', reason: 'expired' });
    expect(text).not.toContain(expired.split('.')[1]);
    expect(confirmedBy).toBeUndefined();
  });
  it('a cookie alone is not a credential', async () => {
    const response = await fetch(`${base}/carrier/requests/x/confirm`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `access_token=${token()}` }, body: '{}' });
    expect(response.status).toBe(401);
    expect((await response.json()).reason).toBe('missing');
  });
  it('Swagger sends "Bearer <token>" once even if "Bearer" or quotes were pasted', () => {
    const body = /requestInterceptor: (function \(req\) \{[\s\S]*?return req;\s*\})/.exec(swaggerHtml)![1];
    const interceptor = new Function(`return ${body}`)() as (r: { headers: Record<string, string> }) => { headers: Record<string, string> };
    expect(interceptor({ headers: { Authorization: 'Bearer Bearer abc.def.ghi' } }).headers.Authorization).toBe('Bearer abc.def.ghi');
    expect(interceptor({ headers: { Authorization: 'Bearer "abc.def.ghi"' } }).headers.Authorization).toBe('Bearer abc.def.ghi');
    expect(interceptor({ headers: { Authorization: 'Bearer abc.def.ghi' } }).headers.Authorization).toBe('Bearer abc.def.ghi');
  });
});
