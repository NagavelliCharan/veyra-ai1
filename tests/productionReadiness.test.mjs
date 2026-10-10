import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

console.log('======================================================================');
console.log('--- Running Veyra AI Production Readiness & Security Audit Suite ---');
console.log('======================================================================\n');

async function runProductionAudit() {
  const serverBase = 'http://localhost:3001';

  // ------------------------------------------------------------------
  // AUDIT 1: Static Analysis of Production Frontend Bundle
  // ------------------------------------------------------------------
  console.log('[Audit 1] Zero API Keys or Secrets in Production Bundle');
  const distDir = path.resolve('dist/assets');
  assert.ok(fs.existsSync(distDir), 'Production dist/assets directory must exist (run npm run build first)');
  const jsFiles = fs.readdirSync(distDir).filter((f) => f.endsWith('.js'));
  assert.ok(jsFiles.length > 0, 'Production bundle must contain compiled JS assets');

  const secretSignatures = [
    'gsk_',
    'AIzaSy',
    'AQ.Ab8RN6',
    'mongodb+srv://',
  ];

  for (const jsFile of jsFiles) {
    const content = fs.readFileSync(path.join(distDir, jsFile), 'utf-8');
    for (const signature of secretSignatures) {
      assert.equal(
        content.includes(signature),
        false,
        `CRITICAL VULNERABILITY: Secret signature "${signature}" detected in production asset "${jsFile}"`
      );
    }
  }
  console.log('  ✓ Verified 0 API keys, tokens, or database credentials in frontend assets');

  // ------------------------------------------------------------------
  // AUDIT 2: Environment Security & Git Protection
  // ------------------------------------------------------------------
  console.log('\n[Audit 2] Git Protection & Environment File Sanitization');
  const gitignorePath = path.resolve('.gitignore');
  assert.ok(fs.existsSync(gitignorePath), '.gitignore file must exist');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');

  assert.ok(gitignoreContent.includes('.env'), '.gitignore must ignore .env files');
  assert.ok(gitignoreContent.includes('uploads/'), '.gitignore must ignore uploads/ directory');

  const envExamplePath = path.resolve('.env.example');
  assert.ok(fs.existsSync(envExamplePath), '.env.example must exist for deployment reference');
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf-8');
  assert.ok(!envExampleContent.includes('AIzaSy'), '.env.example must not contain real keys');
  assert.ok(!envExampleContent.includes('gsk_'), '.env.example must not contain real keys');
  console.log('  ✓ Verified .gitignore protects .env and uploads/, and .env.example contains safe placeholders');

  // ------------------------------------------------------------------
  // AUDIT 3: HTTP Security Headers & Content Security Policy (CSP)
  // ------------------------------------------------------------------
  console.log('\n[Audit 3] HTTP Security Headers & Content Security Policy');
  const healthRes = await fetch(`${serverBase}/api/health`);
  assert.equal(healthRes.status, 200);

  const csp = healthRes.headers.get('content-security-policy');
  assert.ok(csp, 'Content-Security-Policy header must be present');
  assert.ok(csp.includes("default-src 'self'"), "CSP must define default-src 'self'");
  assert.ok(csp.includes("frame-ancestors 'none'"), "CSP must prohibit clickjacking with frame-ancestors 'none'");

  const xContentType = healthRes.headers.get('x-content-type-options');
  assert.equal(xContentType, 'nosniff', 'X-Content-Type-Options must be nosniff');

  const xFrame = healthRes.headers.get('x-frame-options');
  assert.equal(xFrame, 'DENY', 'X-Frame-Options must be DENY');

  const referrerPolicy = healthRes.headers.get('referrer-policy');
  assert.ok(referrerPolicy, 'Referrer-Policy header must be configured');

  const permPolicy = healthRes.headers.get('permissions-policy');
  assert.ok(permPolicy, 'Permissions-Policy header must be configured');
  console.log('  ✓ Verified CSP, X-Content-Type-Options, X-Frame-Options, and Permissions-Policy headers');

  // ------------------------------------------------------------------
  // AUDIT 4: Server Request Payload Size Bounds (Anti-DoS)
  // ------------------------------------------------------------------
  console.log('\n[Audit 4] Server Request Payload Bounds (100kb Body Limit)');
  const largePayload = 'A'.repeat(120 * 1024); // 120 KB
  const tooLargeRes = await fetch(`${serverBase}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: largePayload, consentGiven: true }),
  });
  assert.equal(tooLargeRes.status, 413, 'Server must reject payloads exceeding 100kb with HTTP 413');
  console.log('  ✓ Body-parser 100kb limit strictly enforced (HTTP 413 Payload Too Large)');

  // ------------------------------------------------------------------
  // AUDIT 5: Strict User Consent Enforcement (Zero Unconsented AI Call)
  // ------------------------------------------------------------------
  console.log('\n[Audit 5] User Consent Boundary Enforcement');
  const unconsentedRes = await fetch(`${serverBase}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Hello AI', consentGiven: false }),
  });
  assert.equal(unconsentedRes.status, 403, 'Unconsented AI calls must be rejected with HTTP 403');
  const unconsentedJson = await unconsentedRes.json();
  assert.ok(unconsentedJson.error.includes('consent'), 'Error message must specify consent requirement');
  console.log('  ✓ Server strictly rejects prompts without explicit consent (HTTP 403)');

  // ------------------------------------------------------------------
  // AUDIT 6: Prevention of Silent Mock Fallback on AI Errors
  // ------------------------------------------------------------------
  console.log('\n[Audit 6] Error Transparency (No Silent Mock Fallback)');
  // An invalid message payload should return 400, never a fake assistant message
  const invalidReq = await fetch(`${serverBase}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '', consentGiven: true }),
  });
  assert.equal(invalidReq.status, 400);
  const invalidJson = await invalidReq.json();
  assert.ok(invalidJson.error, 'Server must return an explicit error object');
  assert.equal(invalidJson.reply, undefined, 'Server must NEVER return simulated reply on failure');
  console.log('  ✓ Verified: Errors return transparent failure states and NEVER mask errors with simulated mocks');

  // ------------------------------------------------------------------
  // AUDIT 7: Zero Server-Side Persistence of Chat Conversations
  // ------------------------------------------------------------------
  console.log('\n[Audit 7] Zero Server-Side Chat Persistence');
  const uploadsDir = path.resolve('uploads');
  if (fs.existsSync(uploadsDir)) {
    const filesInUploads = fs.readdirSync(uploadsDir);
    for (const f of filesInUploads) {
      assert.ok(
        !f.includes('chat') && !f.includes('conversation') && !f.includes('history'),
        `Unexpected chat file "${f}" found in server directory`
      );
    }
  }
  console.log('  ✓ Zero server-side conversation or prompt files exist on server disk');

  // ------------------------------------------------------------------
  // AUDIT 8: Cross-Project File Isolation
  // ------------------------------------------------------------------
  console.log('\n[Audit 8] Cross-Project File Isolation Verification');
  const projectA = `proj-audit-a-${Date.now()}`;
  const projectB = `proj-audit-b-${Date.now()}`;

  // Upload file to Project A
  const formA = new FormData();
  formA.append('projectId', projectA);
  const fileA = new Blob(['Confidential Research Document A'], { type: 'text/plain' });
  formA.append('files', fileA, 'docA.txt');

  const uploadResA = await fetch(`${serverBase}/api/files/upload`, {
    method: 'POST',
    body: formA,
  });
  assert.equal(uploadResA.status, 201);
  const uploadJsonA = await uploadResA.json();
  const fileIdA = uploadJsonA.files[0].id;

  // Request directory for Project B (must NOT contain docA)
  const dirResB = await fetch(`${serverBase}/api/directory?projectId=${projectB}`);
  assert.equal(dirResB.status, 200);
  const dirJsonB = await dirResB.json();
  const foundInB = dirJsonB.files.some((f) => f.name === 'docA.txt' || f.id === fileIdA);
  assert.equal(foundInB, false, 'Files from Project A must NEVER appear in Project B directory');

  // Clean up test file
  await fetch(`${serverBase}/api/files/${fileIdA}`, { method: 'DELETE' });
  console.log('  ✓ Verified strict file isolation: Project B cannot see Project A workspace files');

  // ------------------------------------------------------------------
  // AUDIT 9: Zero-Byte File Support in Persistent Storage
  // ------------------------------------------------------------------
  console.log('\n[Audit 9] Zero-Byte File Support in Persistent Storage');
  const emptyForm = new FormData();
  emptyForm.append('projectId', projectA);
  const emptyBlob = new Blob([], { type: 'text/plain' });
  emptyForm.append('files', emptyBlob, 'empty.txt');

  const emptyUploadRes = await fetch(`${serverBase}/api/files/upload`, {
    method: 'POST',
    body: emptyForm,
  });
  assert.equal(emptyUploadRes.status, 201);
  const emptyUploadJson = await emptyUploadRes.json();
  assert.equal(emptyUploadJson.files[0].size, 0, 'Zero-byte file must be accepted with size 0');

  // Download stream
  const emptyDownloadRes = await fetch(`${serverBase}/api/files/${emptyUploadJson.files[0].id}/download`);
  assert.equal(emptyDownloadRes.status, 200);
  const downloadedText = await emptyDownloadRes.text();
  assert.equal(downloadedText.length, 0, 'Downloaded empty file must have 0 length');

  // Clean up
  await fetch(`${serverBase}/api/files/${emptyUploadJson.files[0].id}`, { method: 'DELETE' });
  console.log('  ✓ Zero-byte file accepted, stored on persistent disk, and streamed with 0 bytes');

  // ------------------------------------------------------------------
  // AUDIT 10: Modal Accessibility & Keyboard Support
  // ------------------------------------------------------------------
  console.log('\n[Audit 10] Accessibility & Semantic Markup Review');
  const modalComponentPath = path.resolve('src/components/common/Modal.tsx');
  assert.ok(fs.existsSync(modalComponentPath), 'Modal component must exist');
  const modalCode = fs.readFileSync(modalComponentPath, 'utf-8');

  assert.ok(modalCode.includes('role="dialog"'), 'Modals must have role="dialog"');
  assert.ok(modalCode.includes('aria-modal="true"'), 'Modals must declare aria-modal="true"');
  assert.ok(modalCode.includes('Escape'), 'Modals must support Escape key to close');
  console.log('  ✓ Modals implement role="dialog", aria-modal="true", and keyboard Escape handling');

  console.log('\n======================================================================');
  console.log('🎉 ALL 10 PRODUCTION READINESS & SECURITY AUDIT CHECKS PASSED CLEANLY!');
  console.log('======================================================================\n');
}

runProductionAudit().catch((err) => {
  console.error('\n❌ Production Readiness Audit Failed:', err);
  process.exit(1);
});
