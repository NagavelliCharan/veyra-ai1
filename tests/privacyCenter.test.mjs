// Automated tests for Veyra AI Privacy Center & Sovereign Data Operations
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {
  PrivyDatabase,
  PERSONAL_WORKSPACE_ID,
} from '../src/services/storage/privyDatabase.ts';
import { DexieWorkspaceRepository } from '../src/services/storage/dexieWorkspaceRepository.ts';
import { VaultManager } from '../src/services/crypto/vaultManager.ts';
import {
  isEncryptedString,
  VaultLockedError,
} from '../src/services/crypto/webCryptoEngine.ts';

console.log('\n=============================================================');
console.log('--- Testing Veyra AI Privacy Center & Safe Migrations ---');
console.log('=============================================================\n');

async function runTests() {
  const dbName = 'PrivyPrivacyCenterDB_' + Date.now();
  const db = new PrivyDatabase(dbName);
  const vault = new VaultManager(db);
  const repo = new DexieWorkspaceRepository(db, vault);
  await repo.init();

  // ------------------------------------------------------------------
  // TEST 1: Initial Storage Mode & Live Status Reflection
  // ------------------------------------------------------------------
  console.log('[Test 1] Initial Storage Mode & Live Status Reflection');
  assert.equal(repo.getMode(), 'local_storage', 'Default storage mode should be local_storage');
  assert.equal(await vault.isConfigured(), false, 'Vault should not be configured initially');
  assert.equal(vault.isUnlocked(), false, 'Vault should not be unlocked initially');

  const quota = await repo.getStorageQuota();
  assert.equal(typeof quota.usageBytes, 'number', 'Quota usageBytes must be a number');
  assert.equal(typeof quota.quotaBytes, 'number', 'Quota quotaBytes must be a number');
  console.log('  ✓ Initial state and storage quota correctly reflected');

  // ------------------------------------------------------------------
  // TEST 2: Seed Plaintext Data in Local Storage
  // ------------------------------------------------------------------
  console.log('[Test 2] Seed Plaintext Data in Local Storage');
  const project = await repo.createProject({
    name: 'Confidential Quantum Project',
    description: 'Post-quantum key exchange research',
    colorTag: '#6366f1',
  });
  const conversation = await repo.createConversation({
    projectId: project.id,
    title: 'Kyber / ML-KEM Parameter Analysis',
  });
  const message = await repo.addMessage({
    conversationId: conversation.id,
    role: 'user',
    content: 'Explain the difference between Kyber-512, Kyber-768, and Kyber-1024.',
  });
  const note = await repo.saveNote({
    projectId: project.id,
    title: 'NIST Standards Notes',
    content: 'ML-KEM is standardized in FIPS 203.',
  });
  const file = await repo.addFile({
    projectId: project.id,
    name: 'quantum_spec.txt',
    sizeBytes: 256,
    mimeType: 'text/plain',
    textPreview: 'Confidential post-quantum research preview...',
    dataUrl: 'data:text/plain;base64,Q29uZmlkZW50aWFs',
  });

  // Verify records in IndexedDB are plaintext in local_storage mode
  const rawDbProject = await db.projects.get(project.id);
  const rawDbMsg = await db.messages.get(message.id);
  const rawDbNote = await db.notes.get(note.id);
  const rawDbFile = await db.files.get(file.id);

  assert.equal(isEncryptedString(rawDbProject.name), false, 'Project name should be plaintext in local mode');
  assert.equal(isEncryptedString(rawDbMsg.content), false, 'Message content should be plaintext in local mode');
  assert.equal(isEncryptedString(rawDbNote.content), false, 'Note content should be plaintext in local mode');
  assert.equal(isEncryptedString(rawDbFile.name), false, 'File name should be plaintext in local mode');
  console.log('  ✓ Plaintext records verified in standard local persistence');

  // ------------------------------------------------------------------
  // TEST 3: Safe Migration: Local Storage -> Encrypted Vault
  // ------------------------------------------------------------------
  console.log('[Test 3] Safe Migration: Local Storage -> Encrypted Vault');
  const masterPassphrase = 'CorrectHorseBatteryStaple2026!';
  await vault.setupVault(masterPassphrase);
  assert.equal(await vault.isConfigured(), true, 'Vault is now configured');
  assert.equal(vault.isUnlocked(), true, 'Vault is unlocked after setup');

  // Perform migration: encrypt all existing plaintext records
  const cryptoKey = vault.getKey();
  await repo.encryptAllPlaintextData(cryptoKey);
  repo.setMode('encrypted');

  // Verify raw records in database are now ciphertexts
  const encDbProject = await db.projects.get(project.id);
  const encDbConv = await db.conversations.get(conversation.id);
  const encDbMsg = await db.messages.get(message.id);
  const encDbNote = await db.notes.get(note.id);
  const encDbFile = await db.files.get(file.id);

  assert.equal(isEncryptedString(encDbProject.name), true, 'Project name must be ciphertext after vault migration');
  assert.equal(isEncryptedString(encDbConv.title), true, 'Conversation title must be ciphertext after vault migration');
  assert.equal(isEncryptedString(encDbMsg.content), true, 'Message content must be ciphertext after vault migration');
  assert.equal(isEncryptedString(encDbNote.content), true, 'Note content must be ciphertext after vault migration');
  assert.equal(isEncryptedString(encDbFile.name), true, 'File name must be ciphertext after vault migration');
  assert.equal(isEncryptedString(encDbFile.dataUrl), true, 'File dataUrl must be ciphertext after vault migration');

  // Verify decrypted access through repository interface while unlocked
  const decryptedProjects = await repo.getProjects();
  const matchedProject = decryptedProjects.find((p) => p.id === project.id);
  assert.equal(matchedProject.name, 'Confidential Quantum Project', 'Decrypted project name matches original');

  const decryptedMessages = await repo.getMessages(conversation.id);
  assert.equal(decryptedMessages[0].content, 'Explain the difference between Kyber-512, Kyber-768, and Kyber-1024.');
  console.log('  ✓ Existing data successfully encrypted without data loss or exposure');

  // ------------------------------------------------------------------
  // TEST 4: Lock Workspace & Memory Key Destruction
  // ------------------------------------------------------------------
  console.log('[Test 4] Lock Workspace & Memory Key Destruction');
  vault.lockVault();
  assert.equal(vault.isUnlocked(), false, 'Vault must be reported as locked');

  assert.throws(
    () => {
      vault.getKey();
    },
    VaultLockedError,
    'Attempting to retrieve key while locked must throw VaultLockedError'
  );

  // Repository getProjects in encrypted mode should reject while locked
  await assert.rejects(
    async () => {
      await repo.getProjects();
    },
    VaultLockedError,
    'Repository operations must reject when vault is locked'
  );
  console.log('  ✓ In-memory key purged and locked state enforced');

  // ------------------------------------------------------------------
  // TEST 5: Unlock Vault with Passphrase
  // ------------------------------------------------------------------
  console.log('[Test 5] Unlock Vault with Passphrase');
  await assert.rejects(
    async () => {
      await vault.unlockVault('WrongPassword123');
    },
    (err) => {
      assert.ok(err.message.includes('incorrect master passphrase') || err.name === 'InvalidPassphraseError');
      return true;
    },
    'Unlock with incorrect passphrase must reject with InvalidPassphraseError'
  );
  assert.equal(vault.isUnlocked(), false, 'Vault remains locked after failed attempt');

  const correctUnlock = await vault.unlockVault(masterPassphrase);
  assert.equal(correctUnlock, true, 'Unlock with correct passphrase must return true');
  assert.equal(vault.isUnlocked(), true, 'Vault is unlocked in RAM');
  console.log('  ✓ Unlock authorization verified');

  // ------------------------------------------------------------------
  // TEST 6: Safe Migration: Encrypted Vault -> Local Storage (Decryption)
  // ------------------------------------------------------------------
  console.log('[Test 6] Safe Migration: Encrypted Vault -> Local Storage (Decryption)');
  // User deliberately authorizes decrypting all records back to unencrypted IndexedDB
  const activeKey = vault.getKey();
  await repo.decryptAllEncryptedData(activeKey);
  repo.setMode('local_storage');

  // Verify database records are back to clean plaintext
  const decDbProject = await db.projects.get(project.id);
  const decDbMsg = await db.messages.get(message.id);
  const decDbNote = await db.notes.get(note.id);
  const decDbFile = await db.files.get(file.id);

  assert.equal(isEncryptedString(decDbProject.name), false, 'Project name is plaintext after downgrade migration');
  assert.equal(decDbProject.name, 'Confidential Quantum Project');
  assert.equal(isEncryptedString(decDbMsg.content), false, 'Message content is plaintext after downgrade migration');
  assert.equal(decDbMsg.content, 'Explain the difference between Kyber-512, Kyber-768, and Kyber-1024.');
  assert.equal(isEncryptedString(decDbNote.content), false, 'Note content is plaintext after downgrade migration');
  assert.equal(isEncryptedString(decDbFile.name), false, 'File name is plaintext after downgrade migration');
  console.log('  ✓ Controlled vault decryption migration verified');

  // ------------------------------------------------------------------
  // TEST 7: Safe Migration with Session-Only Mode
  // ------------------------------------------------------------------
  console.log('[Test 7] Safe Migration with Session-Only Mode');
  repo.setMode('session_only');
  await repo.loadMemoryFromStorage();
  assert.equal(repo.getMode(), 'session_only');

  // Create session-only conversation
  const sessionConv = await repo.createConversation({
    projectId: project.id,
    title: 'Ephemeral Session Research',
  });
  await repo.addMessage({
    conversationId: sessionConv.id,
    role: 'user',
    content: 'This message was created in ephemeral RAM session.',
  });

  // Verify it is NOT on disk yet
  const diskCheck = await db.conversations.get(sessionConv.id);
  assert.equal(diskCheck, undefined, 'Session-only conversation must not exist in IndexedDB');

  // Now migrate session data to storage
  await repo.persistSessionDataToStorage();
  const persistedConv = await db.conversations.get(sessionConv.id);
  assert.notEqual(persistedConv, undefined, 'Persisted conversation now exists in IndexedDB');
  assert.equal(persistedConv.title, 'Ephemeral Session Research');
  console.log('  ✓ Session-only persistence and disk isolation verified');

  // ------------------------------------------------------------------
  // TEST 8: Export Decrypted JSON Backup Payload Integrity
  // ------------------------------------------------------------------
  console.log('[Test 8] Export Decrypted JSON Backup Payload Integrity');
  const allProjects = await repo.getProjects();
  const allConvs = await repo.getConversations();
  const allNotes = await repo.getNotes(project.id);
  const allFiles = await repo.getFiles(project.id);

  const backupData = {
    exportedAt: new Date().toISOString(),
    app: 'Veyra AI',
    storageMode: repo.getMode(),
    projects: allProjects,
    conversations: allConvs,
    notes: allNotes,
    files: allFiles.map((f) => ({ ...f, dataUrl: undefined })),
  };

  assert.equal(backupData.app, 'Veyra AI', 'Backup contains app name');
  assert.ok(backupData.projects.length >= 2, 'Backup contains project list');
  assert.ok(backupData.conversations.length >= 2, 'Backup contains conversations');
  assert.ok(backupData.notes.length >= 1, 'Backup contains notes');
  assert.ok(backupData.files.length >= 1, 'Backup contains file metadata');
  assert.equal(backupData.files[0].dataUrl, undefined, 'Large binary payloads omitted from lightweight JSON');
  console.log('  ✓ User-controlled JSON backup structure verified');

  // ------------------------------------------------------------------
  // TEST 9: Clear All Local Data (Panic Wipe Destructive Action)
  // ------------------------------------------------------------------
  console.log('[Test 9] Clear All Local Data (Panic Wipe Destructive Action)');
  await repo.clearAll();

  const wipedProjects = await db.projects.toArray();
  const wipedConvs = await db.conversations.toArray();
  const wipedMsgs = await db.messages.toArray();
  const wipedNotes = await db.notes.toArray();
  const wipedFiles = await db.files.toArray();

  assert.equal(wipedConvs.length, 0, 'All conversations wiped from database');
  assert.equal(wipedMsgs.length, 0, 'All messages wiped from database');
  assert.equal(wipedNotes.length, 0, 'All notes wiped from database');
  assert.equal(wipedFiles.length, 0, 'All files wiped from database');
  assert.equal(wipedProjects.length, 1, 'Only default personal workspace re-initialized');
  assert.equal(wipedProjects[0].id, PERSONAL_WORKSPACE_ID, 'Restored personal workspace ID matches');
  console.log('  ✓ Panic wipe completely cleared all local tables');

  console.log('\n=============================================================');
  console.log('All 9 Privacy Center & Sovereign Migration Tests Passed Cleanly!');
  console.log('=============================================================\n');
}

runTests().catch((err) => {
  console.error('Privacy Center Test Failure:', err);
  process.exit(1);
});
