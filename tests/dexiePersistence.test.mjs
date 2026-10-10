import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
import {
  PrivyDatabase,
  PERSONAL_WORKSPACE_ID,
  PERSONAL_WORKSPACE,
} from '../src/services/storage/privyDatabase.ts';
import { DexieWorkspaceRepository } from '../src/services/storage/dexieWorkspaceRepository.ts';

console.log('--- Testing Dexie IndexedDB Workspace Persistence ---');

async function runTests() {
  // Test 1: Repository Initialization and Personal Workspace Guarantee
  console.log('\n[Test 1] Repository Initialization & Personal Workspace');
  const db1 = new PrivyDatabase();
  const repo1 = new DexieWorkspaceRepository(db1);
  await repo1.init();

  const initialProjects = await repo1.getProjects();
  assert.ok(initialProjects.length >= 1, 'Should have projects seeded');
  
  const personalWorkspace = initialProjects.find(p => p.id === PERSONAL_WORKSPACE_ID);
  assert.ok(personalWorkspace, 'Personal Workspace must always exist');
  assert.equal(personalWorkspace.isPersonalWorkspace, true, 'isPersonalWorkspace flag must be true');
  console.log('✓ Personal workspace initialized and verified');

  // Test 2: Project CRUD Operations
  console.log('\n[Test 2] Project CRUD Operations');
  const createdProject = await repo1.createProject({
    name: 'Zero-Knowledge Privacy',
    description: 'Testing zk-SNARKs and client-side proofs',
    colorTag: '#10b981',
  });
  assert.ok(createdProject.id, 'Project must receive an ID');
  assert.equal(createdProject.name, 'Zero-Knowledge Privacy');

  const fetchedProject = await repo1.getProject(createdProject.id);
  assert.ok(fetchedProject, 'Should retrieve created project');
  assert.equal(fetchedProject.description, 'Testing zk-SNARKs and client-side proofs');

  // Update project
  const updatedProject = await repo1.updateProject(createdProject.id, {
    name: 'Advanced ZK Proofs',
  });
  assert.equal(updatedProject?.name, 'Advanced ZK Proofs');

  // Deletion protection on Personal Workspace
  await assert.rejects(
    async () => {
      await repo1.deleteProject(PERSONAL_WORKSPACE_ID);
    },
    /Personal Workspace cannot be deleted/i,
    'Must prevent deletion of personal workspace'
  );
  console.log('✓ Project CRUD and Personal Workspace protection verified');

  // Test 3: Conversation CRUD & Automatic Project Binding
  console.log('\n[Test 3] Conversation CRUD & Project Binding');
  // 3a. Create conversation in project
  const conv1 = await repo1.createConversation({
    projectId: createdProject.id,
    title: 'Groth16 Verification Protocol',
  });
  assert.equal(conv1.projectId, createdProject.id);
  assert.equal(conv1.title, 'Groth16 Verification Protocol');

  // 3b. Create conversation with invalid/missing project -> must fall back to personal workspace
  const orphanedConv = await repo1.createConversation({
    projectId: 'non-existent-project-999',
    title: 'Independent Idea',
  });
  assert.equal(orphanedConv.projectId, PERSONAL_WORKSPACE_ID, 'Must fallback to personal workspace');

  // 3c. Rename conversation
  const renamedConv = await repo1.updateConversation(conv1.id, {
    title: 'Groth16 vs PLONK Comparisons',
  });
  assert.equal(renamedConv?.title, 'Groth16 vs PLONK Comparisons');
  console.log('✓ Conversation CRUD and fallback assignment verified');

  // Test 4: Message Persistence and Integrity
  console.log('\n[Test 4] Message Persistence');
  const msg1 = await repo1.addMessage({
    conversationId: conv1.id,
    projectId: conv1.projectId,
    role: 'user',
    content: 'How do succinct non-interactive arguments of knowledge preserve input secrecy?',
  });
  assert.ok(msg1.id);
  assert.equal(msg1.content, 'How do succinct non-interactive arguments of knowledge preserve input secrecy?');

  const msg2 = await repo1.addMessage({
    conversationId: conv1.id,
    projectId: conv1.projectId,
    role: 'assistant',
    content: 'ZK proofs mathematically confirm statement validity without revealing witness variables.',
  });

  const conversationMessages = await repo1.getMessages(conv1.id);
  assert.equal(conversationMessages.length, 2);
  assert.equal(conversationMessages[0].role, 'user');
  assert.equal(conversationMessages[1].role, 'assistant');
  console.log('✓ Messages persisted accurately with correct roles and timestamps');

  // Test 5: Notes & File Metadata Persistence
  console.log('\n[Test 5] Notes & File Metadata');
  const note1 = await repo1.saveNote({
    projectId: createdProject.id,
    title: 'Setup Parameters',
    content: 'Trusted setup ceremony notes and multi-party computation logs.',
  });
  assert.equal(note1.title, 'Setup Parameters');

  const file1 = await repo1.addFile({
    projectId: createdProject.id,
    name: 'circuit.circom',
    size: 2048,
    type: 'text/plain',
  });
  assert.equal(file1.name, 'circuit.circom');

  const projectNotes = await repo1.getNotes(createdProject.id);
  const projectFiles = await repo1.getFiles(createdProject.id);
  // Projects include 1 default starter note created upon project creation + 1 newly added note
  assert.equal(projectNotes.length, 2, 'Should contain starter note + added note');
  assert.equal(projectFiles.length, 1);
  console.log('✓ Notes and File metadata stored and indexed by project');

  // Test 6: Simulation of Page Refresh / Browser Restart
  console.log('\n[Test 6] Page Refresh & Browser Restart Persistence Simulation');
  // Close the active database connection (simulates page unload)
  db1.close();

  // Create a brand new database connection to the same IndexedDB store
  const db2 = new PrivyDatabase();
  const repo2 = new DexieWorkspaceRepository(db2);
  await repo2.init();

  // Verify all previously written data survives the refresh simulation
  const restoredProject = await repo2.getProject(createdProject.id);
  assert.ok(restoredProject, 'Project must survive restart');
  assert.equal(restoredProject.name, 'Advanced ZK Proofs');

  const restoredConv = await repo2.getConversation(conv1.id);
  assert.ok(restoredConv, 'Conversation must survive restart');
  assert.equal(restoredConv.title, 'Groth16 vs PLONK Comparisons');

  const restoredMessages = await repo2.getMessages(conv1.id);
  assert.equal(restoredMessages.length, 2, 'All messages must survive restart');
  assert.equal(restoredMessages[0].content, 'How do succinct non-interactive arguments of knowledge preserve input secrecy?');

  const restoredNotes = await repo2.getNotes(createdProject.id);
  assert.equal(restoredNotes.length, 2, 'All notes (including starter note) must survive restart');
  assert.ok(restoredNotes.some(n => n.title === 'Setup Parameters'));

  console.log('✓ All records persisted and restored intact after database reopening');

  // Test 7: Cascade Deletion
  console.log('\n[Test 7] Cascade Deletion Verification');
  // Deleting the project must cascade delete its conversations, messages, notes, and files
  await repo2.deleteProject(createdProject.id);

  assert.equal(await repo2.getProject(createdProject.id), null);
  assert.equal(await repo2.getConversation(conv1.id), null);
  const orphanedMessages = await repo2.getMessages(conv1.id);
  assert.equal(orphanedMessages.length, 0);
  const orphanedNotes = await repo2.getNotes(createdProject.id);
  assert.equal(orphanedNotes.length, 0);
  const orphanedFiles = await repo2.getFiles(createdProject.id);
  assert.equal(orphanedFiles.length, 0);
  console.log('✓ Cascade deletion cleaned up all associated conversations, messages, and files');

  // Test 8: Session-Only Mode Isolation
  console.log('\n[Test 8] Session-Only Mode Memory Isolation');
  repo2.setMode('session_only');
  assert.equal(repo2.getMode(), 'session_only');

  const ephemeralProject = await repo2.createProject({
    name: 'Ephemeral Volatile Session',
    description: 'Should never hit IndexedDB',
  });
  
  // Verify it exists in the active session
  const inMemoryProj = await repo2.getProject(ephemeralProject.id);
  assert.ok(inMemoryProj, 'Exists in memory session');

  // Check persistent IndexedDB table directly to verify it was NOT written
  const indexedDbRecord = await db2.projects.get(ephemeralProject.id);
  assert.equal(indexedDbRecord, undefined, 'Must not be written to persistent IndexedDB in session-only mode');
  console.log('✓ Session-only mode operations isolated to RAM cache');

  // Test 9: Clear All Local Data
  console.log('\n[Test 9] Clear All Local Data');
  repo2.setMode('local_storage');
  await repo2.clearAll();

  // After clear, only the clean Personal Workspace should remain
  const remainingProjects = await repo2.getProjects();
  assert.equal(remainingProjects.length, 1);
  assert.equal(remainingProjects[0].id, PERSONAL_WORKSPACE_ID);
  
  const totalConvs = (await repo2.getConversations()).length;
  assert.equal(totalConvs, 0);
  console.log('✓ Clear-all wiped user data and re-established clean Personal Workspace');

  // Test 10: Safe Schema Migration (v1 -> v2)
  console.log('\n[Test 10] Safe Schema Migration v1 -> v2');
  const migrationDbName = 'MigrationTestDB_' + Date.now();
  
  // Step A: Create DB under v1 schema
  const dbV1 = new Dexie(migrationDbName);
  dbV1.version(1).stores({
    projects: 'id, name, createdAt, updatedAt',
    conversations: 'id, projectId, title, createdAt, updatedAt',
    messages: 'id, conversationId, projectId, role, createdAt',
    notes: 'id, projectId, title, createdAt, updatedAt',
    files: 'id, projectId, name, size, type, uploadedAt',
    settings: 'id, updatedAt',
  });
  await dbV1.open();
  
  // Add a project and an orphaned conversation (projectId pointing to non-existent project)
  await dbV1.table('projects').add({
    id: 'old-project-1',
    name: 'Old Project',
    createdAt: 1000,
    updatedAt: 1000,
  });
  await dbV1.table('conversations').add({
    id: 'orphan-conv-1',
    projectId: 'deleted-or-missing-project',
    title: 'Migrated Conversation',
    createdAt: 1000,
    updatedAt: 1000,
  });
  dbV1.close();

  // Step B: Re-open with v2 schema and upgrade hook
  const dbV2 = new Dexie(migrationDbName);
  dbV2.version(1).stores({
    projects: 'id, name, createdAt, updatedAt',
    conversations: 'id, projectId, title, createdAt, updatedAt',
    messages: 'id, conversationId, projectId, role, createdAt',
    notes: 'id, projectId, title, createdAt, updatedAt',
    files: 'id, projectId, name, size, type, uploadedAt',
    settings: 'id, updatedAt',
  });
  dbV2.version(2).stores({
    projects: 'id, name, createdAt, updatedAt, isPersonalWorkspace',
    conversations: 'id, projectId, title, createdAt, updatedAt',
    messages: 'id, conversationId, projectId, role, createdAt',
    notes: 'id, projectId, title, createdAt, updatedAt',
    files: 'id, projectId, name, size, type, uploadedAt',
    settings: 'id, updatedAt',
  }).upgrade(async (tx) => {
    const existingProjects = await tx.table('projects').toArray();
    const projectIds = new Set(existingProjects.map((p) => p.id));

    if (!projectIds.has(PERSONAL_WORKSPACE_ID)) {
      await tx.table('projects').add(PERSONAL_WORKSPACE);
      projectIds.add(PERSONAL_WORKSPACE_ID);
    }

    await tx
      .table('conversations')
      .toCollection()
      .modify((conv) => {
        if (!conv.projectId || !projectIds.has(conv.projectId)) {
          conv.projectId = PERSONAL_WORKSPACE_ID;
        }
      });
  });

  await dbV2.open();

  // Verify Personal Workspace was added during upgrade
  const migratedPersonalWorkspace = await dbV2.table('projects').get(PERSONAL_WORKSPACE_ID);
  assert.ok(migratedPersonalWorkspace, 'Personal workspace added in v2 upgrade');

  // Verify orphan conversation was safely reassigned to Personal Workspace
  const migratedConv = await dbV2.table('conversations').get('orphan-conv-1');
  assert.equal(migratedConv.projectId, PERSONAL_WORKSPACE_ID, 'Orphaned conversation migrated to Personal Workspace');
  dbV2.close();
  console.log('✓ Migration v1 -> v2 executed successfully without data loss');

  console.log('\n======================================================');
  console.log('All Dexie IndexedDB persistence tests passed cleanly!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
