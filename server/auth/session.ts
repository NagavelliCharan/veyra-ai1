import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Stateless, HMAC-signed session cookie listing the Google accounts verified in this browser.
 * The server stores nothing; tampering with the cookie invalidates the signature.
 */

export interface SessionAccount {
  id: string;
  email: string;
}

interface SessionPayload {
  accounts: SessionAccount[];
  exp: number;
}

const COOKIE_NAME = 'veyra_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ACCOUNTS = 10;

let devSecret: string | null = null;

const getSecret = (): string => {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET (at least 32 characters) must be set in production.');
  }
  // Development fallback: sessions reset whenever the server restarts
  if (!devSecret) {
    devSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[Veyra Auth] SESSION_SECRET not set; using a temporary secret (sign-ins reset on restart).');
  }
  return devSecret;
};

/** Fail fast at boot in production instead of on the first sign-in */
export const assertSessionConfig = () => {
  getSecret();
};

const sign = (data: string) => crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');

const encode = (payload: SessionPayload): string => {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data)}`;
};

const decode = (token: string | undefined): SessionPayload | null => {
  if (!token) return null;
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;
  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload;
    if (!Array.isArray(payload.accounts) || typeof payload.exp !== 'number' || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

const readCookie = (req: Request, name: string): string | undefined => {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > -1 && part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
};

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
});

/** Comma-separated ALLOWED_EMAILS; empty means any Google account that passes Google's own checks */
export const isEmailAllowed = (email: string): boolean => {
  const allowed = (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(email.toLowerCase());
};

export const getSessionAccounts = (req: Request): SessionAccount[] => {
  const accounts = decode(readCookie(req, COOKIE_NAME))?.accounts ?? [];
  // Re-check the allowlist so removing an email from ALLOWED_EMAILS revokes access immediately
  return accounts.filter((a) => isEmailAllowed(a.email));
};

const writeSession = (res: Response, accounts: SessionAccount[]) => {
  if (accounts.length === 0) {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return;
  }
  const token = encode({ accounts, exp: Date.now() + SESSION_TTL_MS });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_TTL_MS });
};

export const addSessionAccount = (req: Request, res: Response, account: SessionAccount) => {
  const others = getSessionAccounts(req).filter((a) => a.id !== account.id);
  writeSession(res, [...others, account].slice(-MAX_ACCOUNTS));
};

export const removeSessionAccount = (req: Request, res: Response, accountId: string | null) => {
  const remaining = accountId === null ? [] : getSessionAccounts(req).filter((a) => a.id !== accountId);
  writeSession(res, remaining);
};

/** Rejects requests that don't carry a valid session for an allowed Google account */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (getSessionAccounts(req).length === 0) {
    res.status(401).json({ error: 'Please sign in with your Google account to continue.' });
    return;
  }
  next();
};

/** Builds a Cookie header value for the given accounts (used by automated tests) */
export const createSessionCookieHeader = (accounts: SessionAccount[]): string =>
  `${COOKIE_NAME}=${encode({ accounts, exp: Date.now() + SESSION_TTL_MS })}`;
