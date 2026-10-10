import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {
  deriveKeyFromPassphrase,
  encryptString,
  decryptString,
  isEncryptedString,
  generateRandomSalt,
  VaultLockedError,
  InvalidPassphraseError,
  CiphertextIntegrityError,
  bytesToBase64,
  base64ToBytes,
  ENCRYPTED_PREFIX,
} from '../src/services/crypto/webCryptoEngine.ts';
import {
  VaultManager,
  VAULT_SETTING_SALT,
  VAULT_SETTING_CANARY,
} from '../src/services/crypto/vaultManager.ts';
import { PrivyDatabase } from '../src/services/storage/privyDatabase.ts';
import { DexieWorkspaceRepository } from '../src/services/storage/dexieWorkspaceRepository.ts';

console.log('--- Running Veyra AI Cryptographic Persistence Security Tests ---');

async function runSecurityTests() {
  const MASTER_PASSWORD = 'PrivySecureResearchPassword2026!';
  const WRONG_PASSWORD = 'CompletelyWrongPassword999!';

  // Test 1: Web Crypto Key Derivation & Fresh IV Verification
  console.log('\n[Security Test 1] Key Derivation & Fresh IV per Operation');
  const salt = generateRandomSalt(16);
  assert.equal(salt.byteLength, 16, 'Salt must be 16 bytes');

  const key1 = await deriveKeyFromPassphrase(MASTER_PASSWORD, salt, 100000);
  assert.ok(key1, 'Key derived successfully');
  assert.equal(key1.algorithm.name, 'AES-GCM');
  assert.equal(key1.extractable, false, 'Derived key must be NON-extractable');

  const payload = 'Confidential Research: Differential Privacy and Homomorphic Encryption';
  const enc1 = await encryptString(payload, key1);
  const enc2 = await encryptString(payload, key1);

  assert.ok(isEncryptedString(enc1), 'Output must have PRIVY_ENC: prefix');
  assert.ok(isEncryptedString(enc2), 'Output must have PRIVY_ENC: prefix');
  assert.notEqual(enc1, enc2, 'Two encryptions of the same plaintext MUST produce different ciphertexts (Fresh IV requirement)');

  const envelope1 = JSON.parse(enc1.slice(ENCRYPTED_PREFIX.length));
  const envelope2 = JSON.parse(enc2.slice(ENCRYPTED_PREFIX.length));
  assert.notEqual(envelope1.iv, envelope2.iv, 'IVs must be distinct and non-repeating');
  assert.equal(base64ToBytes(envelope1.iv).byteLength, 12, 'IV must be 12 bytes (96 bits)');
  console.log('✓ Fresh 96-bit random IV verified for each operation');

  // Test 2: Vault Initialization & Safe Authentication Challenge
  console.log('\n[Security Test 2] Vault Initialization & Canary Verification');
  const testDbName = 'PrivyCryptoTestDB_' + Date.now();
  class TestDatabase extends PrivyDatabase {
    constructor() {
      super();
      this._name = testDbName;
    }
  }

  const db = new TestDatabase();
  const vault = new VaultManager(db);
  const repo = new DexieWorkspaceRepository(db, vault);
  repo.setMode('encrypted');
  await repo.init();

  assert.equal(await vault.isConfigured(), false, 'Vault starts unconfigured');
  assert.equal(vault.isUnlocked(), false, 'Vault starts locked');

  await vault.setupVault(MASTER_PASSWORD);
  assert.equal(await vault.isConfigured(), true, 'Vault now configured');
  assert.equal(vault.isUnlocked(), true, 'Vault is unlocked in memory after setup');

  // Verify that neither the plaintext password nor raw key is stored in DB settings
  const saltRecord = await db.settings.get(VAULT_SETTING_SALT);
  const canaryRecord = await db.settings.get(VAULT_SETTING_CANARY);
  assert.ok(saltRecord?.value, 'Salt is stored');
  assert.ok(canaryRecord?.value, 'Canary ciphertext is stored');
  assert.ok(!canaryRecord.value.includes(MASTER_PASSWORD), 'Plaintext password MUST NOT be stored');
  console.log('✓ Vault initialized safely with canary authentication vector');

  // Test 3: Wrong Password Challenge Failure
  console.log('\n[Security Test 3] Wrong Password Authentication Rejection');
  // Create another vault instance to test unlock challenge
  const vaultChallenge = new VaultManager(db);
  await assert.rejects(
    async () => {
      await vaultChallenge.unlockVault(WRONG_PASSWORD);
    },
    (err) => {
      assert.ok(err instanceof InvalidPassphraseError || err.name === 'InvalidPassphraseError');
      return true;
    },
    'Must safely reject incorrect password'
  );
  assert.equal(vaultChallenge.isUnlocked(), false, 'Wrong password must keep vault locked');
  console.log('✓ Incorrect password safely rejected without crashing or key leakage');

  // Test 4: Ciphertext Tampering & Integrity Verification
  console.log('\n[Security Test 4] Ciphertext Tampering Detection (AES-GCM Auth Tag)');
  const sampleSecret = 'Veyra AI Private Research Note Content';
  const originalEnc = await encryptString(sampleSecret, vault.getKey());
  const parsedEnv = JSON.parse(originalEnc.slice(ENCRYPTED_PREFIX.length));

  // Tamper with one byte in the base64 ciphertext
  const rawCiphertextBytes = base64ToBytes(parsedEnv.ciphertext);
  rawCiphertextBytes[0] = rawCiphertextBytes[0] ^ 0xff; // flip bits
  const tamperedCiphertextBase64 = bytesToBase64(rawCiphertextBytes);
  const tamperedEnvelopeString = `${ENCRYPTED_PREFIX}${JSON.stringify({
    ...parsedEnv,
    ciphertext: tamperedCiphertextBase64,
  })}`;

  await assert.rejects(
    async () => {
      await decryptString(tamperedEnvelopeString, vault.getKey());
    },
    (err) => {
      assert.ok(err instanceof CiphertextIntegrityError || err.name === 'CiphertextIntegrityError');
      return true;
    },
    'Tampered ciphertext must fail authentication verification'
  );
  console.log('✓ AES-GCM 128-bit authentication tag detected and rejected tampered ciphertext');

  // Test 5: IV Tampering Detection
  console.log('\n[Security Test 5] IV Tampering Detection');
  const rawIvBytes = base64ToBytes(parsedEnv.iv);
  rawIvBytes[0] = rawIvBytes[0] ^ 0x01; // flip 1 bit
  const tamperedIvBase64 = bytesToBase64(rawIvBytes);
  const tamperedIvEnvelopeString = `${ENCRYPTED_PREFIX}${JSON.stringify({
    ...parsedEnv,
    iv: tamperedIvBase64,
  })}`;

  await assert.rejects(
    async () => {
      await decryptString(tamperedIvEnvelopeString, vault.getKey());
    },
    (err) => {
      assert.ok(err instanceof CiphertextIntegrityError || err.name === 'CiphertextIntegrityError');
      return true;
    },
    'Tampered IV must fail decryption'
  );
  console.log('✓ IV bit modification rejected by AES-GCM verification');

  // Test 6: Encrypted Persistence CRUD in IndexedDB
  console.log('\n[Security Test 6] Encrypted Persistence in IndexedDB');
  // 6a. Create project
  const project = await repo.createProject({
    name: 'Homomorphic Vault Study',
    description: 'Fully homomorphic encryption research drafts',
    colorTag: '#6366f1',
  });
  assert.equal(project.name, 'Homomorphic Vault Study', 'In-memory should see decrypted plaintext');

  // Verify that IndexedDB row contains CIPHERTEXT only
  const rawDbProject = await db.projects.get(project.id);
  assert.ok(rawDbProject);
  assert.ok(isEncryptedString(rawDbProject.name), 'Database must store ciphertext for project name');
  assert.ok(!rawDbProject.name.includes('Homomorphic'), 'Plaintext name must not exist on disk');

  // 6b. Create conversation
  const conv = await repo.createConversation({
    projectId: project.id,
    title: 'CKKS Scheme Polynomial Arithmetic',
  });
  const rawDbConv = await db.conversations.get(conv.id);
  assert.ok(isEncryptedString(rawDbConv.title), 'Database must store ciphertext for conversation title');
  assert.ok(!rawDbConv.title.includes('CKKS'), 'Plaintext title must not exist on disk');

  // 6c. Add message
  const msg = await repo.addMessage({
    conversationId: conv.id,
    projectId: conv.projectId,
    role: 'user',
    content: 'Explain polynomial evaluation in the CKKS homomorphic encryption scheme.',
  });
  const rawDbMsg = await db.messages.get(msg.id);
  assert.ok(isEncryptedString(rawDbMsg.content), 'Database must store ciphertext for message content');
  assert.ok(!rawDbMsg.content.includes('polynomial'), 'Plaintext message must not exist on disk');

  // 6d. Save note
  const note = await repo.saveNote({
    projectId: project.id,
    title: 'Secret Parameter Config',
    content: 'Modulus q = 2^60, polynomial degree N = 8192.',
  });
  const rawDbNote = await db.notes.get(note.id);
  assert.ok(isEncryptedString(rawDbNote.title), 'Note title must be ciphertext in DB');
  assert.ok(isEncryptedString(rawDbNote.content), 'Note content must be ciphertext in DB');
  assert.ok(!rawDbNote.content.includes('Modulus'), 'Plaintext note content must not exist on disk');

  // 6e. Add File
  const file = await repo.addFile({
    projectId: project.id,
    name: 'ckks_params.json',
    size: 4096,
    type: 'application/json',
    dataUrl: 'data:application/json;base64,eyJrZXkiOiAidmFsdWUifQ==',
  });
  const rawDbFile = await db.files.get(file.id);
  assert.ok(isEncryptedString(rawDbFile.name), 'File name must be ciphertext in DB');
  assert.ok(isEncryptedString(rawDbFile.dataUrl), 'File content dataUrl must be ciphertext in DB');
  console.log('✓ Project names, conversation titles, messages, notes, and file payloads are stored as ciphertext in IndexedDB');

  // Test 7: Lock Workspace Behavior
  console.log('\n[Security Test 7] Lock Workspace & Memory Key Purge');
  vault.lockVault();
  assert.equal(vault.isUnlocked(), false, 'Vault must be locked');

  // Any attempt to read while locked must throw VaultLockedError
  await assert.rejects(
    async () => {
      await repo.getProjects();
    },
    (err) => {
      assert.ok(err instanceof VaultLockedError || err.name === 'VaultLockedError');
      return true;
    },
    'getProjects must reject when locked'
  );

  await assert.rejects(
    async () => {
      await repo.getMessages(conv.id);
    },
    (err) => {
      assert.ok(err instanceof VaultLockedError || err.name === 'VaultLockedError');
      return true;
    },
    'getMessages must reject when locked'
  );
  console.log('✓ In-memory key purged upon lock; repository calls safely reject while locked');

  // Test 8: Browser Reload Simulation & Unlock Flow
  console.log('\n[Security Test 8] Page Reload Simulation & Unlock Restoration');
  // Simulate complete page reload: create a new VaultManager and new Repo on the same DB
  // Neither has any in-memory key!
  const reloadedVault = new VaultManager(db);
  const reloadedRepo = new DexieWorkspaceRepository(db, reloadedVault);
  reloadedRepo.setMode('encrypted');
  await reloadedRepo.init();

  assert.equal(await reloadedVault.isConfigured(), true, 'Vault configuration detected on disk');
  assert.equal(reloadedVault.isUnlocked(), false, 'Vault is locked after page reload');

  // Attempt unlock with correct password
  const unlockSuccess = await reloadedVault.unlockVault(MASTER_PASSWORD);
  assert.equal(unlockSuccess, true, 'Unlock succeeds with correct password');
  assert.equal(reloadedVault.isUnlocked(), true, 'In-memory key restored');

  // Read decrypted data
  const restoredProjects = await reloadedRepo.getProjects();
  const restoredConvList = await reloadedRepo.getConversations(project.id);
  const restoredMessages = await reloadedRepo.getMessages(conv.id);
  const restoredNotes = await reloadedRepo.getNotes(project.id);
  const restoredFiles = await reloadedRepo.getFiles(project.id);

  assert.ok(restoredProjects.some(p => p.name === 'Homomorphic Vault Study'), 'Project decrypted');
  assert.ok(restoredConvList.some(c => c.title === 'CKKS Scheme Polynomial Arithmetic'), 'Conversation decrypted');
  assert.equal(restoredMessages[0].content, 'Explain polynomial evaluation in the CKKS homomorphic encryption scheme.');
  assert.ok(restoredNotes.some(n => n.title === 'Secret Parameter Config'));
  assert.ok(restoredFiles.some(f => f.name === 'ckks_params.json'));
  assert.equal(restoredFiles[0].dataUrl, 'data:application/json;base64,eyJrZXkiOiAidmFsdWUifQ==');

  console.log('✓ After reload and unlock, all records are restored and decrypted in memory');

  // Test 9: Search in Encrypted Mode
  console.log('\n[Security Test 9] Client-Side Search in Encrypted Mode');
  const searchResults = await reloadedRepo.search('polynomial');
  assert.ok(searchResults.length >= 1, 'Search finds decrypted records');
  assert.ok(searchResults.some(r => r.title.includes('CKKS') || r.type === 'conversation'));
  console.log('✓ Encrypted mode full-text search functions cleanly in memory');

  console.log('\n======================================================');
  console.log('All 9 Cryptographic Security Tests Passed Successfully!');
  console.log('======================================================\n');
}

runSecurityTests().catch((err) => {
  console.error('Security test failed:', err);
  process.exit(1);
});
