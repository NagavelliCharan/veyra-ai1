import Dexie, { type EntityTable } from 'dexie';
import type {
  Conversation,
  Message,
  Project,
  ProjectFile,
  ProjectNote,
  StorageQuotaInfo,
} from '../../types/index.ts';

export const PERSONAL_WORKSPACE_ID = 'personal-workspace';

export const PERSONAL_WORKSPACE: Project = {
  id: PERSONAL_WORKSPACE_ID,
  name: 'Personal Workspace',
  description: 'Default personal workspace for direct conversations and independent research notes.',
  colorTag: '#6366f1',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  isPersonalWorkspace: true,
};

export interface SettingRecord {
  id: string;
  value: string;
  updatedAt: number;
}

/**
 * PrivyDatabase is the primary IndexedDB data store managed by Dexie.
 *
 * Privacy Guarantees:
 * 1. ZERO automatic upload or telemetry.
 * 2. Message and note content are strictly held in IndexedDB (never in localStorage).
 * 3. Never prints message contents or notes to browser logs.
 */
export class PrivyDatabase extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  conversations!: EntityTable<Conversation, 'id'>;
  messages!: EntityTable<Message, 'id'>;
  notes!: EntityTable<ProjectNote, 'id'>;
  files!: EntityTable<ProjectFile, 'id'>;
  settings!: EntityTable<SettingRecord, 'id'>;

  constructor(databaseName = 'PrivyAIDatabase') {
    super(databaseName);

    // Schema Version 1 (Initial release)
    this.version(1).stores({
      projects: 'id, name, createdAt, updatedAt',
      conversations: 'id, projectId, title, createdAt, updatedAt',
      messages: 'id, conversationId, projectId, role, createdAt',
      notes: 'id, projectId, title, createdAt, updatedAt',
      files: 'id, projectId, name, size, type, uploadedAt',
      settings: 'id, updatedAt',
    });

    // Schema Version 2: Personal Workspace constraint & indexing
    // Safe Migration: Guarantees every conversation belongs to a valid project or the personal workspace
    this.version(2)
      .stores({
        projects: 'id, name, createdAt, updatedAt, isPersonalWorkspace',
        conversations: 'id, projectId, title, createdAt, updatedAt',
        messages: 'id, conversationId, projectId, role, createdAt',
        notes: 'id, projectId, title, createdAt, updatedAt',
        files: 'id, projectId, name, size, type, uploadedAt',
        settings: 'id, updatedAt',
      })
      .upgrade(async (tx) => {
        const existingProjects = await tx.table('projects').toArray();
        const projectIds = new Set(existingProjects.map((p: any) => p.id));

        // 1. Ensure default personal workspace exists
        const hasPersonal = await tx.table('projects').get(PERSONAL_WORKSPACE_ID);
        if (!hasPersonal) {
          await tx.table('projects').put(PERSONAL_WORKSPACE);
          projectIds.add(PERSONAL_WORKSPACE_ID);
        }

        // 2. Re-assign orphaned conversations to the personal workspace
        await tx
          .table('conversations')
          .toCollection()
          .modify((conv: any) => {
            if (!conv.projectId || !projectIds.has(conv.projectId)) {
              conv.projectId = PERSONAL_WORKSPACE_ID;
            }
          });
      });
  }

  /**
   * Evaluates browser storage availability, quota, and persistence state
   */
  async getStorageQuota(): Promise<StorageQuotaInfo> {
    const isAvailable = typeof window !== 'undefined' && 'indexedDB' in window;

    if (!isAvailable || typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
      return {
        usageBytes: 0,
        quotaBytes: 0,
        percentageUsed: 0,
        isAvailable,
        isPersisted: false,
      };
    }

    try {
      const estimate = await navigator.storage.estimate();
      const isPersisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;

      const usageBytes = estimate.usage || 0;
      const quotaBytes = estimate.quota || 0;
      const percentageUsed = quotaBytes > 0 ? (usageBytes / quotaBytes) * 100 : 0;

      return {
        usageBytes,
        quotaBytes,
        percentageUsed: Math.min(100, Math.round(percentageUsed * 100) / 100),
        isAvailable: true,
        isPersisted,
      };
    } catch {
      return {
        usageBytes: 0,
        quotaBytes: 0,
        percentageUsed: 0,
        isAvailable: true,
        isPersisted: false,
      };
    }
  }

  /**
   * Request persistent storage to prevent unexpected browser eviction
   */
  async requestPersistentStorage(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        return await navigator.storage.persist();
      } catch {
        return false;
      }
    }
    return false;
  }
}

// Global database instance
export const privyDb = new PrivyDatabase();
