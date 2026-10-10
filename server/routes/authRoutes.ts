import express, { type Request, type Response } from 'express';

const router = express.Router();

const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

// The OAuth client ID is public (it ships in the frontend bundle), so one env var serves both sides
const getGoogleClientId = () =>
  process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';

interface GoogleTokenInfo {
  aud?: string;
  iss?: string;
  sub?: string;
  email?: string;
  email_verified?: string;
  name?: string;
  picture?: string;
  exp?: string;
}

/**
 * Verifies a "Sign in with Google" ID token and returns the public profile.
 *
 * Privacy: the token is sent only to Google's tokeninfo endpoint, never stored or logged,
 * and the server keeps no session — the profile lives in the user's browser only.
 */
router.post('/google', async (req: Request, res: Response) => {
  const clientId = getGoogleClientId();
  if (!clientId) {
    res.status(503).json({ error: 'Google sign-in is not configured on the server (VITE_GOOGLE_CLIENT_ID).' });
    return;
  }

  const credential = (req.body as { credential?: unknown })?.credential;
  if (typeof credential !== 'string' || credential.length < 20 || credential.length > 4096) {
    res.status(400).json({ error: 'Missing or malformed Google credential.' });
    return;
  }

  try {
    // POST keeps the token out of URLs and access logs
    const response = await fetch('https://oauth2.googleapis.com/tokeninfo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: credential }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      res.status(401).json({ error: 'Google could not verify this sign-in. Please try again.' });
      return;
    }

    const info = (await response.json()) as GoogleTokenInfo;
    const expiresAt = Number(info.exp) * 1000;

    if (
      info.aud !== clientId ||
      !info.iss ||
      !GOOGLE_ISSUERS.has(info.iss) ||
      !info.sub ||
      !info.email ||
      info.email_verified !== 'true' ||
      !Number.isFinite(expiresAt) ||
      expiresAt < Date.now()
    ) {
      res.status(401).json({ error: 'This Google sign-in is invalid or has expired.' });
      return;
    }

    res.json({
      id: info.sub,
      email: info.email,
      name: info.name || info.email.split('@')[0],
      picture: info.picture || '',
    });
  } catch (err: any) {
    console.error('[Veyra Auth] Google token verification failed:', err?.name || 'error');
    res.status(502).json({ error: 'Could not reach Google to verify sign-in. Check your connection.' });
  }
});

export default router;
