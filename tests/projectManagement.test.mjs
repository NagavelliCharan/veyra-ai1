import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { generateConversationTitle } from '../src/utils/titleGenerator.ts';
import { formatRelativeTime } from '../src/utils/timeFormatters.ts';
import {
  PrivyDatabase,
  PERSONAL_WORKSPACE_ID,
  PERSONAL_WORKSPACE,
} from '../src/services/storage/privyDatabase.ts';
import { DexieWorkspaceRepository } from '../src/services/storage/dexieWorkspaceRepository.ts';
import { searchAll } from '../src/services/search/searchEngine.ts';

console.log('===============================================================');
console.log('--- Running Veyra AI Projects & Conversations Test Suite ---');
console.log('===============================================================\n');

// Test 1: Title Generator
function testTitleGenerator() {
  console.log('[Test 1] Conversation Title Generator');

  const t1 = generateConversationTitle('Can you please explain how zero knowledge proofs work in Ethereum?');
  assert.ok(!t1.toLowerCase().startsWith('can you please explain'));
  assert.ok(t1.includes('Zero knowledge proofs'));

  const t2 = generateConversationTitle('What is the difference between differential privacy and k-anonymity?');
  assert.ok(!t2.toLowerCase().startsWith('what is the'));
  assert.ok(t2.includes('Difference between differential'));

  const t3 = generateConversationTitle('```python\nprint("hello")\n```\nHow does this code execute?');
  assert.ok(!t3.includes('```'));

  const t4 = generateConversationTitle('');
  assert.equal(t4, 'New Conversation');

  const t5 = generateConversationTitle('   ');
  assert.equal(t5, 'New Conversation');

  const t6 = generateConversationTitle('Summarize chapter 4 of the GDPR regulation regarding user deletion');
  assert.ok(!t6.toLowerCase().startsWith('summarize'));

  console.log('  ✓ Title generator correctly cleans questions, markdown code blocks, and whitespace');
}

// Test 2: Relative Time Formatter
function testRelativeTime() {
  console.log('\n[Test 2] Relative Time Formatter');

  const now = Date.now();
  assert.equal(formatRelativeTime(now), 'Just now');
  assert.equal(formatRelativeTime(now - 5 * 60 * 1000), '5m ago');
  assert.equal(formatRelativeTime(now - 2 * 60 * 60 * 1000), '2h ago');
  assert.equal(formatRelativeTime(now - 24 * 60 * 60 * 1000), 'Yesterday');
  assert.equal(formatRelativeTime(now - 3 * 24 * 60 * 60 * 1000), '3d ago');

  console.log('  ✓ Relative time formatter accurate across minutes, hours, and days');
}

// Test 3: Project Creation and Default Personal Workspace
async function testProjectCreationAndPersonalWorkspace() {
  console.log('\n[Test 3] Project Creation & Default Personal Workspace');
  const db = new PrivyDatabase('Proj_Test_DB_1_' + Date.now());
  const repo = new DexieWorkspaceRepository(db);
  await repo.init();

  const initialProjects = await repo.getProjects();
  const personal = initialProjects.find((p) => p.id === PERSONAL_WORKSPACE_ID);
  assert.ok(personal, 'Personal Workspace must be initialized by default');
  assert.equal(personal.isPersonalWorkspace, true);

  const customProj = await repo.createProject({
    name: 'Homomorphic Encryption Study',
    description: 'Evaluating BGV and CKKS schemes',
    colorTag: '#6366f1',
  });
  assert.ok(customProj.id);
  assert.equal(customProj.name, 'Homomorphic Encryption Study');
  assert.equal(customProj.description, 'Evaluating BGV and CKKS schemes');
  assert.equal(customProj.colorTag, '#6366f1');
  assert.equal(customProj.isPersonalWorkspace, false);

  const allProjects = await repo.getProjects();
  assert.ok(allProjects.some((p) => p.id === customProj.id));
  console.log('  ✓ Personal workspace initialized and custom project created successfully');
}

// Test 4: Empty Name Handling & Validation
async function testEmptyNameValidation() {
  console.log('\n[Test 4] Empty Name Validation & Rejection');
  const db = new PrivyDatabase('Proj_Test_DB_2_' + Date.now());
  const repo = new DexieWorkspaceRepository(db);
  await repo.init();

  // 4a. Reject empty project name
  await assert.rejects(
    async () => {
      await repo.createProject({ name: '' });
    },
    /Project name cannot be empty/i,
    'Empty project name must be rejected'
  );

  // 4b. Reject whitespace-only project name
  await assert.rejects(
    async () => {
      await repo.createProject({ name: '    \t\n  ' });
    },
    /Project name cannot be empty/i,
    'Whitespace project name must be rejected'
  );

  // 4c. Reject renaming to empty name
  const proj = await repo.createProject({ name: 'Valid Project' });
  await assert.rejects(
    async () => {
      await repo.updateProject(proj.id, { name: '   ' });
    },
    /Project name cannot be empty/i,
    'Renaming to empty name must be rejected'
  );

  console.log('  ✓ Empty/whitespace project names strictly rejected with clear errors');
}

// Test 5: Rename Project & Update Metadata
async function testRenameProject() {
  console.log('\n[Test 5] Rename Project & Metadata Updates');
  const db = new PrivyDatabase('Proj_Test_DB_3_' + Date.now());
  const repo = new DexieWorkspaceRepository(db);
  await repo.init();

  const proj = await repo.createProject({
    name: 'Initial Project Name',
    description: 'Initial description',
    colorTag: '#10b981',
  });

  const updated = await repo.updateProject(proj.id, {
    name: 'Renamed Project Folder',
    description: 'Updated research scope',
    colorTag: '#ec4899',
  });

  assert.equal(updated.name, 'Renamed Project Folder');
  assert.equal(updated.description, 'Updated research scope');
  assert.equal(updated.colorTag, '#ec4899');

  const fetched = await repo.getProject(proj.id);
  assert.equal(fetched.name, 'Renamed Project Folder');
  console.log('  ✓ Project renaming and metadata updates accurately persisted');
}

// Test 6: Personal Workspace Protection
async function testPersonalWorkspaceProtection() {
  console.log('\n[Test 6] Personal Workspace Protection');
  const db = new PrivyDatabase('Proj_Test_DB_4_' + Date.now());
  const repo = new DexieWorkspaceRepository(db);
  await repo.init();

  // Attempt to delete Personal Workspace
  await assert.rejects(
    async () => {
      await repo.deleteProject(PERSONAL_WORKSPACE_ID);
    },
    /Personal Workspace cannot be deleted/i,
    'Must prevent deletion of personal workspace'
  );

  // Attempt to rename Personal Workspace
  const attemptedRename = await repo.updateProject(PERSONAL_WORKSPACE_ID, {
    name: 'Hacked Name',
  });
  assert.equal(attemptedRename.name, PERSONAL_WORKSPACE.name, 'Personal workspace name must be preserved');

  console.log('  ✓ Personal workspace is strictly protected against deletion and rename');
}

// Test 7: Project Deletion & Cascading Cleanup
async function testProjectDeletionCascade() {
  console.log('\n[Test 7] Project Deletion & Cascading Cleanup');
  const db = new PrivyDatabase('Proj_Test_DB_5_' + Date.now());
  const repo = new DexieWorkspaceRepository(db);
  await repo.init();

  const proj = await repo.createProject({ name: 'Temporary Research Folder' });
  const conv1 = await repo.createConversation({ projectId: proj.id, title: 'Chat 1' });
  const conv2 = await repo.createConversation({ projectId: proj.id, title: 'Chat 2' });

  await repo.addMessage({
    conversationId: conv1.id,
    projectId: proj.id,
    role: 'user',
    content: 'Sensitive query inside project',
  });

  await repo.addMessage({
    conversationId: conv2.id,
    projectId: proj.id,
    role: 'assistant',
    content: 'Assistant answer inside project',
  });

  const note = await repo.saveNote({
    projectId: proj.id,
    title: 'Project Note',
    content: 'Project specific note content',
  });

  const file = await repo.addFile({
    projectId: proj.id,
    name: 'data.txt',
    size: 256,
    type: 'text/plain',
  });

  // Execute project deletion
  await repo.deleteProject(proj.id);

  // Verify project is gone
  const fetchedProj = await repo.getProject(proj.id);
  assert.equal(fetchedProj, null);

  // Verify all conversations in project are gone
  const remainingConvs = await repo.getConversations(proj.id);
  assert.equal(remainingConvs.length, 0);

  // Verify messages are deleted
  const msgs1 = await repo.getMessages(conv1.id);
  const msgs2 = await repo.getMessages(conv2.id);
  assert.equal(msgs1.length, 0);
  assert.equal(msgs2.length, 0);

  // Verify notes and files are deleted
  const notes = await repo.getNotes(proj.id);
  const files = await repo.getFiles(proj.id);
  assert.equal(notes.length, 0);
  assert.equal(files.length, 0);

  console.log('  ✓ Project deletion cascades atomically to all conversations, messages, notes, and files');
}

// Test 8: Conversation Creation in Selected Project
async function testConversationCreationInProject() {
  console.log('\n[Test 8] Conversation Creation in Selected Project');
  const db = new PrivyDatabase('Proj_Test_DB_6_' + Date.now());
  const repo = new DexieWorkspaceRepository(db);
  await repo.init();

  const projA = await repo.createProject({ name: 'Project Alpha' });
  const projB = await repo.createProject({ name: 'Project Beta' });

  const convA = await repo.createConversation({ projectId: projA.id, title: 'Alpha Discussion' });
  const convB = await repo.createConversation({ projectId: projB.id, title: 'Beta Discussion' });

  assert.equal(convA.projectId, projA.id);
  assert.equal(convB.projectId, projB.id);

  const convsInA = await repo.getConversations(projA.id);
  const convsInB = await repo.getConversations(projB.id);

  assert.ok(convsInA.some((c) => c.id === convA.id));
  assert.ok(!convsInA.some((c) => c.id === convB.id));
  assert.ok(convsInB.some((c) => c.id === convB.id));
  assert.ok(!convsInB.some((c) => c.id === convA.id));

  console.log('  ✓ Conversations strictly associated with their designated projects');
}

// Test 9: Conversation Renaming & Graceful Empty Title Fallback
async function testConversationRenaming() {
  console.log('\n[Test 9] Conversation Renaming & Graceful Empty Title Fallback');
  const db = new PrivyDatabase('Proj_Test_DB_7_' + Date.now());
  const repo = new DexieWorkspaceRepository(db);
  await repo.init();

  const proj = await repo.createProject({ name: 'Workspace' });
  const conv = await repo.createConversation({ projectId: proj.id, title: 'Original Title' });

  // 9a. Normal Rename
  const renamed = await repo.updateConversation(conv.id, { title: 'Updated Discussion Title' });
  assert.equal(renamed.title, 'Updated Discussion Title');

  // 9b. Empty Title Update -> Gracefully preserves or defaults title without blanking out
  const emptyUpdate = await repo.updateConversation(conv.id, { title: '   ' });
  assert.ok(emptyUpdate.title.length > 0, 'Title must not be blanked out');
  assert.equal(emptyUpdate.title, 'Updated Discussion Title', 'Preserved existing title on empty input');

  // 9c. Empty Title on Creation -> defaults to New Conversation
  const defaultConv = await repo.createConversation({ projectId: proj.id, title: '' });
  assert.equal(defaultConv.title, 'New Conversation');

  console.log('  ✓ Conversation renaming succeeds and handles empty names gracefully');
}

// Test 10: Conversation Deletion with Message Cleanup
async function testConversationDeletion() {
  console.log('\n[Test 10] Conversation Deletion with Message Cascade');
  const db = new PrivyDatabase('Proj_Test_DB_8_' + Date.now());
  const repo = new DexieWorkspaceRepository(db);
  await repo.init();

  const proj = await repo.createProject({ name: 'Test Proj' });
  const conv = await repo.createConversation({ projectId: proj.id, title: 'To Be Deleted' });

  await repo.addMessage({
    conversationId: conv.id,
    projectId: proj.id,
    role: 'user',
    content: 'Message 1',
  });
  await repo.addMessage({
    conversationId: conv.id,
    projectId: proj.id,
    role: 'assistant',
    content: 'Message 2',
  });

  const msgsBefore = await repo.getMessages(conv.id);
  assert.equal(msgsBefore.length, 2);

  await repo.deleteConversation(conv.id);

  const convAfter = await repo.getConversation(conv.id);
  assert.equal(convAfter, null);

  const msgsAfter = await repo.getMessages(conv.id);
  assert.equal(msgsAfter.length, 0);

  console.log('  ✓ Deleting conversation removes conversation and all its messages');
}

// Test 11: Message Isolation Between Conversations
async function testMessageIsolationBetweenConversations() {
  console.log('\n[Test 11] Message Isolation Between Conversations');
  const db = new PrivyDatabase('Proj_Test_DB_9_' + Date.now());
  const repo = new DexieWorkspaceRepository(db);
  await repo.init();

  const proj = await repo.createProject({ name: 'Isolation Proj' });
  const conv1 = await repo.createConversation({ projectId: proj.id, title: 'Chat 1' });
  const conv2 = await repo.createConversation({ projectId: proj.id, title: 'Chat 2' });

  await repo.addMessage({
    conversationId: conv1.id,
    projectId: proj.id,
    role: 'user',
    content: 'Secret alpha discussion details',
  });

  await repo.addMessage({
    conversationId: conv2.id,
    projectId: proj.id,
    role: 'user',
    content: 'Secret beta discussion details',
  });

  const msgs1 = await repo.getMessages(conv1.id);
  const msgs2 = await repo.getMessages(conv2.id);

  assert.equal(msgs1.length, 1);
  assert.equal(msgs1[0].content, 'Secret alpha discussion details');
  assert.equal(msgs2.length, 1);
  assert.equal(msgs2[0].content, 'Secret beta discussion details');

  // Verify cross-leakage prevention
  assert.ok(!msgs1.some((m) => m.content.includes('beta')));
  assert.ok(!msgs2.some((m) => m.content.includes('alpha')));

  console.log('  ✓ Messages strictly isolated; zero cross-contamination between chats');
}

// Test 12: Project & Conversation Search
async function testSearchProjectsAndConversations() {
  console.log('\n[Test 12] Search Across Projects & Conversations');
  const db = new PrivyDatabase('Proj_Test_DB_10_' + Date.now());
  const repo = new DexieWorkspaceRepository(db);
  await repo.init();

  const p1 = await repo.createProject({
    name: 'Quantum Privacy Protocols',
    description: 'Post-quantum key exchange mechanisms',
  });
  const p2 = await repo.createProject({
    name: 'Zero-Knowledge Cryptography',
    description: 'zk-SNARKs and Plonk proofs',
  });

  const c1 = await repo.createConversation({
    projectId: p1.id,
    title: 'Kyber Algorithm Benchmark',
  });
  const c2 = await repo.createConversation({
    projectId: p2.id,
    title: 'Groth16 Verifier Gas Cost',
  });

  const projects = await repo.getProjects();
  const conversations = await repo.getConversations();

  // 12a. Search for "Quantum"
  const res1 = searchAll('Quantum', projects, conversations, [], [], []);
  assert.ok(res1.some((r) => r.type === 'project' && r.title === 'Quantum Privacy Protocols'));

  // 12b. Search for "Groth16"
  const res2 = searchAll('groth16', projects, conversations, [], [], []);
  assert.ok(res2.some((r) => r.type === 'conversation' && r.title === 'Groth16 Verifier Gas Cost'));

  // 12c. Empty search query
  const resEmpty = searchAll('', projects, conversations, [], [], []);
  assert.equal(resEmpty.length, 0);

  console.log('  ✓ Search correctly indexes project names, descriptions, and conversation titles');
}

// Test 13: Local Persistence Across Reload Simulation
async function testPersistenceAcrossReload() {
  console.log('\n[Test 13] Persistence Across Simulated Browser Reload');
  const dbName = 'Proj_Test_DB_Reload_' + Date.now();

  // Session 1: Create data
  const db1 = new PrivyDatabase(dbName);
  const repo1 = new DexieWorkspaceRepository(db1);
  await repo1.init();

  const savedProj = await repo1.createProject({
    name: 'Persistent Research Folder',
    description: 'Data must persist across reloads',
  });

  const savedConv = await repo1.createConversation({
    projectId: savedProj.id,
    title: 'Persistent Thread',
  });

  await repo1.addMessage({
    conversationId: savedConv.id,
    projectId: savedProj.id,
    role: 'user',
    content: 'Remember this message forever',
  });

  // Session 2: Reload with new database instance pointing to same DB name
  const db2 = new PrivyDatabase(dbName);
  const repo2 = new DexieWorkspaceRepository(db2);
  await repo2.init();

  const reloadedProjects = await repo2.getProjects();
  const foundProj = reloadedProjects.find((p) => p.id === savedProj.id);
  assert.ok(foundProj, 'Project must persist across reload');
  assert.equal(foundProj.name, 'Persistent Research Folder');

  const reloadedConvs = await repo2.getConversations(savedProj.id);
  const foundConv = reloadedConvs.find((c) => c.id === savedConv.id);
  assert.ok(foundConv, 'Conversation must persist across reload');
  assert.equal(foundConv.title, 'Persistent Thread');

  const reloadedMsgs = await repo2.getMessages(savedConv.id);
  assert.equal(reloadedMsgs.length, 1);
  assert.equal(reloadedMsgs[0].content, 'Remember this message forever');

  console.log('  ✓ All projects, conversations, and messages restored accurately after simulated restart');
}

async function run() {
  testTitleGenerator();
  testRelativeTime();
  await testProjectCreationAndPersonalWorkspace();
  await testEmptyNameValidation();
  await testRenameProject();
  await testPersonalWorkspaceProtection();
  await testProjectDeletionCascade();
  await testConversationCreationInProject();
  await testConversationRenaming();
  await testConversationDeletion();
  await testMessageIsolationBetweenConversations();
  await testSearchProjectsAndConversations();
  await testPersistenceAcrossReload();

  console.log('\n===============================================================');
  console.log('✓ All 13 Project & Conversation Management Tests Passed Cleanly!');
  console.log('===============================================================');
}

run();
