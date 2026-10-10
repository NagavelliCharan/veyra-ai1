import type {
  Conversation,
  Message,
  Project,
  ProjectFile,
  ProjectNote,
  SearchResult,
} from '../../types';

export interface CreateProjectInput {
  name: string;
  description?: string;
  colorTag: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  colorTag?: string;
}

export interface CreateConversationInput {
  projectId: string;
  title: string;
}

export interface UpdateConversationInput {
  title?: string;
  messageCount?: number;
}

export interface WorkspaceRepository {
  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(id: string, input: UpdateProjectInput): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Conversations
  getConversations(projectId?: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  createConversation(input: CreateConversationInput): Promise<Conversation>;
  updateConversation(id: string, input: UpdateConversationInput): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;

  // Messages (not stored in localStorage, kept in IndexedDB or memory)
  getMessages(conversationId: string): Promise<Message[]>;
  addMessage(message: Omit<Message, 'id' | 'createdAt'>): Promise<Message>;
  deleteMessagesForConversation(conversationId: string): Promise<void>;

  // Notes
  getNotes(projectId: string): Promise<ProjectNote[]>;
  saveNote(note: { id?: string; projectId: string; title: string; content: string }): Promise<ProjectNote>;
  deleteNote(id: string): Promise<void>;

  // Files
  getFiles(projectId: string): Promise<ProjectFile[]>;
  addFile(file: Omit<ProjectFile, 'id' | 'uploadedAt'> & { id?: string; uploadedAt?: number }): Promise<ProjectFile>;
  deleteFile(id: string): Promise<void>;

  // Search
  search(query: string): Promise<SearchResult[]>;

  // Maintenance & Wipe
  clearAll(): Promise<void>;
}
