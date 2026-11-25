import { createHmac, createPublicKey, timingSafeEqual, verify } from 'node:crypto';

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** Why a bearer token was refused. Safe to show: it never contains the token or the expected values. */
export type AuthFailure = 'missing' | 'not_bearer' | 'malformed' | 'algorithm' | 'signature' | 'expired' | 'not_yet_valid' | 'issuer' | 'audience' | 'subject';

const HINTS: Record<AuthFailure, string> = {
  missing: 'Send the header Authorization: Bearer <access_token>.',
  not_bearer: 'The Authorization header must start with "Bearer " followed by the access_token.',
  malformed: 'That is not a JWT. Use the access_token returned by POST /api/v1/auth/login?session=token (not a cookie, refresh token or session id), without quotes and with "Bearer" only once.',
  algorithm: 'The token is signed with an algorithm this service is not configured for.',
  signature: 'The signature does not match: the User Service and the Transport Service do not share the same JWT key.',
  expired: 'The access_token expired: sign in again (or refresh it) and send the new one.',
  not_yet_valid: 'The token is not valid yet (nbf in the future): check the server clocks.',
  issuer: 'The token issuer (iss) is not the one this service expects (JWT_ISSUER).',
  audience: 'The token audience (aud) is not the one this service expects (JWT_AUDIENCE).',
  subject: 'The token has no user id (sub).',
};

export class AuthenticationError extends HttpError {
  constructor(readonly reason: AuthFailure) { super(401, 'A valid bearer token is required'); }
  get hint() { return HINTS[this.reason]; }
}

export type Authenticate = (authorization: string | undefined) => Promise<string>;

/** Seconds of clock difference tolerated between the services for exp and nbf. */
export const CLOCK_SKEW_SECONDS = 30;

/** "Bearer <token>": the scheme is case-insensitive (RFC 7235) and surrounding spaces are ignored. */
export function bearerToken(authorization: string | undefined): string {
  if (!authorization?.trim()) throw new AuthenticationError('missing');
  const match = /^\s*Bearer\s+(\S+)\s*$/i.exec(authorization);
  if (!match) throw new AuthenticationError(/^\s*Bearer\b/i.test(authorization) ? 'malformed' : 'not_bearer');
  return match[1];
}

const decodeJson = (part: string) => {
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); } catch { throw new AuthenticationError('malformed'); }
};

/** Verify the auth service signature and intended recipient before using its subject. */
export function jwtAuthenticator(config: {
  publicKey?: string; secret?: string; issuer?: string; audience?: string;
}): Authenticate {
  const key = config.publicKey ? createPublicKey(config.publicKey.replace(/\\n/g, '\n')) : undefined;
  return async (authorization) => {
    if ((!key && !config.secret) || !config.issuer || !config.audience) {
      throw new HttpError(503, 'Authentication is not configured');
    }
    const parts = bearerToken(authorization).split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new AuthenticationError('malformed');
    const [headerText, payloadText, signatureText] = parts;
    const header = decodeJson(headerText), payload = decodeJson(payloadText);
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') throw new AuthenticationError('malformed');
    const signature = Buffer.from(signatureText, 'base64url');
    const input = Buffer.from(`${headerText}.${payloadText}`);
    let valid: boolean;
    if (key && header.alg === 'RS256') valid = verify('RSA-SHA256', input, key, signature);
    else if (!key && config.secret && header.alg === 'HS256') {
      const expected = createHmac('sha256', config.secret).update(input).digest();
      valid = signature.length === expected.length && timingSafeEqual(signature, expected);
    } else throw new AuthenticationError('algorithm');
    if (!valid) throw new AuthenticationError('signature');
    const now = Date.now() / 1000;
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp + CLOCK_SKEW_SECONDS <= now) throw new AuthenticationError('expired');
    if (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || !Number.isFinite(payload.nbf) || payload.nbf - CLOCK_SKEW_SECONDS > now)) throw new AuthenticationError('not_yet_valid');
    if (payload.iss !== config.issuer) throw new AuthenticationError('issuer');
    if (!(payload.aud === config.audience || (Array.isArray(payload.aud) && payload.aud.includes(config.audience)))) throw new AuthenticationError('audience');
    if (typeof payload.sub !== 'string' || !payload.sub.trim()) throw new AuthenticationError('subject');
    return payload.sub;
  };
}
