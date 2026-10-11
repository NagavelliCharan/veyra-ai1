import path from 'node:path';
import fs from 'node:fs';
import dns from 'node:dns';
import cors from 'cors';
import dotenv from 'dotenv';

// Configure public DNS fallback to prevent querySrv ECONNREFUSED on Windows for MongoDB Atlas
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore fallback failure
}

import express, { type Request, type Response, type NextFunction } from 'express';
import { geminiService, MissingApiKeyError as GeminiMissingApiKeyError } from './geminiService.ts';
import { groqService, MissingApiKeyError as GroqMissingApiKeyError } from './groqService.ts';
import type { ChatRequestBody, ChatResponseBody, HealthResponseBody } from './types.ts';
import fileRoutes from './routes/fileRoutes.ts';
import authRoutes from './routes/authRoutes.ts';
import { assertSessionConfig, requireAuth } from './auth/session.ts';
import { storageManager } from './storage/storageManager.ts';

// Load environment variables from .env file
dotenv.config();

assertSessionConfig();

// Initialize persistent storage manager
storageManager.init().catch((err) => {
  console.error('[Veyra Storage] Initialization error:', err);
});

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Disable technology fingerprinting header
app.disable('x-powered-by');

// Trust first proxy hop (for reverse proxies like Nginx, Caddy, Cloudflare, Railway)
app.set('trust proxy', 1);

// Comprehensive security headers & Content Security Policy (CSP)
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; img-src 'self' data: blob: https://*.googleusercontent.com; font-src 'self'; object-src 'self' blob: data:; connect-src 'self' https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  next();
});

// Basic in-memory rate limiter to prevent automated flood / abuse
interface RateLimitRecord {
  count: number;
  resetTime: number;
}
const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // 30 requests per minute

function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown-client';
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({
      error: 'Rate limit exceeded. Please wait a minute before sending more messages.',
    });
    return;
  }

  record.count += 1;
  next();
}

// Configurable CORS protection
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : null;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || !allowedOrigins || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

app.use('/api/auth', rateLimiterMiddleware, authRoutes);

// Everything that touches files or the AI key requires a signed-in Google account
app.use(['/api/folders', '/api/files', '/api/directory', '/api/chat'], requireAuth);

// Mount persistent file and folder routes
app.use('/api', fileRoutes);

/**
 * Health check endpoint
 * Inspects server connectivity and whether GEMINI_API_KEY / GROQ_API_KEY is set.
 * Never outputs keys themselves.
 */
app.get('/api/health', (_req: Request, res: Response) => {
  const geminiConfigured = geminiService.isConfigured();
  const groqConfigured = groqService.isConfigured();
  const isConfigured = geminiConfigured || groqConfigured;
  const activeProvider = geminiConfigured ? 'gemini' : (groqConfigured ? 'groq' : 'none');
  const activeModel = geminiConfigured
    ? geminiService.getModelName()
    : (groqConfigured ? groqService.getModelName() : 'none');

  const responseData: HealthResponseBody = {
    status: isConfigured ? 'ok' : 'degraded',
    provider: activeProvider,
    geminiConfigured,
    groqConfigured,
    model: activeModel,
    storageBackend: storageManager.isDatabaseConnected() ? 'mongodb' : 'disk',
  };
  res.json(responseData);
});

/**
 * Chat completion endpoint
 *
 * Privacy Guarantees:
 * 1. Requires explicit consent flag (consentGiven: true).
 * 2. No database or disk persistence whatsoever.
 * 3. Never logs prompt contents or AI responses to stdout/stderr.
 */
app.post('/api/chat', rateLimiterMiddleware, async (req: Request, res: Response) => {
  const body = req.body as Partial<ChatRequestBody>;

  // 1. Consent Verification
  if (body?.consentGiven !== true) {
    res.status(403).json({
      error: 'Explicit user consent is required before sending messages to Cloud AI.',
    });
    return;
  }

  // 2. Input Validation
  if (!body.message || typeof body.message !== 'string' || !body.message.trim()) {
    res.status(400).json({
      error: 'Message is required and must be a non-empty string.',
    });
    return;
  }

  if (body.message.length > 10000) {
    res.status(400).json({
      error: 'Message exceeds maximum allowed length of 10,000 characters.',
    });
    return;
  }

  // 3. Provider Selection & API Key Check
  const geminiReady = geminiService.isConfigured();
  const groqReady = groqService.isConfigured();

  const useGroq = (body.provider === 'groq' && groqReady) || (!geminiReady && groqReady);
  const useGemini = !useGroq && geminiReady;

  if (!useGemini && !useGroq) {
    res.status(503).json({
      error:
        'Neither GEMINI_API_KEY nor GROQ_API_KEY is configured on the server. Please copy .env.example to .env and configure your key.',
    });
    return;
  }

  // 4. Generate Cloud Reply
  try {
    let result: ChatResponseBody;
    if (useGemini) {
      result = await geminiService.generateReply(
        body.message,
        body.conversationHistory
      );
    } else {
      result = await groqService.generateReply(
        body.message,
        body.conversationHistory
      );
    }

    res.json(result);
  } catch (err: any) {
    if (err instanceof GeminiMissingApiKeyError || err instanceof GroqMissingApiKeyError) {
      res.status(503).json({ error: err.message });
      return;
    }

    res.status(500).json({
      error: err?.message || 'An error occurred while generating response with Cloud AI API.',
    });
  }
});

// Centralized error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request payload too large. Maximum size is 100kb.' });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Malformed JSON payload.' });
    return;
  }
  res.status(500).json({ error: 'Internal server error.' });
});

// Production static frontend serving (SPA fallback)
const distPath = path.resolve('dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      next();
    }
  });
}

// Start server when run directly
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[Veyra AI Backend] Server running on http://localhost:${PORT}`);
    console.log(`[Veyra AI Backend] Gemini API configured: ${geminiService.isConfigured() ? 'YES (' + geminiService.getModelName() + ')' : 'NO'}`);
    console.log(`[Veyra AI Backend] Groq API configured: ${groqService.isConfigured() ? 'YES' : 'NO'}`);
  });
}

export default app;
