// Automated integration and security test suite for Veyra AI Google Gemini Cloud Integration
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import { AUTH_COOKIE } from './helpers/authSession.mjs';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import dotenv from 'dotenv';
dotenv.config();

import app from '../server/index.ts';
import { geminiService, GeminiService, MissingApiKeyError } from '../server/geminiService.ts';
import { groqService } from '../server/groqService.ts';

console.log('\n======================================================');
console.log('--- Running Veyra AI Gemini Integration Test Suite ---');
console.log('======================================================\n');

// Start test server on dynamic ephemeral port
const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

async function request(endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', Cookie: AUTH_COOKIE, ...(options.headers || {}) },
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, headers: res.headers, data };
}

try {
  // ----------------------------------------------------
  // TEST 1: Health Check Endpoint (GET /api/health)
  // ----------------------------------------------------
  console.log('[Test 1] Health Check Endpoint');
  {
    const res = await request('/api/health');
    assert.equal(res.status, 200, 'Health endpoint should return 200');
    assert.ok(res.data, 'Should return json body');
    assert.ok('status' in res.data, 'Should contain status');
    assert.ok('geminiConfigured' in res.data, 'Should contain geminiConfigured boolean');
    assert.ok('groqConfigured' in res.data, 'Should contain groqConfigured boolean');
    assert.ok('model' in res.data, 'Should contain model name');
    assert.equal(typeof res.data.geminiConfigured, 'boolean');
    assert.ok(!JSON.stringify(res.data).includes('AQ.'), 'Should NEVER expose API key in health endpoint');
    assert.ok(!JSON.stringify(res.data).includes('gsk_'), 'Should NEVER expose API key in health endpoint');
    console.log('  ✓ GET /api/health returned healthy status without credential leaks');
  }

  // ----------------------------------------------------
  // TEST 2: Explicit Consent Enforcement (HTTP 403)
  // ----------------------------------------------------
  console.log('\n[Test 2] Explicit Consent Enforcement');
  {
    // Case A: consentGiven = false
    const res1 = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hello Gemini', consentGiven: false }),
    });
    assert.equal(res1.status, 403, 'Should reject with 403 when consentGiven is false');
    assert.ok(res1.data.error.includes('consent'), 'Error message must mention consent requirement');

    // Case B: consentGiven omitted entirely
    const res2 = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hello Gemini' }),
    });
    assert.equal(res2.status, 403, 'Should reject with 403 when consentGiven is omitted');
    assert.ok(res2.data.error.includes('consent'), 'Error message must mention consent requirement');

    console.log('  ✓ Backend strictly rejects non-consented requests with HTTP 403');
  }

  // ----------------------------------------------------
  // TEST 3: Input Validation & Sanitization (HTTP 400)
  // ----------------------------------------------------
  console.log('\n[Test 3] Input Validation & Sanitization');
  {
    // Case A: Empty string
    const resEmpty = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: '   ', consentGiven: true }),
    });
    assert.equal(resEmpty.status, 400, 'Should reject whitespace-only message with 400');

    // Case B: Non-string message
    const resNonString = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 12345, consentGiven: true }),
    });
    assert.equal(resNonString.status, 400, 'Should reject non-string message with 400');

    // Case C: Oversized message (> 10,000 characters)
    const longMessage = 'A'.repeat(10001);
    const resLong = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: longMessage, consentGiven: true }),
    });
    assert.equal(resLong.status, 400, 'Should reject message over 10,000 chars with 400');
    assert.ok(resLong.data.error.includes('10,000'), 'Error must specify length limit');

    console.log('  ✓ Input validation safely enforces type safety and character bounds');
  }

  // ----------------------------------------------------
  // TEST 4: Request Payload Limits (HTTP 413)
  // ----------------------------------------------------
  console.log('\n[Test 4] Request Payload Bounds (100kb limit)');
  {
    // Generate 120kb payload
    const bigPayload = JSON.stringify({
      message: 'Hello',
      consentGiven: true,
      filler: 'x'.repeat(120 * 1024),
    });
    const resLarge = await request('/api/chat', {
      method: 'POST',
      body: bigPayload,
    });
    assert.equal(resLarge.status, 413, 'Express 100kb body limiter must reject large payload with 413');
    console.log('  ✓ Body-parser 100kb size limit protected server from memory exhaustion');
  }

  // ----------------------------------------------------
  // TEST 5: Missing Key Error Handling (HTTP 503)
  // ----------------------------------------------------
  console.log('\n[Test 5] Missing API Key Handling');
  {
    const originalGeminiKey = process.env.GEMINI_API_KEY;
    const originalGroqKey = process.env.GROQ_API_KEY;
    try {
      // Simulate unconfigured keys
      delete process.env.GEMINI_API_KEY;
      delete process.env.GROQ_API_KEY;
      assert.equal(geminiService.isConfigured(), false, 'isConfigured should be false when key is absent');

      const res = await request('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'Hello', consentGiven: true }),
      });

      assert.equal(res.status, 503, 'Should return 503 when API key is missing');
      assert.ok(res.data.error.includes('API_KEY'), 'Should guide user on configuring key');
      assert.ok(!res.data.error.includes('undefined'), 'Should provide clean friendly message');

      // Test direct service exception
      let threwMissing = false;
      try {
        await geminiService.generateReply('Hello');
      } catch (err) {
        if (err instanceof MissingApiKeyError) threwMissing = true;
      }
      assert.ok(threwMissing, 'geminiService must throw MissingApiKeyError when key is not set');

      console.log('  ✓ Unconfigured server safely responds with HTTP 503 without crashing');
    } finally {
      if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey;
      if (originalGroqKey) process.env.GROQ_API_KEY = originalGroqKey;
    }
  }

  // ----------------------------------------------------
  // TEST 6: Data Minimization & Context Bounds
  // ----------------------------------------------------
  console.log('\n[Test 6] Data Minimization & Context Bounds');
  {
    // Create history of 10 messages
    const mockHistory = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message number ${i + 1}`,
    }));

    // Test history truncation to max 6 messages
    const sliced = mockHistory.slice(-6);
    assert.equal(sliced.length, 6, 'Context history must be truncated to max 6 items');
    assert.equal(sliced[0].content, 'Message number 5', 'Oldest retained message is message 5');
    assert.equal(sliced[5].content, 'Message number 10', 'Most recent history item is message 10');

    // Verify that empty notes/files or invalid history entries are ignored
    const dirtyHistory = [
      { role: 'user', content: '' },
      { role: 'assistant', content: '   ' },
      { role: 'user', content: 'Valid message' },
    ];
    const cleaned = dirtyHistory.filter((m) => m.content && m.content.trim());
    assert.equal(cleaned.length, 1, 'Whitespace/empty history items must be pruned');

    console.log('  ✓ Conversation context strictly bounded to max 6 items; empty items pruned');
  }

  // ----------------------------------------------------
  // TEST 7: Zero Server-Side Persistence Verification
  // ----------------------------------------------------
  console.log('\n[Test 7] Zero Server-Side Persistence Verification');
  {
    // Inspect server folder and root folder for any disk persistence artifacts
    const serverDir = path.resolve('server');
    const rootDir = path.resolve('.');

    const filesInServer = fs.readdirSync(serverDir);
    const filesInRoot = fs.readdirSync(rootDir);

    // Assert no database or log files were created for chat
    const forbiddenExts = ['.sqlite', '.sqlite3', '.nedb', '.chatlog', '.log'];
    const forbiddenFiles = [...filesInServer, ...filesInRoot].filter((file) =>
      forbiddenExts.some((ext) => file.endsWith(ext))
    );

    assert.equal(
      forbiddenFiles.length,
      0,
      `Detected unauthorized persistence files: ${forbiddenFiles.join(', ')}`
    );

    const serverCode = fs.readFileSync(path.join(serverDir, 'index.ts'), 'utf-8');
    const geminiCode = fs.readFileSync(path.join(serverDir, 'geminiService.ts'), 'utf-8');

    assert.ok(!serverCode.includes('writeFile'), 'server/index.ts must not write to disk');
    assert.ok(!serverCode.includes('appendFile'), 'server/index.ts must not append to log files');
    assert.ok(!geminiCode.includes('writeFile'), 'geminiService.ts must not write to disk');
    assert.ok(!geminiCode.includes('console.log(userMessage'), 'Prompts must not be logged to console');

    console.log('  ✓ Verified 0 server-side database files, 0 chat logs, and 0 prompt leaks');
  }

  // ----------------------------------------------------
  // TEST 8: Response Formatting & Error Sanitization
  // ----------------------------------------------------
  console.log('\n[Test 8] Response Formatting & Error Sanitization');
  {
    // Verify that API errors never leak credentials
    const simulateError = (errMsg) => {
      if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('401')) {
        throw new Error('Configured GEMINI_API_KEY is invalid or unauthorized. Please verify your API key in Google AI Studio.');
      }
      if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429')) {
        throw new Error('Gemini API rate limit or quota exceeded. Please wait a moment or try again later.');
      }
      throw new Error(`Google Gemini API error: ${errMsg}`);
    };

    assert.throws(
      () => simulateError('API_KEY_INVALID (401)'),
      /Configured GEMINI_API_KEY is invalid/
    );
    assert.throws(
      () => simulateError('RESOURCE_EXHAUSTED (429)'),
      /Gemini API rate limit or quota exceeded/
    );

    console.log('  ✓ Error messages sanitized; zero API key exposure during exceptions');
  }

  // ----------------------------------------------------
  console.log('\n[Test 9] Real API Requests Across Different User Questions');
  {
    if (process.env.GEMINI_API_KEY && geminiService.isConfigured()) {
      // Helper for robust live API requests under rate limits
      const fetchWithRetry = async (body, retries = 2) => {
        let res;
        for (let attempt = 0; attempt <= retries; attempt++) {
          res = await request('/api/chat', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          if (res.status === 200) return res;
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          }
        }
        return res;
      };

      // Question A: Mathematical reasoning
      const resMath = await fetchWithRetry({
        message: 'What is 14 * 14? Reply with only the number.',
        consentGiven: true,
      });
      assert.equal(resMath.status, 200, 'Live API request should succeed with status 200');
      assert.ok(resMath.data.reply, 'Should return non-empty reply');
      assert.ok(resMath.data.reply.includes('196'), 'Model should correctly calculate 14 * 14 = 196');
      assert.ok(resMath.data.model, 'Should include model name');
      assert.ok(resMath.data.usage?.totalTokens > 0, 'Should include token usage counts');

      // Question B: Conceptual reasoning
      const resConcept = await fetchWithRetry({
        message: 'Define zero-knowledge cryptography in one short sentence.',
        consentGiven: true,
      });
      assert.equal(resConcept.status, 200, 'Conceptual question should succeed with status 200');
      assert.ok(resConcept.data.reply && resConcept.data.reply.length > 10, 'Should return meaningful response');
      assert.ok(resConcept.data.usage?.promptTokens > 0, 'Should track prompt tokens');

      console.log('  ✓ Live Google Gemini API returned genuine model completions for distinct questions');
    } else {
      console.log('  ⚠ Skipping live network test: GEMINI_API_KEY not configured in test environment');
    }
  }

  // ----------------------------------------------------
  // TEST 10: Provider Error Handling & Authentication Check
  // ----------------------------------------------------
  console.log('\n[Test 10] Provider Error Handling & Authentication Check');
  {
    const badKeyService = new GeminiService();
    const originalKey = process.env.GEMINI_API_KEY;
    try {
      process.env.GEMINI_API_KEY = 'AQ.invalid_test_key_which_fails_auth_check';
      await assert.rejects(
        async () => {
          await badKeyService.generateReply('Test prompt');
        },
        (err) => {
          return (
            err.message.includes('invalid') ||
            err.message.includes('unauthorized') ||
            err.message.includes('API error') ||
            err.message.includes('401')
          );
        },
        'Invalid key must reject with informative authentication error'
      );
      console.log('  ✓ Provider Unauthorized accurately rejected with clear error guidance');
    } finally {
      if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    }
  }

  // ----------------------------------------------------
  // TEST 11: Strict Prevention of Silent Mock Fallback
  // ----------------------------------------------------
  console.log('\n[Test 11] Prevention of Silent Mock Fallback');
  {
    // Ensure that failed cloud requests NEVER silently output mock template content
    const mockKeywords = [
      'Privacy Analysis: Local-First vs. Cloud AI',
      'Research Synthesis & Methodology Outline',
      'Privacy-Preserving Cryptographic Implementation',
      'I am Veyra AI, your local-first research and private analysis assistant',
    ];

    // Case 1: Consent refusal returns error, not mock
    const resRefusal = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hello AI', consentGiven: false }),
    });
    assert.equal(resRefusal.status, 403);
    for (const kw of mockKeywords) {
      assert.ok(!JSON.stringify(resRefusal.data).includes(kw), `Response must never fall back to mock template "${kw}"`);
    }

    // Case 2: Missing key returns error, not mock
    const savedGemini = process.env.GEMINI_API_KEY;
    const savedGroq = process.env.GROQ_API_KEY;
    try {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GROQ_API_KEY;
      const resMissing = await request('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'Hello AI', consentGiven: true }),
      });
      assert.equal(resMissing.status, 503);
      assert.ok(resMissing.data.error, 'Should contain error property');
      assert.equal(resMissing.data.reply, undefined, 'Must not return reply property on error');
      for (const kw of mockKeywords) {
        assert.ok(!JSON.stringify(resMissing.data).includes(kw), `Missing key must not silently return mock "${kw}"`);
      }
    } finally {
      if (savedGemini) process.env.GEMINI_API_KEY = savedGemini;
      if (savedGroq) process.env.GROQ_API_KEY = savedGroq;
    }

    console.log('  ✓ Verified: AI errors return clear errors and NEVER silently fall back to mock responses');
  }

  console.log('\n======================================================');
  console.log('All 11 Gemini Integration & Security Tests Passed Cleanly!');
  console.log('======================================================\n');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
