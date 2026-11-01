import { createHmac } from 'node:crypto';
import { jwtAuthenticator } from './auth';

describe('JWT authentication', () => {
  const secret = 'a-test-only-secret-not-a-production-key';
  const authenticate = jwtAuthenticator({ secret, issuer: 'auth-service', audience: 'transport-service' });
  const token = (claims: Record<string, unknown> = {}, algorithm = 'HS256') => {
    const header = Buffer.from(JSON.stringify({ alg: algorithm })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'client-1', exp: Date.now() / 1000 + 60, iss: 'auth-service', aud: 'transport-service', ...claims })).toString('base64url');
    const input = `${header}.${payload}`;
    return `Bearer ${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
  };
  it('uses the subject of a valid signed token', async () => expect(await authenticate(token())).toBe('client-1'));
  it.each([
    [{ exp: 1 }, 'HS256'], [{ aud: 'another-api' }, 'HS256'], [{ iss: 'attacker' }, 'HS256'],
    [{ nbf: Date.now() / 1000 + 3600 }, 'HS256'], [{ sub: '' }, 'HS256'], [{}, 'none'],
  ])('rejects invalid claims or algorithms %j %s', async (claims, algorithm) => {
    await expect(authenticate(token(claims as Record<string, unknown>, algorithm as string))).rejects.toMatchObject({ status: 401 });
  });
  it('rejects missing credentials and tampered signatures', async () => {
    await expect(authenticate(undefined)).rejects.toMatchObject({ status: 401 });
    await expect(authenticate(token() + 'a')).rejects.toMatchObject({ status: 401 });
  });
  it('fails closed when authentication is not configured', async () => {
    await expect(jwtAuthenticator({})(token())).rejects.toMatchObject({ status: 503 });
  });
});
