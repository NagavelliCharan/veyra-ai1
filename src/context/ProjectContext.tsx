import React, { createContext, useContext, useEffect, useState } from 'react';
import { mockAIService } from '../services/ai/mockAiService';
import { groqClient } from '../services/ai/groqClient';
import { dexieWorkspaceRepository as workspaceRepository } from '../services/storage/dexieWorkspaceRepository';
import type {
  Conversation,
  Message,
  Project,
  ProjectFile,
  ProjectFolder,
  ProjectNote,
} from '../types';
import { generateConversationTitle } from '../utils/titleGenerator';
import { formatFileSize, readLocalFile, validateFile } from '../utils/fileValidators';
import { fileApiService } from '../services/api/fileApiService';
import { usePrivacy } from './PrivacyContext';
import { useToast } from './ToastContext';

interface ProjectContextType {
  projects: Project[];
  conversations: Conversation[];
  messages: Message[];
  notes: ProjectNote[];
  files: ProjectFile[];
  folders: ProjectFolder[];
  currentFolderId: string | null;
  setCurrentFolderId: (id: string | null) => void;
  currentBreadcrumbs: { id: string | null; name: string }[];
  activeProjectId: string;
  activeConversationId: string | null;
  activeTab: 'chat' | 'notes' | 'files';
  isGeneratingResponse: boolean;
  streamingMessageId: string | null;
  streamingContent: string;
  isLoading: boolean;
  isConsentModalOpen: boolean;
  setIsConsentModalOpen: (open: boolean) => void;
  handleConsentSuccess: () => Promise<void>;
  setActiveProjectId: (id: string) => void;
  setActiveConversationId: (id: string | null) => void;
  setActiveTab: (tab: 'chat' | 'notes' | 'files') => void;
  startNewChat: (projectId?: string) => Promise<string>;
  createProject: (name: string, description?: string, colorTag?: string) => Promise<string>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  createConversation: (projectId: string, title?: string) => Promise<string>;
  updateConversation: (id: string, updates: Partial<Conversation>) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  createNote: (projectId: string, title?: string, content?: string) => Promise<ProjectNote>;
  updateNote: (idOrProjectId: string, title: string, content: string) => Promise<ProjectNote | null>;
  deleteNote: (id: string) => Promise<void>;
  activeNoteId: string | null;
  setActiveNoteId: (id: string | null) => void;
  activeNote: ProjectNote | undefined;
  uploadFile: (
    projectId: string,
    file: File,
    folderId?: string | null,
    relPath?: string
  ) => Promise<ProjectFile | null>;
  deleteFile: (id: string) => Promise<void>;
  downloadFile: (fileId: string, fileName: string) => Promise<void>;
  attachedFiles: ProjectFile[];
  attachFileToChat: (file: ProjectFile) => void;
  removeAttachedFile: (fileId: string) => void;
  clearAttachedFiles: () => void;
  storeFileInChat: (file: ProjectFile, userComment?: string) => Promise<void>;
  storeFolderInChat: (folder: ProjectFolder) => Promise<void>;
  createFolder: (
    projectId: string,
    name: string,
    parentId?: string | null
  ) => Promise<ProjectFolder | null>;
  deleteFolder: (id: string) => Promise<void>;
  activeProject: Project | undefined;
  activeConversation: Conversation | undefined;
  currentProjectNotes: ProjectNote[];
  currentProjectFiles: ProjectFile[];
  refreshData: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { storageMode, refreshStats, isVaultLocked, aiEngine, hasGeminiConsent } = usePrivacy();
  const { showToast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentBreadcrumbs, setCurrentBreadcrumbs] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: 'Root' },
  ]);

  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'notes' | 'files'>('chat');
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState<boolean>(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');

  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const [attachedFiles, setAttachedFiles] = useState<ProjectFile[]>([]);

  const attachFileToChat = (file: ProjectFile) => {
    setAttachedFiles((prev) => {
      if (prev.some((f) => f.id === file.id)) return prev;
      return [...prev, file];
    });
    showToast(`Attached "${file.name}" to conversation`, 'info');
  };

  const removeAttachedFile = (fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const clearAttachedFiles = () => {
    setAttachedFiles([]);
  };

  const storeFileInChat = async (file: ProjectFile, userComment?: string) => {
    const targetProjId = activeProjectId || projects[0]?.id || 'personal-workspace';
    let convId = activeConversationId;
    if (!convId || !conversations.some((c) => c.id === convId && c.projectId === targetProjId)) {
      convId = await createConversation(targetProjId, `File: ${file.name}`);
      setActiveConversationId(convId);
    }

    // Attach file to prompt composer so user can immediately ask AI questions
    attachFileToChat(file);

    const messageText =
      userComment ||
      `📎 Stored and attached document: **${file.name}** (${formatFileSize(file.size)})`;

    // 1. Add User Message storing the file
    const userMsg = await workspaceRepository.addMessage({
      conversationId: convId,
      projectId: targetProjId,
      role: 'user',
      content: messageText,
      metadata: {
        referencedFiles: [file.name],
        tokenCount: Math.ceil(messageText.length / 4),
      },
    });

    // 2. Add Assistant Message confirming storage and readiness to analyze
    const assistantSnippet = file.textPreview
      ? `\n\nPreviewing content:\n> "${file.textPreview.slice(0, 200).replace(/\n/g, ' ')}..."\n\nWhat would you like me to analyze or summarize from this file?`
      : '\n\nThis file is now stored in this chat conversation. What would you like to know about it?';

    const aiMsg = await workspaceRepository.addMessage({
      conversationId: convId,
      projectId: targetProjId,
      role: 'assistant',
      content: `✅ Document **${file.name}** (${formatFileSize(file.size)}) has been stored in this conversation.${assistantSnippet}`,
      metadata: {
        modelName: aiEngine !== 'mock' ? 'Veyra AI (Gemini)' : 'Veyra Local Mock',
        isSimulated: aiEngine === 'mock',
        referencedFiles: [file.name],
      },
    });

    setMessages((prev) => {
      const filtered = prev.filter((m) => m.conversationId === convId);
      const hasUser = filtered.some((m) => m.id === userMsg.id);
      const hasAi = filtered.some((m) => m.id === aiMsg.id);
      const nextList = [...filtered];
      if (!hasUser) nextList.push(userMsg);
      if (!hasAi) nextList.push(aiMsg);
      return nextList;
    });

    const updatedCount = (conversations.find((c) => c.id === convId)?.messageCount || 0) + 2;
    await updateConversation(convId, { messageCount: updatedCount });

    setActiveTab('chat');
    showToast(`Stored "${file.name}" in Chatbot`, 'success');
  };

  const storeFolderInChat = async (folder: ProjectFolder) => {
    const targetProjId = activeProjectId || projects[0]?.id || 'personal-workspace';
    try {
      showToast(`Storing files from "${folder.name}" into Chatbot...`, 'info');
      // Fetch directory contents for this folder
      const dir = await fileApiService.getDirectory(targetProjId, folder.id);
      let folderFiles = (dir.files || []).filter((f) => f.projectId === targetProjId);

      // Recursively include subfolders if any
      if (dir.folders && dir.folders.length > 0) {
        for (const sub of dir.folders) {
          try {
            const subDir = await fileApiService.getDirectory(targetProjId, sub.id);
            if (subDir.files) {
              folderFiles = [
                ...folderFiles,
                ...subDir.files.filter((f) => f.projectId === targetProjId),
              ];
            }
          } catch {
            // best effort
          }
        }
      }

      if (folderFiles.length === 0) {
        showToast(`Folder "${folder.name}" is currently empty`, 'info');
        return;
      }

      for (const f of folderFiles) {
        await storeFileInChat(f);
      }
      showToast(
        `Stored ${folderFiles.length} file(s) from "${folder.name}" in Chatbot`,
        'success'
      );
    } catch (err: any) {
      console.error('Error storing folder in chat:', err);
      showToast('Failed to store folder files in chat', 'error');
    }
  };

  // Sync mode with repository
  useEffect(() => {
    workspaceRepository.setMode(storageMode);
    if (storageMode === 'encrypted' && isVaultLocked) {
      setProjects([]);
      setConversations([]);
      setMessages([]);
      setNotes([]);
      setFiles([]);
      setFolders([]);
      setIsLoading(false);
      return;
    }
    loadAllData();
  }, [storageMode, isVaultLocked]);

  const loadAllData = async () => {
    if (storageMode === 'encrypted' && isVaultLocked) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      await workspaceRepository.init();
      const pList = await workspaceRepository.getProjects();
      const cList = await workspaceRepository.getConversations();

      setProjects(pList);
      setConversations(cList);

      // Default to first project if none active
      if (pList.length > 0) {
        const targetProjId = activeProjectId && pList.some((p) => p.id === activeProjectId)
          ? activeProjectId
          : pList[0].id;
        setActiveProjectId(targetProjId);

        // Load project notes and persistent files & folders
        const nList = await workspaceRepository.getNotes(targetProjId);
        setNotes(nList);

        try {
          const dir = await fileApiService.getDirectory(targetProjId, currentFolderId);
          setFiles(dir.files || []);
          setFolders(dir.folders || []);
          setCurrentBreadcrumbs(dir.breadcrumbs || [{ id: null, name: 'Root' }]);
        } catch {
          const fList = await workspaceRepository.getFiles(targetProjId);
          setFiles(fList);
          setFolders([]);
          setCurrentBreadcrumbs([{ id: null, name: 'Root' }]);
        }

        // Find active conversation
        const projConvs = cList.filter((c) => c.projectId === targetProjId);
        if (projConvs.length > 0) {
          const targetConvId = activeConversationId && projConvs.some((c) => c.id === activeConversationId)
            ? activeConversationId
            : projConvs[0].id;
          setActiveConversationId(targetConvId);

          const mList = await workspaceRepository.getMessages(targetConvId);
          setMessages(mList);
        } else {
          setActiveConversationId(null);
          setMessages([]);
        }
      } else {
        setActiveProjectId('');
        setActiveConversationId(null);
        setMessages([]);
        setNotes([]);
        setFiles([]);
        setFolders([]);
      }
      refreshStats();
    } catch (err) {
      console.error('Failed to load workspace data from repository:', err);
      showToast('Error loading workspace data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Reload messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    const fetchMessages = async () => {
      try {
        const mList = await workspaceRepository.getMessages(activeConversationId);
        setMessages(mList);
      } catch (err) {
        console.error('Failed to fetch messages:', err);
      }
    };
    fetchMessages();
  }, [activeConversationId]);

  // Reset folder navigation & attachments when switching active project
  useEffect(() => {
    setCurrentFolderId(null);
    setCurrentBreadcrumbs([{ id: null, name: 'Root' }]);
    setAttachedFiles([]);
    setFiles([]);
    setFolders([]);
    if (!activeProjectId) {
      setNotes([]);
    }
  }, [activeProjectId]);

  // Reload notes & persistent files/folders when active project or currentFolderId changes
  useEffect(() => {
    if (!activeProjectId) {
      setNotes([]);
      setFiles([]);
      setFolders([]);
      setCurrentBreadcrumbs([{ id: null, name: 'Root' }]);
      return;
    }
    const fetchProjectArtifacts = async () => {
      try {
        const nList = await workspaceRepository.getNotes(activeProjectId);
        setNotes(nList);

        // Fetch directory contents from backend
        try {
          const dir = await fileApiService.getDirectory(activeProjectId, currentFolderId);
          const scopedFiles = (dir.files || []).filter((f) => f.projectId === activeProjectId);
          const scopedFolders = (dir.folders || []).filter((f) => f.projectId === activeProjectId);
          setFiles(scopedFiles);
          setFolders(scopedFolders);
          setCurrentBreadcrumbs(dir.breadcrumbs || [{ id: null, name: 'Root' }]);
        } catch {
          const fList = await workspaceRepository.getFiles(activeProjectId);
          setFiles(fList.filter((f) => f.projectId === activeProjectId));
          setFolders([]);
          setCurrentBreadcrumbs([{ id: null, name: 'Root' }]);
        }
      } catch (err) {
        console.error('Failed to fetch notes and files:', err);
      }
    };
    fetchProjectArtifacts();
  }, [activeProjectId, currentFolderId]);

  const startNewChat = async (targetProjectId?: string): Promise<string> => {
    const projId = targetProjectId || activeProjectId || projects[0]?.id;
    if (!projId) {
      showToast('Please create a project folder first', 'info');
      return '';
    }

    const newChatId = await createConversation(projId, 'New Chat');
    setActiveProjectId(projId);
    setActiveConversationId(newChatId);
    setActiveTab('chat');
    showToast('New chat started', 'info');
    return newChatId;
  };

  const createProject = async (
    name: string,
    description: string = '',
    colorTag: string = '#4f46e5'
  ): Promise<string> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast('Project name cannot be empty', 'error');
      throw new Error('Project name cannot be empty');
    }
    try {
      const created = await workspaceRepository.createProject({
        name: trimmedName,
        description: description?.trim(),
        colorTag,
      });

      setProjects((prev) => [created, ...prev]);
      setActiveProjectId(created.id);

      // Create initial conversation in this project
      const initialConv = await workspaceRepository.createConversation({
        projectId: created.id,
        title: 'General Discussion',
      });
      setConversations((prev) => [initialConv, ...prev]);
      setActiveConversationId(initialConv.id);
      setMessages([]);
      setActiveTab('chat');

      // Fetch newly created companion note
      const pNotes = await workspaceRepository.getNotes(created.id);
      setNotes(pNotes);
      setFiles([]);

      showToast(`Created project "${created.name}"`, 'success');
      refreshStats();
      return created.id;
    } catch (err: any) {
      console.error('Error creating project:', err);
      showToast(err?.message || 'Failed to create project', 'error');
      throw err;
    }
  };

  const updateProject = async (id: string, updates: Partial<Project>) => {
    try {
      if (updates.name !== undefined && !updates.name.trim()) {
        showToast('Project name cannot be empty', 'error');
        return;
      }
      const sanitizedUpdates = {
        ...updates,
        ...(updates.name ? { name: updates.name.trim() } : {}),
        ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
      };
      const updated = await workspaceRepository.updateProject(id, sanitizedUpdates);
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
      showToast(`Updated project "${updated.name}"`, 'success');
      refreshStats();
    } catch (err: any) {
      console.error('Error updating project:', err);
      showToast(err?.message || 'Failed to update project', 'error');
    }
  };

  const deleteProject = async (id: string) => {
    try {
      const targetProj = projects.find((p) => p.id === id);
      if (targetProj?.isPersonalWorkspace) {
        showToast('The default Personal Workspace cannot be deleted', 'error');
        return;
      }
      await workspaceRepository.deleteProject(id);

      const remainingProjects = projects.filter((p) => p.id !== id);
      setProjects(remainingProjects);
      setConversations((prev) => prev.filter((c) => c.projectId !== id));
      setMessages((prev) => prev.filter((m) => m.projectId !== id));
      setNotes((prev) => prev.filter((n) => n.projectId !== id));
      setFiles((prev) => prev.filter((f) => f.projectId !== id));

      if (activeProjectId === id) {
        if (remainingProjects.length > 0) {
          const nextProj = remainingProjects[0];
          setActiveProjectId(nextProj.id);
          const nextConvs = conversations.filter((c) => c.projectId === nextProj.id);
          const nextConvId = nextConvs[0]?.id || null;
          setActiveConversationId(nextConvId);
          if (nextConvId) {
            const nextMsgs = await workspaceRepository.getMessages(nextConvId);
            setMessages(nextMsgs);
          } else {
            setMessages([]);
          }
          const nextNotes = await workspaceRepository.getNotes(nextProj.id);
          const nextFiles = await workspaceRepository.getFiles(nextProj.id);
          setNotes(nextNotes);
          setFiles(nextFiles);
        } else {
          setActiveProjectId('');
          setActiveConversationId(null);
          setMessages([]);
          setNotes([]);
          setFiles([]);
        }
      }

      showToast(`Deleted project "${targetProj?.name || ''}"`, 'info');
      refreshStats();
    } catch (err: any) {
      console.error('Error deleting project:', err);
      showToast(err?.message || 'Failed to delete project', 'error');
    }
  };

  const createConversation = async (projectId: string, title?: string): Promise<string> => {
    try {
      const safeTitle = title?.trim() || 'New Conversation';
      const created = await workspaceRepository.createConversation({
        projectId,
        title: safeTitle,
      });

      setConversations((prev) => [created, ...prev]);
      setActiveProjectId(projectId);
      setActiveConversationId(created.id);
      setMessages([]);
      setActiveTab('chat');
      refreshStats();
      return created.id;
    } catch (err: any) {
      console.error('Error creating conversation:', err);
      showToast(err?.message || 'Failed to create conversation', 'error');
      throw err;
    }
  };

  const updateConversation = async (id: string, updates: Partial<Conversation>) => {
    try {
      const existing = conversations.find((c) => c.id === id);
      const safeTitle = updates.title !== undefined
        ? (updates.title.trim() || existing?.title || 'Untitled Conversation')
        : undefined;

      const sanitizedUpdates = {
        ...updates,
        ...(safeTitle !== undefined ? { title: safeTitle } : {}),
      };

      const updated = await workspaceRepository.updateConversation(id, sanitizedUpdates);
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
      refreshStats();
    } catch (err: any) {
      console.error('Error updating conversation:', err);
      showToast(err?.message || 'Failed to update conversation', 'error');
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      const targetConv = conversations.find((c) => c.id === id);
      await workspaceRepository.deleteConversation(id);

      const remainingConvs = conversations.filter((c) => c.id !== id);
      setConversations(remainingConvs);
      setMessages((prev) => prev.filter((m) => m.conversationId !== id));

      if (activeConversationId === id) {
        const targetProjectId = targetConv ? targetConv.projectId : activeProjectId;
        const projConvs = remainingConvs.filter((c) => c.projectId === targetProjectId);
        if (projConvs.length > 0) {
          setActiveConversationId(projConvs[0].id);
          const nextMsgs = await workspaceRepository.getMessages(projConvs[0].id);
          setMessages(nextMsgs);
        } else {
          setActiveConversationId(null);
          setMessages([]);
        }
      }

      showToast(`Deleted "${targetConv?.title || 'conversation'}"`, 'info');
      refreshStats();
    } catch (err: any) {
      console.error('Error deleting conversation:', err);
      showToast(err?.message || 'Failed to delete conversation', 'error');
    }
  };

  const handleConsentSuccess = async () => {
    if (pendingPrompt) {
      const prompt = pendingPrompt;
      setPendingPrompt(null);
      await sendMessage(prompt);
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || !activeProjectId) return;

    if (aiEngine !== 'mock' && !hasGeminiConsent) {
      setPendingPrompt(content);
      setIsConsentModalOpen(true);
      return;
    }

    let convId = activeConversationId;
    let isFirstMessageInConv = false;

    // If no conversation currently selected, create one
    if (!convId) {
      const derivedTitle = generateConversationTitle(content);
      convId = await createConversation(activeProjectId, derivedTitle);
      isFirstMessageInConv = true;
    } else {
      // Check if this conversation currently has 0 user messages or default title
      const currentConv = conversations.find((c) => c.id === convId);
      const convMessages = messages.filter((m) => m.conversationId === convId);
      if (
        convMessages.length === 0 ||
        currentConv?.title === 'New Chat' ||
        currentConv?.title === 'New Conversation'
      ) {
        isFirstMessageInConv = true;
      }
    }

    const currentAttachments = [...attachedFiles];
    const referencedNames = currentAttachments.map((f) => f.name);

    // 1. Add User Message via repository
    const userMsg = await workspaceRepository.addMessage({
      conversationId: convId,
      projectId: activeProjectId,
      role: 'user',
      content: content.trim(),
      metadata: {
        tokenCount: Math.ceil(content.length / 4),
        referencedFiles: referencedNames.length > 0 ? referencedNames : undefined,
      },
    });

    setMessages((prev) => [...prev, userMsg]);
    clearAttachedFiles();

    // Automatically generate concise title from first user message if applicable
    if (isFirstMessageInConv) {
      const newTitle = generateConversationTitle(content);
      await updateConversation(convId, { title: newTitle });
    }

    // Update conversation message count & timestamp
    const updatedCount = (conversations.find((c) => c.id === convId)?.messageCount || 0) + 1;
    await updateConversation(convId, {
      messageCount: updatedCount,
    });

    // 2. Generate Assistant Response (Groq Cloud or Local Mock)
    setIsGeneratingResponse(true);
    const tempAiId = `msg-ai-${Date.now()}`;
    setStreamingMessageId(tempAiId);
    setStreamingContent('');

    // Enrich prompt with attached document content if user attached files
    let promptPayload = content;
    if (currentAttachments.length > 0) {
      const docSections = currentAttachments
        .map((f) => {
          if (f.textPreview) {
            return `[Attached Document: "${f.name}"]\n${f.textPreview.slice(0, 32000)}\n[End of "${f.name}"]`;
          }
          return `[Attached Document: "${f.name}" (${f.size} bytes)]`;
        })
        .join('\n\n');
      promptPayload = `Context from attached workspace files:\n${docSections}\n\nUser Question:\n${content}\n\nPlease answer the user question thoroughly and accurately based on both the attached documents and your broad general knowledge.`;
    }

    if (aiEngine !== 'mock') {
      try {
        // Collect minimal recent conversation context (max 8 messages in the active conversation)
        // Strict privacy guarantee: never includes project notes, files, or other conversations
        const contextHistory = messages
          .filter((m) => m.conversationId === convId)
          .slice(-8)
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

        const result = await groqClient.sendMessage(promptPayload, contextHistory, true);

        // Smooth adaptive simulated typing for received AI response
        const words = result.reply.split(/(\s+)/);
        let accumulated = '';
        const step = words.length > 600 ? 8 : (words.length > 300 ? 5 : 3);
        for (let i = 0; i < words.length; i++) {
          accumulated += words[i];
          setStreamingContent(accumulated);
          if (i % step === 0) {
            await new Promise((r) => setTimeout(r, 6));
          }
        }

        const aiMsg = await workspaceRepository.addMessage({
          conversationId: convId!,
          projectId: activeProjectId,
          role: 'assistant',
          content: result.reply,
          metadata: {
            modelName: result.model,
            tokenCount: result.usage?.totalTokens || Math.ceil(result.reply.length / 4),
            isSimulated: false,
          },
        });

        setMessages((prev) => [...prev, aiMsg]);
        setIsGeneratingResponse(false);
        setStreamingMessageId(null);
        setStreamingContent('');

        await updateConversation(convId!, {
          messageCount: updatedCount + 1,
        });
      } catch (err: any) {
        setIsGeneratingResponse(false);
        setStreamingMessageId(null);
        setStreamingContent('');

        const errMsg = err?.message || 'Error communicating with Cloud AI API.';
        showToast(errMsg, 'error');

        const errorAiMsg = await workspaceRepository.addMessage({
          conversationId: convId!,
          projectId: activeProjectId,
          role: 'assistant',
          content: `⚠️ **AI Service Notice**\n\n${errMsg}\n\n*Tip: Ensure your backend server is running on port 3001 (\`npm run server\`) and \`GEMINI_API_KEY\` is configured in your \`.env\` file. You can also switch to offline Local Mock mode using the header badge.*`,
          metadata: {
            modelName: 'AI Gateway (Notice)',
            tokenCount: 20,
            isSimulated: true,
          },
        });
        setMessages((prev) => [...prev, errorAiMsg]);
      }
    } else {
      // Local Mock mode
      try {
        await mockAIService.streamResponse(
          content,
          (_token, accumulated) => {
            setStreamingContent(accumulated);
          },
          async (finalResponse) => {
            const aiMsg = await workspaceRepository.addMessage({
              conversationId: convId!,
              projectId: activeProjectId,
              role: 'assistant',
              content: finalResponse.content,
              metadata: {
                modelName: finalResponse.modelName,
                tokenCount: finalResponse.tokenCount,
                isSimulated: true,
              },
            });

            setMessages((prev) => [...prev, aiMsg]);
            setIsGeneratingResponse(false);
            setStreamingMessageId(null);
            setStreamingContent('');

            await updateConversation(convId!, {
              messageCount: updatedCount + 1,
            });
          }
        );
      } catch (err) {
        console.error('Error during AI response simulation:', err);
        setIsGeneratingResponse(false);
        setStreamingMessageId(null);
        showToast('Error generating AI response', 'error');
      }
    }
  };

  const createNote = async (projectId: string, title = 'Untitled Note', content = ''): Promise<ProjectNote> => {
    try {
      const saved = await workspaceRepository.saveNote({
        projectId,
        title: title.trim() || 'Untitled Note',
        content,
      });
      setNotes((prev) => [saved, ...prev]);
      setActiveNoteId(saved.id);
      showToast(`Created note "${saved.title}"`, 'success');
      refreshStats();
      return saved;
    } catch (err) {
      console.error('Error creating note:', err);
      showToast('Failed to create note', 'error');
      throw err;
    }
  };

  const updateNote = async (
    idOrProjectId: string,
    title: string,
    content: string
  ): Promise<ProjectNote | null> => {
    try {
      const existingById = notes.find((n) => n.id === idOrProjectId);
      const targetProjectId = existingById ? existingById.projectId : idOrProjectId;
      const targetId = existingById ? existingById.id : undefined;

      const saved = await workspaceRepository.saveNote({
        id: targetId,
        projectId: targetProjectId,
        title: title.trim() || 'Untitled Note',
        content,
      });

      setNotes((prev) => {
        const idx = prev.findIndex((n) => n.id === saved.id);
        if (idx !== -1) {
          const copy = [...prev];
          copy[idx] = saved;
          return copy;
        }
        return [saved, ...prev];
      });
      refreshStats();
      return saved;
    } catch (err) {
      console.error('Error saving note:', err);
      showToast('Failed to save note', 'error');
      return null;
    }
  };

  const deleteNote = async (id: string): Promise<void> => {
    try {
      const target = notes.find((n) => n.id === id);
      await workspaceRepository.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (activeNoteId === id) {
        const remaining = notes.filter((n) => n.id !== id && n.projectId === target?.projectId);
        setActiveNoteId(remaining[0]?.id || null);
      }
      showToast(`Deleted note "${target?.title || 'note'}"`, 'info');
      refreshStats();
    } catch (err) {
      console.error('Error deleting note:', err);
      showToast('Failed to delete note', 'error');
    }
  };

  const createFolder = async (
    projectId: string,
    name: string,
    parentId: string | null = currentFolderId
  ): Promise<ProjectFolder | null> => {
    try {
      const folder = await fileApiService.createFolder(projectId, name, parentId);
      setFolders((prev) => [...prev, folder]);
      showToast(`Created folder "${folder.name}"`, 'success');
      return folder;
    } catch (err: any) {
      console.error('Error creating folder:', err);
      showToast(err?.message || 'Failed to create folder', 'error');
      return null;
    }
  };

  const deleteFolder = async (id: string): Promise<void> => {
    try {
      const folder = folders.find((f) => f.id === id);
      const res = await fileApiService.deleteFolder(id);
      setFolders((prev) => prev.filter((f) => !res.deletedFolders.includes(f.id)));
      setFiles((prev) => prev.filter((f) => !res.deletedFiles.includes(f.id)));
      showToast(`Deleted folder "${folder?.name || 'folder'}"`, 'info');
    } catch (err: any) {
      console.error('Error deleting folder:', err);
      showToast(err?.message || 'Failed to delete folder', 'error');
    }
  };

  const uploadFile = async (
    projectId: string,
    file: File,
    folderId: string | null = currentFolderId,
    relPath?: string
  ): Promise<ProjectFile | null> => {
    try {
      const uploaded = await fileApiService.uploadFiles({
        projectId,
        files: [file],
        folderId,
        relPaths: relPath ? { [file.name]: relPath } : undefined,
      });

      if (uploaded && uploaded.length > 0) {
        const item = uploaded[0];
        try {
          await workspaceRepository.addFile({
            id: item.id,
            projectId: item.projectId,
            name: item.name,
            size: item.size,
            type: item.type,
            folderId: item.folderId,
            relativePath: item.relativePath,
            textPreview: item.textPreview,
          });
        } catch {
          // ignore duplicate
        }
        if (item.projectId === activeProjectId) {
          setFiles((prev) => [
            item,
            ...prev.filter((f) => f.id !== item.id && f.projectId === activeProjectId),
          ]);
        }
        showToast(`Uploaded "${file.name}"`, 'success');
        refreshStats();
        return item;
      }
      return null;
    } catch (apiErr: any) {
      console.warn('Backend upload failed, attempting local fallback:', apiErr);
      try {
        const validation = validateFile(file);
        if (!validation.isValid) {
          showToast(validation.error || 'Invalid file format or size', 'error');
          return null;
        }

        const parsed = await readLocalFile(file);
        const saved = await workspaceRepository.addFile({
          projectId,
          name: parsed.name,
          size: parsed.size,
          type: parsed.type,
          dataUrl: parsed.dataUrl,
          textPreview: parsed.textPreview,
          folderId,
          relativePath: relPath || file.name,
        });

        if (saved.projectId === activeProjectId) {
          setFiles((prev) => [
            saved,
            ...prev.filter((f) => f.id !== saved.id && f.projectId === activeProjectId),
          ]);
        }
        showToast(`Imported "${file.name}" locally (offline)`, 'info');
        refreshStats();
        return saved;
      } catch (fallbackErr: any) {
        showToast(apiErr?.message || fallbackErr?.message || 'Failed to upload file', 'error');
        return null;
      }
    }
  };

  const deleteFile = async (id: string): Promise<void> => {
    try {
      const targetFile = files.find((f) => f.id === id);
      try {
        await fileApiService.deleteFile(id);
      } catch {
        await workspaceRepository.deleteFile(id);
      }
      setFiles((prev) => prev.filter((f) => f.id !== id));
      showToast(`Removed "${targetFile?.name || 'file'}"`, 'info');
      refreshStats();
    } catch (err) {
      console.error('Error deleting file:', err);
      showToast('Failed to delete file', 'error');
    }
  };

  const downloadFile = async (fileId: string, fileName: string): Promise<void> => {
    try {
      await fileApiService.downloadFile(fileId, fileName);
    } catch (err: any) {
      console.warn('Direct stream download failed, checking dataUrl:', err);
      const f = files.find((item) => item.id === fileId);
      if (f?.dataUrl) {
        const a = document.createElement('a');
        a.href = f.dataUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        showToast(err?.message || 'Failed to download file', 'error');
      }
    }
  };

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const currentProjectNotes = notes.filter((n) => n.projectId === activeProjectId);
  const currentProjectFiles = files.filter((f) => f.projectId === activeProjectId);
  const activeNote = notes.find((n) => n.id === activeNoteId) || currentProjectNotes[0];

  return (
    <ProjectContext.Provider
      value={{
        projects,
        conversations,
        messages,
        notes,
        files,
        folders,
        currentFolderId,
        setCurrentFolderId,
        currentBreadcrumbs,
        activeProjectId,
        activeConversationId,
        activeTab,
        isGeneratingResponse,
        streamingMessageId,
        streamingContent,
        isLoading,
        isConsentModalOpen,
        setIsConsentModalOpen,
        handleConsentSuccess,
        setActiveProjectId,
        setActiveConversationId,
        setActiveTab,
        startNewChat,
        createProject,
        updateProject,
        deleteProject,
        createConversation,
        updateConversation,
        deleteConversation,
        sendMessage,
        createNote,
        updateNote,
        deleteNote,
        activeNoteId,
        setActiveNoteId,
        activeNote,
        uploadFile,
        deleteFile,
        downloadFile,
        attachedFiles,
        attachFileToChat,
        removeAttachedFile,
        clearAttachedFiles,
        storeFileInChat,
        storeFolderInChat,
        createFolder,
        deleteFolder,
        activeProject,
        activeConversation,
        currentProjectNotes,
        currentProjectFiles,
        refreshData: loadAllData,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjects = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return context;
};
