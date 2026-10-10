import Dexie from 'dexie';
import type {
  Conversation,
  Message,
  Project,
  ProjectFile,
  ProjectNote,
  SearchResult,
  StorageMode,
  StorageQuotaInfo,
} from '../../types/index.ts';
import {
  INITIAL_CONVERSATIONS,
  INITIAL_FILES,
  INITIAL_MESSAGES,
  INITIAL_NOTES,
  INITIAL_PROJECTS,
} from '../../utils/sampleData.ts';
import {
  PERSONAL_WORKSPACE,
  PERSONAL_WORKSPACE_ID,
  privyDb,
  PrivyDatabase,
} from './privyDatabase.ts';
import type {
  CreateConversationInput,
  CreateProjectInput,
  UpdateConversationInput,
  UpdateProjectInput,
  WorkspaceRepository,
} from './repositoryInterface.ts';
import {
  decryptString,
  encryptString,
  isEncryptedString,
  VaultLockedError,
} from '../crypto/webCryptoEngine.ts';
import { vaultManager, type VaultManager } from '../crypto/vaultManager.ts';

export class StorageQuotaExceededError extends Error {
  constructor(message = 'Browser storage quota exceeded. Please free up disk space.') {
    super(message);
    this.name = 'StorageQuotaExceededError';
  }
}

export class StorageUnavailableError extends Error {
  constructor(message = 'IndexedDB storage is currently unavailable on this device.') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

/**
 * DexieWorkspaceRepository implements the WorkspaceRepository interface
 * backed by IndexedDB using Dexie v4 with optional AES-GCM 256-bit envelope encryption.
 *
 * Privacy Guarantees:
 * - In Encrypted mode, sensitive text (messages, titles, notes, file contents) is
 *   encrypted via AES-GCM with a fresh random IV before writing to IndexedDB.
 * - In Session-Only mode, data exists strictly in volatile memory.
 * - Plaintext passwords and derived keys are NEVER written to IndexedDB, localStorage, or console.
 */
export class DexieWorkspaceRepository implements WorkspaceRepository {
  private mode: StorageMode = 'local_storage';
  private db: PrivyDatabase;
  private vault: VaultManager;

  // In-memory volatile cache for session-only mode or unlocked sessions
  private memoryProjects: Project[] = [];
  private memoryConversations: Conversation[] = [];
  private memoryMessages: Message[] = [];
  private memoryNotes: ProjectNote[] = [];
  private memoryFiles: ProjectFile[] = [];
  private isInitialized = false;
  private lastMessageTimestamp = 0;

  constructor(customDb?: PrivyDatabase, customVault?: VaultManager) {
    this.db = customDb || privyDb;
    this.vault = customVault || vaultManager;
    this.memoryProjects = [PERSONAL_WORKSPACE, ...INITIAL_PROJECTS];
    this.memoryConversations = [...INITIAL_CONVERSATIONS];
    this.memoryMessages = [...INITIAL_MESSAGES];
    this.memoryNotes = [...INITIAL_NOTES];
    this.memoryFiles = [...INITIAL_FILES];

    // When the vault locks, wipe decrypted in-memory workspace cache immediately
    this.vault.subscribe((state) => {
      if (!state.isUnlocked && this.mode === 'encrypted') {
        this.clearMemoryCache();
      }
    });
  }

  setMode(mode: StorageMode): void {
    this.mode = mode;
  }

  getMode(): StorageMode {
    return this.mode;
  }

  getVaultManager(): VaultManager {
    return this.vault;
  }

  private clearMemoryCache(): void {
    this.memoryProjects = [PERSONAL_WORKSPACE];
    this.memoryConversations = [];
    this.memoryMessages = [];
    this.memoryNotes = [];
    this.memoryFiles = [];
  }

  async loadMemoryFromStorage(): Promise<void> {
    await this.init();
    try {
      if (this.vault.isUnlocked()) {
        const key = this.vault.getKey();
        const rawProjects = await this.db.projects.toArray();
        this.memoryProjects = await Promise.all(rawProjects.map((p) => this.decryptProject(p, key)));
        const rawConvs = await this.db.conversations.toArray();
        this.memoryConversations = await Promise.all(rawConvs.map((c) => this.decryptConversation(c, key)));
        const rawMsgs = await this.db.messages.toArray();
        this.memoryMessages = await Promise.all(rawMsgs.map((m) => this.decryptMessage(m, key)));
        const rawNotes = await this.db.notes.toArray();
        this.memoryNotes = await Promise.all(rawNotes.map((n) => this.decryptNote(n, key)));
        const rawFiles = await this.db.files.toArray();
        this.memoryFiles = await Promise.all(rawFiles.map((f) => this.decryptFile(f, key)));
      } else {
        this.memoryProjects = await this.db.projects.toArray();
        this.memoryConversations = await this.db.conversations.toArray();
        this.memoryMessages = await this.db.messages.toArray();
        this.memoryNotes = await this.db.notes.toArray();
        this.memoryFiles = await this.db.files.toArray();
      }
    } catch {
      // Best-effort cache load
    }
  }

  /**
   * Initializes database and guarantees Personal Workspace existence
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    if (this.mode === 'local_storage' || this.mode === 'encrypted') {
      try {
        await this.db.open();

        const count = await this.db.projects.count();
        if (count === 0) {
          // Initial seed
          await this.db.transaction('rw', [
            this.db.projects,
            this.db.conversations,
            this.db.messages,
            this.db.notes,
            this.db.files,
          ], async () => {
            await this.db.projects.put(PERSONAL_WORKSPACE);
            for (const p of INITIAL_PROJECTS) await this.db.projects.put(p);
            for (const c of INITIAL_CONVERSATIONS) await this.db.conversations.put(c);
            for (const m of INITIAL_MESSAGES) await this.db.messages.put(m);
            for (const n of INITIAL_NOTES) await this.db.notes.put(n);
            for (const f of INITIAL_FILES) await this.db.files.put(f);
          });
        } else {
          // Guarantee that the default personal workspace exists
          const personal = await this.db.projects.get(PERSONAL_WORKSPACE_ID);
          if (!personal) {
            await this.db.projects.put(PERSONAL_WORKSPACE);
          }
        }
      } catch (err: any) {
        if (err?.name === 'QuotaExceededError' || err instanceof Dexie.QuotaExceededError) {
          throw new StorageQuotaExceededError();
        }
        console.warn('Dexie initialization warning, falling back to memory cache:', err);
      }
    }

    this.isInitialized = true;
  }

  // --- Decryption Helpers ---

  private async decryptProject(p: Project, key: CryptoKey): Promise<Project> {
    if (p.isPersonalWorkspace) return { ...p };
    const name = isEncryptedString(p.name) ? await decryptString(p.name, key) : p.name;
    const description =
      p.description && isEncryptedString(p.description)
        ? await decryptString(p.description, key)
        : p.description;
    return { ...p, name, description };
  }

  private async decryptConversation(c: Conversation, key: CryptoKey): Promise<Conversation> {
    const title = isEncryptedString(c.title) ? await decryptString(c.title, key) : c.title;
    return { ...c, title };
  }

  private async decryptMessage(m: Message, key: CryptoKey): Promise<Message> {
    const content = isEncryptedString(m.content) ? await decryptString(m.content, key) : m.content;
    return { ...m, content };
  }

  private async decryptNote(n: ProjectNote, key: CryptoKey): Promise<ProjectNote> {
    const title = isEncryptedString(n.title) ? await decryptString(n.title, key) : n.title;
    const content = isEncryptedString(n.content) ? await decryptString(n.content, key) : n.content;
    return { ...n, title, content };
  }

  private async decryptFile(f: ProjectFile, key: CryptoKey): Promise<ProjectFile> {
    const name = isEncryptedString(f.name) ? await decryptString(f.name, key) : f.name;
    const dataUrl =
      f.dataUrl && isEncryptedString(f.dataUrl)
        ? await decryptString(f.dataUrl, key)
        : f.dataUrl;
    const textPreview =
      f.textPreview && isEncryptedString(f.textPreview)
        ? await decryptString(f.textPreview, key)
        : f.textPreview;
    return { ...f, name, dataUrl, textPreview, importStatus: 'encrypted' };
  }

  // --- Project Management ---

  async getProjects(): Promise<Project[]> {
    await this.init();

    if (this.mode === 'encrypted') {
      if (!this.vault.isUnlocked()) {
        throw new VaultLockedError();
      }
      const key = this.vault.getKey();
      const rawList = await this.db.projects.toArray();
      const decryptedList = await Promise.all(rawList.map((p) => this.decryptProject(p, key)));
      return decryptedList.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    if (this.mode === 'local_storage') {
      try {
        const list = await this.db.projects.toArray();
        return list.sort((a, b) => b.updatedAt - a.updatedAt);
      } catch {
        return [...this.memoryProjects].sort((a, b) => b.updatedAt - a.updatedAt);
      }
    }

    return [...this.memoryProjects].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getProject(id: string): Promise<Project | null> {
    await this.init();

    if (this.mode === 'encrypted') {
      if (!this.vault.isUnlocked()) {
        throw new VaultLockedError();
      }
      const key = this.vault.getKey();
      const found = await this.db.projects.get(id);
      return found ? this.decryptProject(found, key) : null;
    }

    if (this.mode === 'local_storage') {
      try {
        const found = await this.db.projects.get(id);
        return found || null;
      } catch {
        const found = this.memoryProjects.find((p) => p.id === id);
        return found ? { ...found } : null;
      }
    }

    const found = this.memoryProjects.find((p) => p.id === id);
    return found ? { ...found } : null;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    await this.init();
    const trimmedName = input.name?.trim();
    if (!trimmedName) {
      throw new Error('Project name cannot be empty');
    }
    const now = Date.now();
    const projectId = `proj-${now}-${Math.random().toString(36).substring(2, 7)}`;

    const newProject: Project = {
      id: projectId,
      name: trimmedName,
      description: input.description?.trim(),
      colorTag: input.colorTag,
      createdAt: now,
      updatedAt: now,
      isPersonalWorkspace: false,
    };

    const starterNote: ProjectNote = {
      id: `note-${now}-${Math.random().toString(36).substring(2, 7)}`,
      projectId,
      title: `${newProject.name} Research Notes`,
      content: `# ${newProject.name} Research Notes\n\n- Track references, findings, and analysis here.`,
      createdAt: now,
      updatedAt: now,
    };

    if (this.mode === 'encrypted') {
      const key = this.vault.getKey();
      const encName = await encryptString(newProject.name, key);
      const encDesc = newProject.description ? await encryptString(newProject.description, key) : undefined;
      const encNoteTitle = await encryptString(starterNote.title, key);
      const encNoteContent = await encryptString(starterNote.content, key);

      await this.db.transaction('rw', [this.db.projects, this.db.notes], async () => {
        await this.db.projects.add({
          ...newProject,
          name: encName,
          description: encDesc,
        });
        await this.db.notes.add({
          ...starterNote,
          title: encNoteTitle,
          content: encNoteContent,
        });
      });
    } else if (this.mode === 'local_storage') {
      try {
        await this.db.transaction('rw', [this.db.projects, this.db.notes], async () => {
          await this.db.projects.add(newProject);
          await this.db.notes.add(starterNote);
        });
      } catch (err: any) {
        if (err?.name === 'QuotaExceededError' || err instanceof Dexie.QuotaExceededError) {
          throw new StorageQuotaExceededError();
        }
        throw err;
      }
    }

    this.memoryProjects.unshift(newProject);
    this.memoryNotes.unshift(starterNote);
    return { ...newProject };
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
    await this.init();
    const now = Date.now();

    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) {
        throw new Error('Project name cannot be empty');
      }
      input = { ...input, name: trimmed };
    }

    if (id === PERSONAL_WORKSPACE_ID && input.name) {
      input = { ...input, name: PERSONAL_WORKSPACE.name };
    }

    if (this.mode === 'encrypted') {
      const key = this.vault.getKey();
      const existing = await this.db.projects.get(id);
      if (!existing) throw new Error(`Project with ID ${id} not found`);

      const decrypted = await this.decryptProject(existing, key);
      const updatedPlain: Project = {
        ...decrypted,
        ...input,
        updatedAt: now,
      };

      const encName = updatedPlain.isPersonalWorkspace
        ? updatedPlain.name
        : await encryptString(updatedPlain.name, key);
      const encDesc = updatedPlain.description
        ? await encryptString(updatedPlain.description, key)
        : undefined;

      await this.db.projects.update(id, {
        name: encName,
        description: encDesc,
        colorTag: updatedPlain.colorTag,
        updatedAt: now,
      });

      const idx = this.memoryProjects.findIndex((p) => p.id === id);
      if (idx !== -1) this.memoryProjects[idx] = updatedPlain;
      return { ...updatedPlain };
    }

    if (this.mode === 'local_storage') {
      try {
        const existing = await this.db.projects.get(id);
        if (!existing) throw new Error(`Project with ID ${id} not found`);

        const updated = {
          ...existing,
          ...input,
          updatedAt: now,
        };

        await this.db.projects.update(id, updated);
        const idx = this.memoryProjects.findIndex((p) => p.id === id);
        if (idx !== -1) this.memoryProjects[idx] = updated;
        return { ...updated };
      } catch (err: any) {
        if (err?.name === 'QuotaExceededError' || err instanceof Dexie.QuotaExceededError) {
          throw new StorageQuotaExceededError();
        }
        throw err;
      }
    }

    const idx = this.memoryProjects.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Project with ID ${id} not found`);

    const updated = {
      ...this.memoryProjects[idx],
      ...input,
      updatedAt: now,
    };
    this.memoryProjects[idx] = updated;
    return { ...updated };
  }

  async deleteProject(id: string): Promise<void> {
    await this.init();

    if (id === PERSONAL_WORKSPACE_ID) {
      throw new Error('The default Personal Workspace cannot be deleted.');
    }

    if (this.mode === 'local_storage' || this.mode === 'encrypted') {
      try {
        await this.db.transaction('rw', [
          this.db.projects,
          this.db.conversations,
          this.db.messages,
          this.db.notes,
          this.db.files,
        ], async () => {
          await this.db.projects.delete(id);

          const convs = await this.db.conversations.where('projectId').equals(id).toArray();
          for (const c of convs) {
            await this.db.messages.where('conversationId').equals(c.id).delete();
          }
          await this.db.conversations.where('projectId').equals(id).delete();
          await this.db.notes.where('projectId').equals(id).delete();
          await this.db.files.where('projectId').equals(id).delete();
        });
      } catch (err: any) {
        if (err?.name === 'QuotaExceededError' || err instanceof Dexie.QuotaExceededError) {
          throw new StorageQuotaExceededError();
        }
        throw err;
      }
    }

    this.memoryProjects = this.memoryProjects.filter((p) => p.id !== id);
    const convIdsToDelete = new Set(
      this.memoryConversations.filter((c) => c.projectId === id).map((c) => c.id)
    );
    this.memoryConversations = this.memoryConversations.filter((c) => c.projectId !== id);
    this.memoryMessages = this.memoryMessages.filter((m) => !convIdsToDelete.has(m.conversationId));
    this.memoryNotes = this.memoryNotes.filter((n) => n.projectId !== id);
    this.memoryFiles = this.memoryFiles.filter((f) => f.projectId !== id);
  }

  // --- Conversation CRUD ---

  async getConversations(projectId?: string): Promise<Conversation[]> {
    await this.init();

    if (this.mode === 'encrypted') {
      if (!this.vault.isUnlocked()) {
        throw new VaultLockedError();
      }
      const key = this.vault.getKey();
      const rawList = projectId
        ? await this.db.conversations.where('projectId').equals(projectId).toArray()
        : await this.db.conversations.toArray();
      const decryptedList = await Promise.all(rawList.map((c) => this.decryptConversation(c, key)));
      return decryptedList.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    if (this.mode === 'local_storage') {
      try {
        let list: Conversation[];
        if (projectId) {
          list = await this.db.conversations.where('projectId').equals(projectId).toArray();
        } else {
          list = await this.db.conversations.toArray();
        }
        return list.sort((a, b) => b.updatedAt - a.updatedAt);
      } catch {
        return this.getMemoryConversationsSorted(projectId);
      }
    }

    return this.getMemoryConversationsSorted(projectId);
  }

  private getMemoryConversationsSorted(projectId?: string): Conversation[] {
    let list = [...this.memoryConversations];
    if (projectId) {
      list = list.filter((c) => c.projectId === projectId);
    }
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    await this.init();

    if (this.mode === 'encrypted') {
      if (!this.vault.isUnlocked()) {
        throw new VaultLockedError();
      }
      const key = this.vault.getKey();
      const found = await this.db.conversations.get(id);
      return found ? this.decryptConversation(found, key) : null;
    }

    if (this.mode === 'local_storage') {
      try {
        const found = await this.db.conversations.get(id);
        return found || null;
      } catch {
        const found = this.memoryConversations.find((c) => c.id === id);
        return found ? { ...found } : null;
      }
    }

    const found = this.memoryConversations.find((c) => c.id === id);
    return found ? { ...found } : null;
  }

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    await this.init();
    const now = Date.now();

    let targetProjectId = PERSONAL_WORKSPACE_ID;
    if (input.projectId && input.projectId !== PERSONAL_WORKSPACE_ID) {
      if (this.mode === 'local_storage' || this.mode === 'encrypted') {
        const projectRecord = await this.db.projects.get(input.projectId);
        if (projectRecord) targetProjectId = input.projectId;
      } else {
        const inMemProject = this.memoryProjects.find((p) => p.id === input.projectId);
        if (inMemProject) targetProjectId = input.projectId;
      }
    }

    const newConv: Conversation = {
      id: `conv-${now}-${Math.random().toString(36).substring(2, 7)}`,
      projectId: targetProjectId,
      title: input.title.trim() || 'New Conversation',
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };

    if (this.mode === 'encrypted') {
      const key = this.vault.getKey();
      const encTitle = await encryptString(newConv.title, key);

      await this.db.transaction('rw', [this.db.conversations, this.db.projects], async () => {
        await this.db.conversations.add({
          ...newConv,
          title: encTitle,
        });
        await this.db.projects.update(targetProjectId, { updatedAt: now });
      });
    } else if (this.mode === 'local_storage') {
      try {
        await this.db.transaction('rw', [this.db.conversations, this.db.projects], async () => {
          await this.db.conversations.add(newConv);
          await this.db.projects.update(targetProjectId, { updatedAt: now });
        });
      } catch (err: any) {
        if (err?.name === 'QuotaExceededError' || err instanceof Dexie.QuotaExceededError) {
          throw new StorageQuotaExceededError();
        }
        throw err;
      }
    }

    this.memoryConversations.unshift(newConv);
    const pIdx = this.memoryProjects.findIndex((p) => p.id === targetProjectId);
    if (pIdx !== -1) {
      this.memoryProjects[pIdx].updatedAt = now;
    }

    return { ...newConv };
  }

  async updateConversation(id: string, input: UpdateConversationInput): Promise<Conversation> {
    await this.init();
    const now = Date.now();

    if (this.mode === 'encrypted') {
      const key = this.vault.getKey();
      const existing = await this.db.conversations.get(id);
      if (!existing) throw new Error(`Conversation with ID ${id} not found`);

      const decrypted = await this.decryptConversation(existing, key);
      const safeTitle = input.title !== undefined
        ? (input.title.trim() || decrypted.title || 'Untitled Conversation')
        : decrypted.title;

      const updatedPlain: Conversation = {
        ...decrypted,
        ...input,
        title: safeTitle,
        updatedAt: now,
      };

      const encTitle = await encryptString(updatedPlain.title, key);
      await this.db.conversations.update(id, {
        title: encTitle,
        messageCount: updatedPlain.messageCount,
        updatedAt: now,
      });

      const idx = this.memoryConversations.findIndex((c) => c.id === id);
      if (idx !== -1) this.memoryConversations[idx] = updatedPlain;
      return { ...updatedPlain };
    }

    if (this.mode === 'local_storage') {
      try {
        const existing = await this.db.conversations.get(id);
        if (!existing) throw new Error(`Conversation with ID ${id} not found`);

        const safeTitle = input.title !== undefined
          ? (input.title.trim() || existing.title || 'Untitled Conversation')
          : existing.title;

        const updated = {
          ...existing,
          ...input,
          title: safeTitle,
          updatedAt: now,
        };

        await this.db.conversations.update(id, updated);
        const idx = this.memoryConversations.findIndex((c) => c.id === id);
        if (idx !== -1) this.memoryConversations[idx] = updated;
        return { ...updated };
      } catch (err: any) {
        if (err?.name === 'QuotaExceededError' || err instanceof Dexie.QuotaExceededError) {
          throw new StorageQuotaExceededError();
        }
        throw err;
      }
    }

    const idx = this.memoryConversations.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Conversation with ID ${id} not found`);

    const safeTitle = input.title !== undefined
      ? (input.title.trim() || this.memoryConversations[idx].title || 'Untitled Conversation')
      : this.memoryConversations[idx].title;

    const updated = {
      ...this.memoryConversations[idx],
      ...input,
      title: safeTitle,
      updatedAt: now,
    };
    this.memoryConversations[idx] = updated;
    return { ...updated };
  }

  async deleteConversation(id: string): Promise<void> {
    await this.init();

    if (this.mode === 'local_storage' || this.mode === 'encrypted') {
      try {
        await this.db.transaction('rw', [this.db.conversations, this.db.messages], async () => {
          await this.db.messages.where('conversationId').equals(id).delete();
          await this.db.conversations.delete(id);
        });
      } catch (err: any) {
        if (err?.name === 'QuotaExceededError' || err instanceof Dexie.QuotaExceededError) {
          throw new StorageQuotaExceededError();
        }
        throw err;
      }
    }

    this.memoryConversations = this.memoryConversations.filter((c) => c.id !== id);
    this.memoryMessages = this.memoryMessages.filter((m) => m.conversationId !== id);
  }

  // --- Message Management ---

  async getMessages(conversationId: string): Promise<Message[]> {
    await this.init();

    if (this.mode === 'encrypted') {
      if (!this.vault.isUnlocked()) {
        throw new VaultLockedError();
      }
      const key = this.vault.getKey();
      const rawList = await this.db.messages.where('conversationId').equals(conversationId).toArray();
      const decryptedList = await Promise.all(rawList.map((m) => this.decryptMessage(m, key)));
      return decryptedList.sort((a, b) => a.createdAt - b.createdAt);
    }

    if (this.mode === 'local_storage') {
      try {
        const list = await this.db.messages.where('conversationId').equals(conversationId).toArray();
        return list.sort((a, b) => a.createdAt - b.createdAt);
      } catch {
        return this.memoryMessages
          .filter((m) => m.conversationId === conversationId)
          .sort((a, b) => a.createdAt - b.createdAt);
      }
    }

    return this.memoryMessages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async addMessage(message: Omit<Message, 'id' | 'createdAt'>): Promise<Message> {
    await this.init();
    const now = Date.now();
    const createdAt = now > this.lastMessageTimestamp ? now : this.lastMessageTimestamp + 1;
    this.lastMessageTimestamp = createdAt;

    const newMsg: Message = {
      ...message,
      id: `msg-${createdAt}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt,
    };

    if (this.mode === 'encrypted') {
      const key = this.vault.getKey();
      const encContent = await encryptString(newMsg.content, key);
      await this.db.messages.add({
        ...newMsg,
        content: encContent,
      });
    } else if (this.mode === 'local_storage') {
      try {
        await this.db.messages.add(newMsg);
      } catch (err: any) {
        if (err?.name === 'QuotaExceededError' || err instanceof Dexie.QuotaExceededError) {
          throw new StorageQuotaExceededError();
        }
        throw err;
      }
    }

    this.memoryMessages.push(newMsg);
    return { ...newMsg };
  }

  async deleteMessagesForConversation(conversationId: string): Promise<void> {
    await this.init();
    if (this.mode === 'local_storage' || this.mode === 'encrypted') {
      try {
        await this.db.messages.where('conversationId').equals(conversationId).delete();
      } catch {
        // Fallback
      }
    }
    this.memoryMessages = this.memoryMessages.filter((m) => m.conversationId !== conversationId);
  }

  // --- Notes Management ---

  async getNotes(projectId: string): Promise<ProjectNote[]> {
    await this.init();

    if (this.mode === 'encrypted') {
      if (!this.vault.isUnlocked()) {
        throw new VaultLockedError();
      }
      const key = this.vault.getKey();
      const rawList = await this.db.notes.where('projectId').equals(projectId).toArray();
      const decryptedList = await Promise.all(rawList.map((n) => this.decryptNote(n, key)));
      return decryptedList.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    if (this.mode === 'local_storage') {
      try {
        const list = await this.db.notes.where('projectId').equals(projectId).toArray();
        return list.sort((a, b) => b.updatedAt - a.updatedAt);
      } catch {
        return this.memoryNotes.filter((n) => n.projectId === projectId);
      }
    }

    return this.memoryNotes.filter((n) => n.projectId === projectId);
  }

  async saveNote(note: {
    id?: string;
    projectId: string;
    title: string;
    content: string;
  }): Promise<ProjectNote> {
    await this.init();
    const now = Date.now();

    const targetId =
      note.id || `note-${now}-${Math.random().toString(36).substring(2, 6)}`;
    const savedNote: ProjectNote = {
      id: targetId,
      projectId: note.projectId,
      title: note.title.trim(),
      content: note.content,
      createdAt: now,
      updatedAt: now,
    };

    if (this.mode === 'encrypted') {
      const key = this.vault.getKey();
      const encTitle = await encryptString(savedNote.title, key);
      const encContent = await encryptString(savedNote.content, key);
      await this.db.notes.put({
        ...savedNote,
        title: encTitle,
        content: encContent,
      });
    } else if (this.mode === 'local_storage') {
      try {
        await this.db.notes.put(savedNote);
      } catch (err: any) {
        if (err?.name === 'QuotaExceededError' || err instanceof Dexie.QuotaExceededError) {
          throw new StorageQuotaExceededError();
        }
        throw err;
      }
    }

    const idx = this.memoryNotes.findIndex((n) => n.id === targetId);
    if (idx !== -1) {
      this.memoryNotes[idx] = savedNote;
    } else {
      this.memoryNotes.push(savedNote);
    }

    return { ...savedNote };
  }

  async deleteNote(id: string): Promise<void> {
    await this.init();
    if (this.mode === 'local_storage' || this.mode === 'encrypted') {
      try {
        await this.db.notes.delete(id);
      } catch {
        // Fallback
      }
    }
    this.memoryNotes = this.memoryNotes.filter((n) => n.id !== id);
  }

  // --- Files Management ---

  async getFiles(projectId: string): Promise<ProjectFile[]> {
    await this.init();

    if (this.mode === 'encrypted') {
      if (!this.vault.isUnlocked()) {
        throw new VaultLockedError();
      }
      const key = this.vault.getKey();
      const rawList = await this.db.files.where('projectId').equals(projectId).toArray();
      const decryptedList = await Promise.all(rawList.map((f) => this.decryptFile(f, key)));
      return decryptedList.sort((a, b) => b.uploadedAt - a.uploadedAt);
    }

    if (this.mode === 'local_storage') {
      try {
        const list = await this.db.files.where('projectId').equals(projectId).toArray();
        return list.sort((a, b) => b.uploadedAt - a.uploadedAt);
      } catch {
        return this.memoryFiles.filter((f) => f.projectId === projectId);
      }
    }

    return this.memoryFiles.filter((f) => f.projectId === projectId);
  }

  async addFile(file: Omit<ProjectFile, 'id' | 'uploadedAt'> & { id?: string; uploadedAt?: number }): Promise<ProjectFile> {
    await this.init();
    const now = Date.now();

    const newFile: ProjectFile = {
      ...file,
      id: file.id || `file-${now}-${Math.random().toString(36).substring(2, 6)}`,
      uploadedAt: file.uploadedAt || now,
    };

    if (this.mode === 'encrypted') {
      const key = this.vault.getKey();
      const encName = await encryptString(newFile.name, key);
      const encDataUrl = newFile.dataUrl ? await encryptString(newFile.dataUrl, key) : undefined;
      const encTextPreview = newFile.textPreview ? await encryptString(newFile.textPreview, key) : undefined;
      await this.db.files.put({
        ...newFile,
        name: encName,
        dataUrl: encDataUrl,
        textPreview: encTextPreview,
      });
    } else if (this.mode === 'local_storage') {
      try {
        await this.db.files.put(newFile);
      } catch (err: any) {
        if (err?.name === 'QuotaExceededError' || err instanceof Dexie.QuotaExceededError) {
          throw new StorageQuotaExceededError();
        }
        throw err;
      }
    }

    const existingIdx = this.memoryFiles.findIndex((f) => f.id === newFile.id);
    if (existingIdx !== -1) {
      this.memoryFiles[existingIdx] = newFile;
    } else {
      this.memoryFiles.push(newFile);
    }
    return { ...newFile };
  }

  async deleteFile(id: string): Promise<void> {
    await this.init();
    if (this.mode === 'local_storage' || this.mode === 'encrypted') {
      try {
        await this.db.files.delete(id);
      } catch {
        // Fallback
      }
    }
    this.memoryFiles = this.memoryFiles.filter((f) => f.id !== id);
  }

  // --- Migration: Encrypt All Existing Plaintext Records ---

  async encryptAllPlaintextData(key: CryptoKey): Promise<void> {
    await this.init();

    // 1. Projects
    const projects = await this.db.projects.toArray();
    for (const p of projects) {
      if (!p.isPersonalWorkspace && !isEncryptedString(p.name)) {
        const encName = await encryptString(p.name, key);
        const encDesc = p.description ? await encryptString(p.description, key) : undefined;
        await this.db.projects.update(p.id, { name: encName, description: encDesc });
      }
    }

    // 2. Conversations
    const convs = await this.db.conversations.toArray();
    for (const c of convs) {
      if (!isEncryptedString(c.title)) {
        const encTitle = await encryptString(c.title, key);
        await this.db.conversations.update(c.id, { title: encTitle });
      }
    }

    // 3. Messages
    const msgs = await this.db.messages.toArray();
    for (const m of msgs) {
      if (!isEncryptedString(m.content)) {
        const encContent = await encryptString(m.content, key);
        await this.db.messages.update(m.id, { content: encContent });
      }
    }

    // 4. Notes
    const notes = await this.db.notes.toArray();
    for (const n of notes) {
      if (!isEncryptedString(n.title) || !isEncryptedString(n.content)) {
        const encTitle = isEncryptedString(n.title) ? n.title : await encryptString(n.title, key);
        const encContent = isEncryptedString(n.content) ? n.content : await encryptString(n.content, key);
        await this.db.notes.update(n.id, { title: encTitle, content: encContent });
      }
    }

    // 5. Files
    const files = await this.db.files.toArray();
    for (const f of files) {
      if (!isEncryptedString(f.name)) {
        const encName = await encryptString(f.name, key);
        const encDataUrl = f.dataUrl ? await encryptString(f.dataUrl, key) : undefined;
        await this.db.files.update(f.id, { name: encName, dataUrl: encDataUrl });
      }
    }
  }

  // --- Migration: Decrypt All Existing Encrypted Records ---

  async decryptAllEncryptedData(key: CryptoKey): Promise<void> {
    await this.init();

    // 1. Projects
    const projects = await this.db.projects.toArray();
    for (const p of projects) {
      if (!p.isPersonalWorkspace && isEncryptedString(p.name)) {
        const decName = await decryptString(p.name, key);
        const decDesc = p.description && isEncryptedString(p.description)
          ? await decryptString(p.description, key)
          : p.description;
        await this.db.projects.update(p.id, { name: decName, description: decDesc });
      }
    }

    // 2. Conversations
    const convs = await this.db.conversations.toArray();
    for (const c of convs) {
      if (isEncryptedString(c.title)) {
        const decTitle = await decryptString(c.title, key);
        await this.db.conversations.update(c.id, { title: decTitle });
      }
    }

    // 3. Messages
    const msgs = await this.db.messages.toArray();
    for (const m of msgs) {
      if (isEncryptedString(m.content)) {
        const decContent = await decryptString(m.content, key);
        await this.db.messages.update(m.id, { content: decContent });
      }
    }

    // 4. Notes
    const notes = await this.db.notes.toArray();
    for (const n of notes) {
      const decTitle = isEncryptedString(n.title) ? await decryptString(n.title, key) : n.title;
      const decContent = isEncryptedString(n.content) ? await decryptString(n.content, key) : n.content;
      await this.db.notes.update(n.id, { title: decTitle, content: decContent });
    }

    // 5. Files
    const files = await this.db.files.toArray();
    for (const f of files) {
      const decName = isEncryptedString(f.name) ? await decryptString(f.name, key) : f.name;
      const decDataUrl = f.dataUrl && isEncryptedString(f.dataUrl)
        ? await decryptString(f.dataUrl, key)
        : f.dataUrl;
      await this.db.files.update(f.id, { name: decName, dataUrl: decDataUrl });
    }
  }

  // --- Migration: Persist Current In-Memory Session Data to Storage ---

  async persistSessionDataToStorage(key?: CryptoKey): Promise<void> {
    await this.init();

    for (const p of this.memoryProjects) {
      if (!p.isPersonalWorkspace) {
        const name = key ? await encryptString(p.name, key) : p.name;
        const description = p.description ? (key ? await encryptString(p.description, key) : p.description) : undefined;
        await this.db.projects.put({ ...p, name, description });
      }
    }
    for (const c of this.memoryConversations) {
      const title = key ? await encryptString(c.title, key) : c.title;
      await this.db.conversations.put({ ...c, title });
    }
    for (const m of this.memoryMessages) {
      const content = key ? await encryptString(m.content, key) : m.content;
      await this.db.messages.put({ ...m, content });
    }
    for (const n of this.memoryNotes) {
      const title = key ? await encryptString(n.title, key) : n.title;
      const content = key ? await encryptString(n.content, key) : n.content;
      await this.db.notes.put({ ...n, title, content });
    }
    for (const f of this.memoryFiles) {
      const name = key ? await encryptString(f.name, key) : f.name;
      const dataUrl = f.dataUrl ? (key ? await encryptString(f.dataUrl, key) : f.dataUrl) : undefined;
      await this.db.files.put({ ...f, name, dataUrl });
    }
  }

  // --- Search ---

  async search(query: string): Promise<SearchResult[]> {
    await this.init();
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results: SearchResult[] = [];

    // In encrypted mode, only search when unlocked
    if (this.mode === 'encrypted' && !this.vault.isUnlocked()) {
      return [];
    }

    const projects = await this.getProjects();
    const conversations = await this.getConversations();

    for (const p of projects) {
      if (p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q))) {
        results.push({
          id: p.id,
          type: 'project',
          title: p.name,
          snippet: p.description || 'Project Workspace',
          projectId: p.id,
        });
      }
    }

    for (const c of conversations) {
      if (c.title.toLowerCase().includes(q)) {
        results.push({
          id: c.id,
          type: 'conversation',
          title: c.title,
          snippet: `Conversation in project`,
          projectId: c.projectId,
          conversationId: c.id,
        });
      }
    }

    return results.slice(0, 30);
  }

  // --- Clear & Maintenance ---

  async clearAll(): Promise<void> {
    try {
      await this.db.transaction('rw', [
        this.db.projects,
        this.db.conversations,
        this.db.messages,
        this.db.notes,
        this.db.files,
        this.db.settings,
      ], async () => {
        await this.db.projects.clear();
        await this.db.conversations.clear();
        await this.db.messages.clear();
        await this.db.notes.clear();
        await this.db.files.clear();
        await this.db.settings.clear();

        await this.db.projects.add(PERSONAL_WORKSPACE);
      });
    } catch (err) {
      console.error('Error clearing Dexie tables:', err);
    }

    this.vault.lockVault();
    this.clearMemoryCache();
  }

  async getStorageQuota(): Promise<StorageQuotaInfo> {
    return this.db.getStorageQuota();
  }
}

export const dexieWorkspaceRepository = new DexieWorkspaceRepository();
