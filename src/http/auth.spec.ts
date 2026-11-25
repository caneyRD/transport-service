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

describe('JWT interoperability with the User Service', () => {
  const { generateKeyPairSync, createSign } = jest.requireActual('node:crypto') as typeof import('node:crypto');
  const secret = 'shared-test-secret-between-user-and-transport';
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  // Shape of an access token as the User Service (FastAPI + PyJWT) issues it: typ, iat, role and type claims, aud as a list.
  const claims = (extra: Record<string, unknown> = {}) => ({ sub: '626debb7-d087-4474-bf95-e7f004857f8b', role: 'transportista', type: 'access', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900, iss: 'baney-user-service', aud: ['baney-transport-service'], ...extra });
  const hs256 = (payload: Record<string, unknown>, key = secret) => {
    const input = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
    return `${input}.${createHmac('sha256', key).update(input).digest('base64url')}`;
  };
  const authenticate = jwtAuthenticator({ secret, issuer: 'baney-user-service', audience: 'baney-transport-service' });
  const reason = async (authorization: string | undefined) => {
    try { await authenticate(authorization); return 'ok'; } catch (e) { return (e as { reason?: string }).reason; }
  };

  it('accepts a User Service access token for a carrier (HS256, aud list, extra claims)', async () => {
    expect(await authenticate(`Bearer ${hs256(claims())}`)).toBe('626debb7-d087-4474-bf95-e7f004857f8b');
  });
  it('accepts the scheme in any case and surrounding spaces', async () => {
    expect(await authenticate(`bearer ${hs256(claims())}`)).toBe('626debb7-d087-4474-bf95-e7f004857f8b');
    expect(await authenticate(`  BEARER   ${hs256(claims())}  `)).toBe('626debb7-d087-4474-bf95-e7f004857f8b');
  });
  it('tolerates a small clock difference between the services', async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await authenticate(`Bearer ${hs256(claims({ nbf: now + 10, exp: now - 5 }))}`)).toBeTruthy();
  });
  it('says why a token is refused, without echoing it', async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await reason(undefined)).toBe('missing');
    expect(await reason(`Basic abc`)).toBe('not_bearer');
    expect(await reason(`Bearer Bearer ${hs256(claims())}`)).toBe('malformed');
    expect(await reason(`Bearer "${hs256(claims())}"`)).toBe('malformed');
    expect(await reason(`Bearer some-session-id`)).toBe('malformed');
    expect(await reason(`Bearer ${hs256(claims(), 'another-secret')}`)).toBe('signature');
    expect(await reason(`Bearer ${hs256(claims({ exp: now - 120 }))}`)).toBe('expired');
    expect(await reason(`Bearer ${hs256(claims({ nbf: now + 3600 }))}`)).toBe('not_yet_valid');
    expect(await reason(`Bearer ${hs256(claims({ iss: 'someone-else' }))}`)).toBe('issuer');
    expect(await reason(`Bearer ${hs256(claims({ aud: 'baney-web' }))}`)).toBe('audience');
    expect(await reason(`Bearer ${hs256(claims({ sub: '' }))}`)).toBe('subject');
    const none = `${b64({ alg: 'none' })}.${b64(claims())}.x`;
    expect(await reason(`Bearer ${none}`)).toBe('algorithm');
  });
  it('accepts RS256 tokens when the User Service signs with a private key', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rs = jwtAuthenticator({ publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(), issuer: 'baney-user-service', audience: 'baney-transport-service' });
    const input = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims())}`;
    const signature = createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url');
    expect(await rs(`Bearer ${input}.${signature}`)).toBe('626debb7-d087-4474-bf95-e7f004857f8b');
    await expect(rs(`Bearer ${hs256(claims())}`)).rejects.toMatchObject({ reason: 'algorithm' });
  });
});
