export type StorageMode = 'session_only' | 'local_storage' | 'encrypted';

export interface Project {
  id: string;
  name: string;
  description?: string;
  colorTag: string; // Hex color e.g. '#4f46e5'
  createdAt: number;
  updatedAt: number;
  isPersonalWorkspace?: boolean; // True for default personal workspace
}

export interface Conversation {
  id: string;
  projectId: string; // Every conversation MUST belong to a project or personal workspace
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  conversationId: string;
  projectId: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  metadata?: {
    modelName?: string;
    tokenCount?: number;
    isSimulated?: boolean;
    referencedFiles?: string[];
  };
}

export interface ProjectNote {
  id: string;
  projectId: string;
  title: string;
  content: string; // Markdown text
  createdAt: number;
  updatedAt: number;
}

export interface ProjectFolder {
  id: string;
  projectId: string;
  name: string;
  parentId: string | null;
  relativePath: string;
  createdAt: number;
  updatedAt: number;
  isFolder: true;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  folderId?: string | null;
  relativePath?: string;
  size: number;
  type: string;
  dataUrl?: string; // Data URL for client-side download/preview
  storageFilename?: string;
  storagePath?: string;
  uploadedAt: number;
  textPreview?: string; // Extracted plain text snippet for text/markdown preview
  importStatus?: 'stored' | 'encrypted';
  isFolder?: false;
}

export interface StorageQuotaInfo {
  usageBytes: number;
  quotaBytes: number;
  percentageUsed: number;
  isAvailable: boolean;
  isPersisted: boolean;
}

export interface PrivacyConfig {
  storageMode: StorageMode;
  autoClearOnClose: boolean;
  maskSensitiveData: boolean;
}

export interface SearchResult {
  id: string;
  type: 'project' | 'conversation' | 'message' | 'note' | 'file';
  title: string;
  snippet: string;
  projectId: string;
  conversationId?: string;
}
