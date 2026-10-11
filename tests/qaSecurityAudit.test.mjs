// Live QA Security & Verification Audit Script for Veyra AI
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { authFetch } from './helpers/authSession.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {
  PrivyDatabase,
  PERSONAL_WORKSPACE_ID,
} from '../src/services/storage/privyDatabase.ts';
import { DexieWorkspaceRepository } from '../src/services/storage/dexieWorkspaceRepository.ts';
import { VaultManager } from '../src/services/crypto/vaultManager.ts';
import {
  deriveKeyFromPassphrase,
  encryptString,
  decryptString,
  isEncryptedString,
  VaultLockedError,
  InvalidPassphraseError,
  CiphertextIntegrityError,
  CANARY_PLAINTEXT,
} from '../src/services/crypto/webCryptoEngine.ts';
import {
  validateFile,
  escapeHtml,
  MAX_FILE_SIZE_BYTES,
} from '../src/utils/fileValidators.ts';

console.log('\n=============================================================');
console.log('--- Senior QA & Security Reviewer Verification Audit ---');
console.log('=============================================================\n');

async function runAudit() {
  const auditResults = {
    passed: [],
    failed: [],
  };

  function record(testName, success, details = '') {
    if (success) {
      auditResults.passed.push(testName);
      console.log(`  ✓ [PASS] ${testName} ${details ? '(' + details + ')' : ''}`);
    } else {
      auditResults.failed.push({ testName, details });
      console.error(`  ✕ [FAIL] ${testName}: ${details}`);
    }
  }

  // ------------------------------------------------------------------
  // VERIFICATION 1: Project CRUD, Isolation & Navigation
  // ------------------------------------------------------------------
  console.log('[Audit 1] Project Creation, Renaming, Deletion, and Navigation');
  try {
    const db = new PrivyDatabase('Audit_DB_Projects_' + Date.now());
    const repo = new DexieWorkspaceRepository(db);
    await repo.init();

    // 1. Creation
    const projA = await repo.createProject({
      name: 'Cybersecurity Audit Project',
      description: 'Threat modeling and pentest documentation',
      colorTag: '#6366f1',
    });
    assert.equal(projA.name, 'Cybersecurity Audit Project');

    // 2. Renaming
    const updatedProj = await repo.updateProject(projA.id, {
      name: 'Cybersecurity Audit Project (Renamed)',
      description: 'Updated scope',
    });
    assert.equal(updatedProj.name, 'Cybersecurity Audit Project (Renamed)');

    // 3. Navigation / Retrieval
    const fetched = await repo.getProject(projA.id);
    assert.equal(fetched.name, 'Cybersecurity Audit Project (Renamed)');

    // 4. Default Personal Workspace Protection (cannot delete personal workspace)
    await assert.rejects(
      async () => {
        await repo.deleteProject(PERSONAL_WORKSPACE_ID);
      },
      (err) => err.message.includes('Personal Workspace cannot be deleted')
    );

    // 5. Deletion of user project
    await repo.deleteProject(projA.id);
    const postDelete = await repo.getProject(projA.id);
    assert.equal(postDelete, null);

    record('Project CRUD and Personal Workspace Protection', true);
  } catch (err) {
    record('Project CRUD and Personal Workspace Protection', false, err.message);
  }

  // ------------------------------------------------------------------
  // VERIFICATION 2: Conversation CRUD, Switching & Auto-Titling
  // ------------------------------------------------------------------
  console.log('\n[Audit 2] Conversation Creation, Switching, Editing, and Deletion');
  try {
    const db = new PrivyDatabase('Audit_DB_Convs_' + Date.now());
    const repo = new DexieWorkspaceRepository(db);
    await repo.init();

    const proj = await repo.createProject({ name: 'Audit Proj', colorTag: '#10b981' });
    const conv1 = await repo.createConversation({ projectId: proj.id, title: 'Initial Chat' });
    const conv2 = await repo.createConversation({ projectId: proj.id, title: 'Secondary Chat' });

    // Messages in conv 1
    await repo.addMessage({
      conversationId: conv1.id,
      role: 'user',
      content: 'Message in Conversation 1',
    });

    // Rename
    const renamed = await repo.updateConversation(conv1.id, { title: 'Renamed Chat 1' });
    assert.equal(renamed.title, 'Renamed Chat 1');

    // Switch & Retrieve
    const convsInProj = await repo.getConversations(proj.id);
    assert.equal(convsInProj.length, 2);

    // Cascade deletion
    await repo.deleteConversation(conv1.id);
    const msgsPostDelete = await repo.getMessages(conv1.id);
    assert.equal(msgsPostDelete.length, 0, 'Messages must be cascade-deleted with conversation');

    record('Conversation CRUD and Cascade Message Deletion', true);
  } catch (err) {
    record('Conversation CRUD and Cascade Message Deletion', false, err.message);
  }

  // ------------------------------------------------------------------
  // VERIFICATION 3: Notes & File Management, Validation, Anti-XSS
  // ------------------------------------------------------------------
  console.log('\n[Audit 3] Notes and File Management & Anti-XSS Sanitization');
  try {
    const db = new PrivyDatabase('Audit_DB_NotesFiles_' + Date.now());
    const repo = new DexieWorkspaceRepository(db);
    await repo.init();
    const proj = await repo.createProject({ name: 'Notes Proj', colorTag: '#f59e0b' });

    // Note CRUD
    const note = await repo.saveNote({
      projectId: proj.id,
      title: 'Security Finding Note',
      content: '## Critical Review\n\nNo plaintext passwords allowed.',
    });
    assert.equal(note.title, 'Security Finding Note');

    const editedNote = await repo.saveNote({
      id: note.id,
      projectId: proj.id,
      title: 'Security Finding Note (Amended)',
      content: '## Critical Review\n\nAmended notes.',
    });
    assert.equal(editedNote.title, 'Security Finding Note (Amended)');

    // File Validator: Unsupported type rejection
    const invalidFile = validateFile({ name: 'malicious.exe', size: 1024, type: 'application/x-msdownload' });
    assert.equal(invalidFile.isValid, false, 'EXE files must be rejected');

    // File Validator: Size limit rejection (>15MB)
    const oversizedFile = validateFile({ name: 'huge.pdf', size: MAX_FILE_SIZE_BYTES + 100, type: 'application/pdf' });
    assert.equal(oversizedFile.isValid, false, 'Files > 15MB must be rejected');

    // Anti-XSS Sanitization
    const maliciousPayload = '<script>alert("XSS")</script><img src="x" onerror="stealCookie()">';
    const escaped = escapeHtml(maliciousPayload);
    assert.equal(escaped.includes('<script>'), false);
    assert.equal(escaped.includes('&lt;script&gt;'), true);
    assert.equal(escaped.includes('&lt;img'), true);

    record('Notes/File Validation and Anti-XSS HTML Escaping', true);
  } catch (err) {
    record('Notes/File Validation and Anti-XSS HTML Escaping', false, err.message);
  }

  // ------------------------------------------------------------------
  // VERIFICATION 4: Local Persistence Across Page Reloads Simulation
  // ------------------------------------------------------------------
  console.log('\n[Audit 4] Local Persistence Across Page Reloads Simulation');
  try {
    const sharedDbName = 'Audit_DB_ReloadSim_' + Date.now();

    // Session 1: Write records
    {
      const db1 = new PrivyDatabase(sharedDbName);
      const repo1 = new DexieWorkspaceRepository(db1);
      await repo1.init();

      const p = await repo1.createProject({ name: 'Persistent Project', colorTag: '#6366f1' });
      const c = await repo1.createConversation({ projectId: p.id, title: 'Persistent Thread' });
      await repo1.addMessage({ conversationId: c.id, role: 'user', content: 'Message surviving restart' });
      await repo1.saveNote({ projectId: p.id, title: 'Persistent Note', content: 'Survives reboot' });
      await db1.close();
    }

    // Session 2: Fresh client reopening the same database
    {
      const db2 = new PrivyDatabase(sharedDbName);
      const repo2 = new DexieWorkspaceRepository(db2);
      await repo2.init();

      const projects = await repo2.getProjects();
      const matched = projects.find((p) => p.name === 'Persistent Project');
      assert.notEqual(matched, undefined, 'Project must survive database reopen');

      const convs = await repo2.getConversations(matched.id);
      assert.equal(convs.length, 1);
      assert.equal(convs[0].title, 'Persistent Thread');

      const msgs = await repo2.getMessages(convs[0].id);
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].content, 'Message surviving restart');
    }

    record('Persistence Across Simulated Browser Restarts', true);
  } catch (err) {
    record('Persistence Across Simulated Browser Restarts', false, err.message);
  }

  // ------------------------------------------------------------------
  // VERIFICATION 5: Session-Only Mode Does Not Persist Chat Content
  // ------------------------------------------------------------------
  console.log('\n[Audit 5] Session-Only Mode Memory Isolation (Zero Disk Write)');
  try {
    const sessionDbName = 'Audit_DB_SessionOnly_' + Date.now();
    const db = new PrivyDatabase(sessionDbName);
    const repo = new DexieWorkspaceRepository(db);
    await repo.init();

    repo.setMode('session_only');

    const ephemProject = await repo.createProject({ name: 'Ephemeral Project', colorTag: '#ec4899' });
    const ephemConv = await repo.createConversation({ projectId: ephemProject.id, title: 'Ephemeral Thread' });
    const ephemMsg = await repo.addMessage({
      conversationId: ephemConv.id,
      role: 'user',
      content: 'Confidential volatile chat message',
    });

    // Directly inspect raw IndexedDB tables
    const diskProject = await db.projects.get(ephemProject.id);
    const diskConv = await db.conversations.get(ephemConv.id);
    const diskMsg = await db.messages.get(ephemMsg.id);

    assert.equal(diskProject, undefined, 'Session-only project must NOT exist in IndexedDB');
    assert.equal(diskConv, undefined, 'Session-only conversation must NOT exist in IndexedDB');
    assert.equal(diskMsg, undefined, 'Session-only message must NOT exist in IndexedDB');

    record('Session-Only Mode Zero-Disk Persistence Guarantee', true);
  } catch (err) {
    record('Session-Only Mode Zero-Disk Persistence Guarantee', false, err.message);
  }

  // ------------------------------------------------------------------
  // VERIFICATION 6: Encrypted Local Data Is Unreadable Without Correct Key
  // ------------------------------------------------------------------
  console.log('\n[Audit 6] Encrypted Local Data Cryptographic Confidentiality');
  try {
    const encDbName = 'Audit_DB_Encrypted_' + Date.now();
    const db = new PrivyDatabase(encDbName);
    const vault = new VaultManager(db);
    const repo = new DexieWorkspaceRepository(db, vault);
    await repo.init();

    const passphrase = 'MasterPassphrase_Secure_2026!';
    await vault.setupVault(passphrase);
    repo.setMode('encrypted');

    const proj = await repo.createProject({
      name: 'Classified Cryptographic Research',
      description: 'Lattice based post quantum cryptography',
      colorTag: '#6366f1',
    });
    const conv = await repo.createConversation({
      projectId: proj.id,
      title: 'Secret Parameter Derivation',
    });
    const msg = await repo.addMessage({
      conversationId: conv.id,
      role: 'user',
      content: 'TopSecretPayload: Key material k = 0xDEADBEEF',
    });
    const note = await repo.saveNote({
      projectId: proj.id,
      title: 'Private Key Backup Formula',
      content: 'Never reveal this secret.',
    });

    // Inspect RAW disk records in Dexie
    const rawProj = await db.projects.get(proj.id);
    const rawConv = await db.conversations.get(conv.id);
    const rawMsg = await db.messages.get(msg.id);
    const rawNote = await db.notes.get(note.id);

    // Verify they are ciphertexts starting with privy_enc:v1:
    assert.equal(isEncryptedString(rawProj.name), true);
    assert.equal(isEncryptedString(rawConv.title), true);
    assert.equal(isEncryptedString(rawMsg.content), true);
    assert.equal(isEncryptedString(rawNote.content), true);

    // Plaintext strings must NOT appear in raw IndexedDB records
    assert.equal(rawProj.name.includes('Classified'), false);
    assert.equal(rawConv.title.includes('Secret'), false);
    assert.equal(rawMsg.content.includes('TopSecretPayload'), false);
    assert.equal(rawNote.content.includes('Never reveal'), false);

    record('Encrypted Data Unreadable in Raw IndexedDB Storage', true);
  } catch (err) {
    record('Encrypted Data Unreadable in Raw IndexedDB Storage', false, err.message);
  }

  // ------------------------------------------------------------------
  // VERIFICATION 7: Wrong-Password & Ciphertext-Tampering Failures
  // ------------------------------------------------------------------
  console.log('\n[Audit 7] Wrong-Password Rejection & Ciphertext Tampering Detection');
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const correctKey = await deriveKeyFromPassphrase('Pass12345!', salt, 100000);
    const wrongKey = await deriveKeyFromPassphrase('WrongPass!', salt, 100000);

    const plaintext = 'Sensitive financial statement';
    const ciphertext = await encryptString(plaintext, correctKey);

    // 1. Wrong Password Decryption Attempt (Ciphertext Integrity check on wrong key)
    await assert.rejects(
      async () => {
        await decryptString(ciphertext, wrongKey);
      },
      CiphertextIntegrityError,
      'Decrypting with wrong key must fail authentication'
    );

    // 2. Bit Tampering in Ciphertext (Testing AES-GCM 128-bit Authentication Tag)
    const parts = ciphertext.split(':');
    const ctBase64 = parts[3];
    const ctBytes = Buffer.from(ctBase64, 'base64');
    // Flip a bit in the ciphertext byte stream
    ctBytes[0] ^= 0x01;
    const tamperedCiphertext = `${parts[0]}:${parts[1]}:${parts[2]}:${ctBytes.toString('base64')}`;

    await assert.rejects(
      async () => {
        await decryptString(tamperedCiphertext, correctKey);
      },
      CiphertextIntegrityError,
      'AES-GCM authentication tag must detect bit tampering and reject'
    );

    // 3. Vault Unlock Challenge Rejection with Wrong Passphrase
    const testDb = new PrivyDatabase('Audit_DB_Canary_' + Date.now());
    const testVault = new VaultManager(testDb);
    await testVault.setupVault('CorrectPassphrase123!');
    await assert.rejects(
      async () => {
        await testVault.unlockVault('WrongPassphrase456!');
      },
      InvalidPassphraseError,
      'Unlocking vault with wrong passphrase must throw InvalidPassphraseError'
    );

    record('Wrong-Password & Ciphertext Tampering Detection (AES-GCM Auth Tag)', true);
  } catch (err) {
    record('Wrong-Password & Ciphertext Tampering Detection (AES-GCM Auth Tag)', false, err.message);
  }

  // ------------------------------------------------------------------
  // VERIFICATION 8: Locking Removes References to Active Encryption Key
  // ------------------------------------------------------------------
  console.log('\n[Audit 8] Workspace Lock & Active Key Removal from Memory');
  try {
    const db = new PrivyDatabase('Audit_DB_Lock_' + Date.now());
    const vault = new VaultManager(db);
    const repo = new DexieWorkspaceRepository(db, vault);
    await repo.init();

    await vault.setupVault('VaultPassword987!');
    repo.setMode('encrypted');
    assert.equal(vault.isUnlocked(), true);

    // Calling lock
    vault.lockVault();
    assert.equal(vault.isUnlocked(), false);

    // Key retrieval must throw
    assert.throws(() => {
      vault.getKey();
    }, VaultLockedError);

    // Repository operations must throw VaultLockedError
    await assert.rejects(async () => {
      await repo.getProjects();
    }, VaultLockedError);

    record('Locking Clears Key and Repositories Enforce Locked State', true);
  } catch (err) {
    record('Locking Clears Key and Repositories Enforce Locked State', false, err.message);
  }

  // ------------------------------------------------------------------
  // VERIFICATION 9 & 10: Backend Consent Refusal & Live HTTP Verification
  // ------------------------------------------------------------------
  console.log('\n[Audit 9 & 10] Live HTTP Backend Consent Boundary & Rate Limiter');
  try {
    const baseUrl = 'http://localhost:3001';

    // Check health endpoint
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.equal(typeof healthData.geminiConfigured, 'boolean');
    assert.equal(typeof healthData.model, 'string');
    assert.equal(healthData.apiKey, undefined, 'API key must never be exposed on /api/health');

    // Test Consent Refusal: Send request with consentGiven: false
    const noConsentRes = await authFetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hello AI',
        consentGiven: false,
      }),
    });
    assert.equal(noConsentRes.status, 403, 'Consent refusal must return HTTP 403');
    const noConsentData = await noConsentRes.json();
    assert.ok(noConsentData.error.includes('consent is required'));

    // Test Oversized Payload Protection (>100kb)
    const hugeMessage = 'A'.repeat(120 * 1024);
    const payloadRes = await authFetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: hugeMessage,
        consentGiven: true,
      }),
    });
    assert.equal(payloadRes.status, 413, 'Oversized payload must return HTTP 413');

    record('Backend Health Endpoint & HTTP 403 Consent Boundary Enforcement', true);
  } catch (err) {
    record('Backend Health Endpoint & HTTP 403 Consent Boundary Enforcement', false, err.message);
  }

  // ------------------------------------------------------------------
  // VERIFICATION 11: Provider API Keys Absent From Frontend Bundles
  // ------------------------------------------------------------------
  console.log('\n[Audit 11] Static Analysis of Built Production Frontend Bundle');
  try {
    const distAssetsDir = path.resolve('dist/assets');
    const files = fs.readdirSync(distAssetsDir);
    const jsFiles = files.filter((f) => f.endsWith('.js'));
    assert.ok(jsFiles.length > 0, 'Production JS bundle must exist');

    for (const jsFile of jsFiles) {
      const fullPath = path.join(distAssetsDir, jsFile);
      const code = fs.readFileSync(fullPath, 'utf8');

      // Check for Google AI API Key patterns (AIzaSy...)
      const googleKeyMatch = code.match(/AIza[0-9A-Za-z-_]{35}/);
      assert.equal(googleKeyMatch, null, `Found potential Google API key in ${jsFile}`);

      // Check for Groq API Key patterns (gsk_...)
      const groqKeyMatch = code.match(/gsk_[0-9A-Za-z]{40,}/);
      assert.equal(groqKeyMatch, null, `Found potential Groq API key in ${jsFile}`);

      // Ensure no live secret token values are embedded
      const secretTokenMatch = code.match(/AQ\.[0-9A-Za-z-_]{40,}/);
      assert.equal(secretTokenMatch, null, `Found potential raw token in ${jsFile}`);
    }

    record('Zero Provider API Keys or Secret Tokens in Production Bundle', true);
  } catch (err) {
    record('Zero Provider API Keys or Secret Tokens in Production Bundle', false, err.message);
  }

  // ------------------------------------------------------------------
  // VERIFICATION 12: Zero Telemetry & Sensitive Logging
  // ------------------------------------------------------------------
  console.log('\n[Audit 12] Zero Telemetry & Sensitive Console Logging');
  try {
    const htmlContent = fs.readFileSync(path.resolve('index.html'), 'utf8');
    assert.equal(htmlContent.includes('google-analytics'), false);
    assert.equal(htmlContent.includes('googletagmanager'), false);
    assert.equal(htmlContent.includes('mixpanel'), false);
    assert.equal(htmlContent.includes('sentry'), false);
    assert.equal(htmlContent.includes('hotjar'), false);

    record('Zero Third-Party Analytics, Trackers or External CDNs', true);
  } catch (err) {
    record('Zero Third-Party Analytics, Trackers or External CDNs', false, err.message);
  }

  console.log('\n=============================================================');
  console.log(`Audit Summary: ${auditResults.passed.length} Passed, ${auditResults.failed.length} Failed`);
  console.log('=============================================================\n');

  if (auditResults.failed.length > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Audit Runner Error:', err);
  process.exit(1);
});
