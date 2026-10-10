import type { Conversation, Message, Project, ProjectFile, ProjectNote } from '../types';

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj-privacy-tech',
    name: 'Privacy & Cryptography Research',
    description: 'Investigating zero-knowledge proofs, client-side encryption, and differential privacy.',
    colorTag: '#6366f1', // Indigo
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 3600000,
  },
  {
    id: 'proj-thesis-draft',
    name: 'Master Thesis: AI Governance',
    description: 'Literature review and ethical frameworks for privacy-preserving foundation models.',
    colorTag: '#10b981', // Emerald
    createdAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 7200000,
  },
];

export const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-zk-proofs',
    projectId: 'proj-privacy-tech',
    title: 'Zero Knowledge Proofs Primer',
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 3600000,
    messageCount: 2,
  },
  {
    id: 'conv-threat-model',
    projectId: 'proj-privacy-tech',
    title: 'Client-Side Threat Modeling',
    createdAt: Date.now() - 86400000 * 1,
    updatedAt: Date.now() - 86400000 * 1,
    messageCount: 2,
  },
  {
    id: 'conv-lit-review',
    projectId: 'proj-thesis-draft',
    title: 'EU AI Act & Data Protection',
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 7200000,
    messageCount: 2,
  },
];

export const INITIAL_MESSAGES: Message[] = [
  {
    id: 'msg-zk-1',
    conversationId: 'conv-zk-proofs',
    projectId: 'proj-privacy-tech',
    role: 'user',
    content: 'Can you summarize how zero-knowledge proofs help protect personal data in decentralized applications?',
    createdAt: Date.now() - 86400000 * 2,
    metadata: {
      tokenCount: 18,
    },
  },
  {
    id: 'msg-zk-2',
    conversationId: 'conv-zk-proofs',
    projectId: 'proj-privacy-tech',
    role: 'assistant',
    content: `### Zero-Knowledge Proofs (ZKPs) in Data Privacy

Zero-Knowledge Proofs enable one party (the **Prover**) to prove to another (the **Verifier**) that a statement is true without revealing any information beyond the statement's validity.

#### Core Security Properties:
1. **Completeness**: If the statement is true and both parties are honest, the verifier will always be convinced.
2. **Soundness**: A cheating prover cannot convince an honest verifier of a false statement, except with negligible probability.
3. **Zero-Knowledge**: If the statement is true, the verifier learns nothing other than this fact.

#### Applications in Veyra AI Workflows:
- Verifying student/researcher credentials without exposing personal identifiers.
- Proving encrypted data integrity before synchronizing with secondary vaults.`,
    createdAt: Date.now() - 86400000 * 2 + 3000,
    metadata: {
      modelName: 'Veyra Local Engine (Offline)',
      tokenCount: 145,
      isSimulated: true,
    },
  },
  {
    id: 'msg-threat-1',
    conversationId: 'conv-threat-model',
    projectId: 'proj-privacy-tech',
    role: 'user',
    content: 'What are the main threat vectors when storing private notes in browser IndexedDB?',
    createdAt: Date.now() - 86400000 * 1,
    metadata: {
      tokenCount: 14,
    },
  },
  {
    id: 'msg-threat-2',
    conversationId: 'conv-threat-model',
    projectId: 'proj-privacy-tech',
    role: 'assistant',
    content: `### IndexedDB Security & Threat Vectors

While IndexedDB provides persistent storage, storing sensitive research plaintext exposes data to:

1. **Malicious Browser Extensions**: Extensions with broad page permissions can read unencrypted IndexedDB objects.
2. **Physical / Device Access**: Anyone with access to the user profile folder or DevTools can inspect stored items.
3. **Cross-Site Scripting (XSS)**: An injected script can query the database.

**Veyra AI Mitigation**: We employ **Envelope Encryption (AES-GCM 256-bit)** before writing records to IndexedDB. Even if database files are extracted, all contents remain indecipherable ciphertext without the master passphrase.`,
    createdAt: Date.now() - 86400000 * 1 + 2500,
    metadata: {
      modelName: 'Veyra Local Engine (Offline)',
      tokenCount: 130,
      isSimulated: true,
    },
  },
  {
    id: 'msg-lit-1',
    conversationId: 'conv-lit-review',
    projectId: 'proj-thesis-draft',
    role: 'user',
    content: 'What key compliance aspects should AI systems follow under European data protection standards?',
    createdAt: Date.now() - 86400000 * 5,
    metadata: {
      tokenCount: 13,
    },
  },
  {
    id: 'msg-lit-2',
    conversationId: 'conv-lit-review',
    projectId: 'proj-thesis-draft',
    role: 'assistant',
    content: `### EU Compliance Considerations for AI Applications

Under GDPR and the EU AI Act, AI systems handling personal data must adhere to:

- **Purpose Limitation & Data Minimization**: Collect only what is strictly necessary.
- **Right to Erasure (Article 17)**: Users must be able to completely delete their conversation logs. Veyra AI addresses this via client-side local controls and our one-click **Panic Data Wipe**.
- **Transparency**: Clear disclosures on data processing locations (local browser vs. third-party AI APIs).`,
    createdAt: Date.now() - 86400000 * 5 + 3000,
    metadata: {
      modelName: 'Veyra Local Engine (Offline)',
      tokenCount: 110,
      isSimulated: true,
    },
  },
];

export const INITIAL_NOTES: ProjectNote[] = [
  {
    id: 'note-zk-summary',
    projectId: 'proj-privacy-tech',
    title: 'Cryptographic Primitives Overview',
    content: `# Cryptographic Primitives Notes

- **AES-GCM (256-bit)**: Symmetric cipher providing confidentiality and built-in message authentication.
- **PBKDF2**: Key derivation function with high iteration counts (100k+) to resist GPU-based brute force.
- **Web Crypto API**: Native browser hardware-accelerated cryptographic subsystem.

### Action Items
- [x] Implement zero-knowledge passphrase verification test.
- [x] Configure session-only fallback mode.
- [ ] Add export option for encrypted vault bundles.`,
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 3600000,
  },
  {
    id: 'note-thesis-ch1',
    projectId: 'proj-thesis-draft',
    title: 'Chapter 1: Research Objectives',
    content: `# Chapter 1: Introduction & Research Problem

This thesis explores the intersection of user privacy, self-sovereign data architectures, and conversational AI assistants.

## Research Questions
1. How can zero-retention architectures mitigate surveillance capitalism in student workspaces?
2. What are the performance trade-offs of client-side envelope encryption in modern browser runtimes?`,
    createdAt: Date.now() - 86400000 * 4,
    updatedAt: Date.now() - 7200000,
  },
];

export const INITIAL_FILES: ProjectFile[] = [
  {
    id: 'file-rfc-crypto',
    projectId: 'proj-privacy-tech',
    name: 'nist_sp800_38d_aes_gcm.pdf',
    size: 482104,
    type: 'application/pdf',
    uploadedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'file-lit-notes',
    projectId: 'proj-thesis-draft',
    name: 'gdpr_article_17_summary.txt',
    size: 24190,
    type: 'text/plain',
    uploadedAt: Date.now() - 86400000 * 3,
  },
];
