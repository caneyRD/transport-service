import { createHmac, createPublicKey, timingSafeEqual, verify } from 'node:crypto';

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export type Authenticate = (authorization: string | undefined) => Promise<string>;

/** Verify the auth service signature and intended recipient before using its subject. */
export function jwtAuthenticator(config: {
  publicKey?: string; secret?: string; issuer?: string; audience?: string;
}): Authenticate {
  const key = config.publicKey ? createPublicKey(config.publicKey.replace(/\\n/g, '\n')) : undefined;
  return async (authorization) => {
    if ((!key && !config.secret) || !config.issuer || !config.audience) {
      throw new HttpError(503, 'Authentication is not configured');
    }
    try {
      if (!authorization?.startsWith('Bearer ')) throw new Error();
      const parts = authorization.slice(7).split('.');
      if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
      const [headerText, payloadText, signatureText] = parts;
      const header = JSON.parse(Buffer.from(headerText, 'base64url').toString());
      const payload = JSON.parse(Buffer.from(payloadText, 'base64url').toString());
      const signature = Buffer.from(signatureText, 'base64url');
      const input = Buffer.from(`${headerText}.${payloadText}`);
      let valid = false;
      if (key && header.alg === 'RS256') valid = verify('RSA-SHA256', input, key, signature);
      if (!key && config.secret && header.alg === 'HS256') {
        const expected = createHmac('sha256', config.secret).update(input).digest();
        valid = signature.length === expected.length && timingSafeEqual(signature, expected);
      }
      const now = Date.now() / 1000;
      if (!valid || typeof payload.sub !== 'string' || !payload.sub.trim() ||
          typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= now ||
          (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || !Number.isFinite(payload.nbf) || payload.nbf > now)) ||
          payload.iss !== config.issuer ||
          !(payload.aud === config.audience || (Array.isArray(payload.aud) && payload.aud.includes(config.audience)))) throw new Error();
      return payload.sub;
    } catch {
      throw new HttpError(401, 'A valid bearer token is required');
    }
  };
}
