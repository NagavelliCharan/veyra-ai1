// Signed test session so API tests can reach endpoints that require Google sign-in.
// Loads .env first so the cookie matches the SESSION_SECRET of a locally running server.
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

const { createSessionCookieHeader } = await import('../../server/auth/session.ts');

export const AUTH_COOKIE = createSessionCookieHeader([{ id: 'test-account', email: 'tester@example.com' }]);

/** fetch() that carries the test session cookie */
export const authFetch = (url, options = {}) =>
  fetch(url, { ...options, headers: { ...(options.headers || {}), Cookie: AUTH_COOKIE } });
