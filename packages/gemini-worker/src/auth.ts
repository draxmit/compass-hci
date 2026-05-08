import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Validate a Firebase Auth ID token against Google's published JWKS.
 *
 * The Worker has no Firestore SDK and no service-account credentials —
 * we just need to confirm the bearer token was minted by Firebase for
 * this project, then trust the embedded uid for downstream KV /
 * rate-limiting decisions.
 */

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

// Cache the JWKS in module scope. Cloudflare Workers reuse the isolate
// across requests, so this effectively pins the key set per-process.
// `cooldownDuration` prevents hammering the JWKS endpoint on bad tokens.
const JWKS = createRemoteJWKSet(new URL(JWKS_URL), {
  cooldownDuration: 30_000,
  cacheMaxAge: 60 * 60 * 1000, // 1 hour
});

/**
 * Verify a Firebase ID token and return the user's uid.
 *
 * Throws on:
 *   - bad signature (not minted by Google)
 *   - wrong audience (token from a different Firebase project)
 *   - expired (`exp` in the past)
 *   - malformed (no `sub` claim)
 */
export async function verifyFirebaseToken(
  token: string,
  projectId: string,
): Promise<{ uid: string; email?: string }> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  const uid = typeof payload.sub === 'string' ? payload.sub : null;
  if (!uid) {
    throw new Error('jwt missing sub claim');
  }
  return {
    uid,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  };
}
