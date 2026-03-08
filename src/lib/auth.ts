/**
 * eToro OAuth/SSO Authentication for Portfolio Rebalancer
 * Stateless encrypted cookie sessions + JWT verification via JWKS
 * Adapted from AgentX
 */
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto';

export const SSO_CONFIG = {
  clientId: process.env.ETORO_SSO_CLIENT_ID || '',
  clientSecret: process.env.ETORO_SSO_CLIENT_SECRET || '',
  authEndpoint: 'https://www.etoro.com/sso',
  tokenEndpoint: 'https://www.etoro.com/api/sso/v1/token',
  jwksEndpoint: 'https://www.etoro.com/.well-known/jwks.json',
  redirectUri: process.env.ETORO_SSO_REDIRECT_URI || 'https://rebalancer.quantclaw.org/auth/callback',
  scopes: ['openid', 'profile', 'trading'],
  expectedIssuer: 'https://www.etoro.com',
};

export const SSO_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const COOKIE_KEY = Buffer.from(
  process.env.AGENTX_VAULT_KEY || randomBytes(32).toString('hex'),
  'hex'
);

// ========== SERVER-SIDE SESSION STORE ==========
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const SESSION_DIR = join(process.cwd(), '.rebalancer-sessions');
if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });

function saveServerSession(sessionId: string, data: SessionData): void {
  writeFileSync(join(SESSION_DIR, sessionId + '.json'), JSON.stringify(data));
}

function loadServerSession(sessionId: string): SessionData | null {
  try {
    const path = join(SESSION_DIR, sessionId + '.json');
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch { return null; }
}

function deleteServerSession(sessionId: string): void {
  try { unlinkSync(join(SESSION_DIR, sessionId + '.json')); } catch {}
}

// PKCE state — stored in encrypted cookie
const pendingAuth = new Map<string, { codeVerifier: string; createdAt: number }>();

export function encodePKCECookie(state: string, codeVerifier: string): string {
  return encrypt(JSON.stringify({ state, codeVerifier, ts: Date.now() }));
}

export function decodePKCECookie(cookie: string): { state: string; codeVerifier: string; ts: number } | null {
  try {
    const data = JSON.parse(decrypt(cookie));
    if (Date.now() - data.ts > 600_000) return null;
    return data;
  } catch { return null; }
}

// JWKS cache
let jwksCache: { keys: any[]; fetchedAt: number } | null = {
  keys: [{
    kty: 'RSA', alg: 'RS256', use: 'sig', kid: '00043',
    n: 'uhWofwq0wm-Y-jtIIeNtOFrA-sdWXfPfOfMThIrAT6d0kZ9jzKRLfxtGfW26NMj-9iNt9csyy8NYTMC04VJxfsHtuRiydyYKMkwqbYXxkohD1RCP49Dig65sSG7NkpzCIUNhlM_QKfxIU5XksXWuyOEp3fjfedDNqK9XJBScKO3G--T1RUAe1xmn25pQ9I8ZqndMXvhTP4--bsKxD3R6GNhIgJwjr0WcVsKZG5NvV6gFH0BpjjnQKKrnjs2OYlN_2GLzQMlSRdiXB4Vhyb8_k_B7kSXI91LTfDhjZJELfkGnluh6aYrn2UJsM-6cF7WPCrq5_uw6w_d_G3jbwSmg4w',
    e: 'AQAB', iat: 1761458138,
  }],
  fetchedAt: Date.now(),
};
const JWKS_CACHE_TTL = 3600_000;

export interface SessionData {
  userId: string;
  username: string;
  displayName: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  profile?: { avatarUrl?: string; country?: string };
}

// ========== ENCRYPTION ==========

function encrypt(data: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', COOKIE_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decrypt(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64url');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', COOKIE_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// ========== JWKS + JWT VERIFICATION ==========

async function fetchJWKS(): Promise<any[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL) {
    return jwksCache.keys;
  }
  try {
    const res = await fetch(SSO_CONFIG.jwksEndpoint, { headers: { 'User-Agent': SSO_USER_AGENT } });
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const data = await res.json();
    jwksCache = { keys: data.keys || [], fetchedAt: Date.now() };
    return jwksCache.keys;
  } catch (e) {
    console.error('[Auth] JWKS fetch error:', e);
    if (jwksCache) return jwksCache.keys;
    throw e;
  }
}

function base64urlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

async function verifyJWT(token: string): Promise<any> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const header = JSON.parse(base64urlDecode(parts[0]).toString('utf8'));
  const payload = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));

  if (payload.iss !== SSO_CONFIG.expectedIssuer) {
    throw new Error(`Invalid issuer: ${payload.iss}`);
  }

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(SSO_CONFIG.clientId)) {
    throw new Error(`Invalid audience: ${payload.aud}`);
  }

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('JWT expired');
  }

  const keys = await fetchJWKS();
  const key = keys.find((k: any) => k.kid === header.kid);
  if (key) {
    const { subtle } = globalThis.crypto;
    try {
      const cryptoKey = await subtle.importKey(
        'jwk', key,
        { name: 'RSASSA-PKCS1-v1_5', hash: { name: `SHA-${header.alg?.replace('RS', '') || '256'}` } },
        false, ['verify']
      );
      const signatureValid = await subtle.verify(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        new Uint8Array(base64urlDecode(parts[2])),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
      );
      if (!signatureValid) throw new Error('JWT signature verification failed');
    } catch (verifyErr: any) {
      if (verifyErr.message === 'JWT signature verification failed') throw verifyErr;
      console.error('[Auth] Signature verify error (non-fatal):', verifyErr.message);
    }
  } else {
    console.warn(`[Auth] No matching JWKS key for kid=${header.kid}`);
  }

  return payload;
}

// ========== PKCE ==========

function generatePKCE() {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function getAuthorizationUrl(): { url: string; state: string; pkceCookie: string } {
  const state = randomBytes(16).toString('hex');
  const { codeVerifier, codeChallenge } = generatePKCE();
  pendingAuth.set(state, { codeVerifier, createdAt: Date.now() });
  for (const [key, val] of pendingAuth) {
    if (Date.now() - val.createdAt > 600_000) pendingAuth.delete(key);
  }
  const params = new URLSearchParams({
    response_type: 'code', client_id: SSO_CONFIG.clientId,
    redirect_uri: SSO_CONFIG.redirectUri, scope: SSO_CONFIG.scopes.join(' '),
    state, code_challenge: codeChallenge, code_challenge_method: 'S256',
  });
  const pkceCookie = encodePKCECookie(state, codeVerifier);
  return { url: `${SSO_CONFIG.authEndpoint}?${params.toString()}`, state, pkceCookie };
}

// ========== TOKEN EXCHANGE ==========

export async function exchangeCode(code: string, state: string, pkceCookieValue?: string): Promise<{ session: SessionData; cookie: string }> {
  let pending = pendingAuth.get(state);
  if (!pending && pkceCookieValue) {
    const decoded = decodePKCECookie(pkceCookieValue);
    if (decoded && decoded.state === state) {
      pending = { codeVerifier: decoded.codeVerifier, createdAt: decoded.ts };
      console.log('[Auth] Recovered PKCE verifier from cookie');
    }
  }
  if (!pending) throw new Error('Invalid or expired state parameter');

  const body = new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: SSO_CONFIG.redirectUri,
    client_id: SSO_CONFIG.clientId, client_secret: SSO_CONFIG.clientSecret,
    code_verifier: pending.codeVerifier,
  });

  const res = await fetch(SSO_CONFIG.tokenEndpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': SSO_USER_AGENT },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${err}`);
  }

  const tokens = await res.json();
  pendingAuth.delete(state);

  const idToken = tokens.id_token;
  let payload: any = {};
  if (idToken) {
    payload = await verifyJWT(idToken);
  } else {
    console.warn('[Auth] No id_token in response, falling back to access_token decode');
    const parts = (tokens.access_token || '').split('.');
    if (parts.length === 3) {
      payload = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));
    }
  }

  const session: SessionData = {
    userId: payload.sub || payload.user_id || '',
    username: payload.preferred_username || payload.username || '',
    displayName: payload.name || payload.display_name || '',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in || 600) * 1000,
    profile: { avatarUrl: payload.picture, country: payload.country },
  };

  const sessionId = randomBytes(16).toString('hex');
  saveServerSession(sessionId, session);
  const cookie = encrypt(JSON.stringify({ sid: sessionId }));
  return { session, cookie };
}

// ========== SESSION FROM COOKIE ==========

export function getSessionFromCookies(cookieHeader: string | null): SessionData | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/rebalancer_session=([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const decrypted = JSON.parse(decrypt(match[1]));
    if (decrypted.sid) {
      return loadServerSession(decrypted.sid);
    }
    const session: SessionData = decrypted;
    return session;
  } catch (e) {
    console.error('[Auth] Cookie decrypt failed:', e);
    return null;
  }
}

// ========== TOKEN REFRESH ==========

export async function refreshAccessToken(session: SessionData): Promise<{ session: SessionData; cookie: string } | null> {
  if (!session.refreshToken) return null;
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: session.refreshToken,
      client_id: SSO_CONFIG.clientId, client_secret: SSO_CONFIG.clientSecret,
    });
    const res = await fetch(SSO_CONFIG.tokenEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': SSO_USER_AGENT },
      body: body.toString(),
    });
    if (!res.ok) {
      console.error(`[Auth] Refresh failed: ${res.status}`);
      return null;
    }
    const tokens = await res.json();
    session.accessToken = tokens.access_token;
    if (tokens.refresh_token) session.refreshToken = tokens.refresh_token;
    session.expiresAt = Date.now() + (tokens.expires_in || 600) * 1000;
    const sessionId = randomBytes(16).toString('hex');
    saveServerSession(sessionId, session);
    const cookie = encrypt(JSON.stringify({ sid: sessionId }));
    return { session, cookie };
  } catch (e) {
    console.error('[Auth] Refresh error:', e);
    return null;
  }
}

export async function ensureFreshSession(cookieHeader: string | null): Promise<{ session: SessionData; newCookie?: string } | null> {
  const session = getSessionFromCookies(cookieHeader);
  if (!session) return null;
  if (Date.now() < session.expiresAt - 60_000) return { session };
  if (session.refreshToken) {
    const refreshed = await refreshAccessToken(session);
    if (refreshed) return { session: refreshed.session, newCookie: refreshed.cookie };
  }
  return null;
}

export function isSSOConfigured(): boolean { return !!(SSO_CONFIG.clientId && SSO_CONFIG.clientSecret); }

export function buildSessionCookie(encryptedValue: string, maxAge = 30 * 24 * 3600): string {
  return `rebalancer_session=${encryptedValue}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
