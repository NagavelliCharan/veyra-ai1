import {
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  FolderPlus,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  Plus,
  Search,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { usePrivacy } from '../../context/PrivacyContext';
import { useProjects } from '../../context/ProjectContext';
import { formatRelativeTime } from '../../utils/timeFormatters';
import { Button } from '../common/Button';
import { ConfirmModal } from '../common/ConfirmModal';

interface SidebarProps {
  onOpenNewProject: () => void;
  onEditProject: (projectId: string) => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenNewProject,
  onEditProject,
  onOpenSettings,
  onOpenSearch,
  isMobileOpen,
  onCloseMobile,
}) => {
  const { storageMode } = usePrivacy();
  const {
    projects,
    conversations,
    activeProjectId,
    activeConversationId,
    setActiveProjectId,
    setActiveConversationId,
    startNewChat,
    createConversation,
    updateConversation,
    deleteConversation,
    deleteProject,
  } = useProjects();

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    projects.forEach((p) => {
      initial[p.id] = true;
    });
    return initial;
  });

  const [quickFilter, setQuickFilter] = useState('');

  // Inline conversation editing
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingConvTitle, setEditingConvTitle] = useState('');

  // Confirmation modal state for destructive action
  const [convToDelete, setConvToDelete] = useState<{ id: string; title: string } | null>(null);
  const [projToDelete, setProjToDelete] = useState<{ id: string; name: string; convCount: number } | null>(null);

  // Auto-expand projects when searching
  useEffect(() => {
    if (quickFilter.trim()) {
      const expanded: Record<string, boolean> = {};
      projects.forEach((p) => {
        expanded[p.id] = true;
      });
      setExpandedProjects(expanded);
    }
  }, [quickFilter, projects]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedProjects((prev) => {
      const current = prev[id] !== false;
      return { ...prev, [id]: !current };
    });
  };

  const handleSelectProject = (id: string) => {
    setActiveProjectId(id);
    // Ensure the folder is expanded upon selection
    setExpandedProjects((prev) => ({ ...prev, [id]: true }));

    const projectConvs = conversations.filter((c) => c.projectId === id);
    if (projectConvs.length > 0) {
      if (!activeConversationId || !projectConvs.some((c) => c.id === activeConversationId)) {
        setActiveConversationId(projectConvs[0].id);
      }
    } else {
      // Cleanly reset active conversation so messages from other projects do not bleed
      setActiveConversationId(null);
    }
    if (onCloseMobile) onCloseMobile();
  };

  const handleSelectConversation = (projectId: string, conversationId: string) => {
    setActiveProjectId(projectId);
    setActiveConversationId(conversationId);
    if (onCloseMobile) onCloseMobile();
  };

  const handleCreateChatInProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await createConversation(projectId, 'New Conversation');
    setExpandedProjects((prev) => ({ ...prev, [projectId]: true }));
  };

  const startRenameConversation = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConvId(id);
    setEditingConvTitle(currentTitle);
  };

  const saveRenameConversation = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (editingConvId) {
      const trimmed = editingConvTitle.trim();
      if (trimmed) {
        await updateConversation(editingConvId, { title: trimmed });
      }
    }
    setEditingConvId(null);
    setEditingConvTitle('');
  };

  const cancelRenameConversation = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConvId(null);
    setEditingConvTitle('');
  };

  const confirmDeleteConversation = async () => {
    if (convToDelete) {
      await deleteConversation(convToDelete.id);
      setConvToDelete(null);
    }
  };

  const confirmDeleteProject = async () => {
    if (projToDelete) {
      await deleteProject(projToDelete.id);
      setProjToDelete(null);
    }
  };

  const filteredProjects = projects.filter((p) => {
    if (!quickFilter.trim()) return true;
    const q = quickFilter.toLowerCase();
    const matchProj = p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q));
    const matchConv = conversations.some(
      (c) => c.projectId === p.id && c.title.toLowerCase().includes(q)
    );
    return matchProj || matchConv;
  });

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-stone-900/30 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-40 w-72 bg-[#fcfbf9] border-r border-stone-200/90 flex flex-col shrink-0 transition-transform duration-200 ease-in-out ${
          isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo and Brand Header */}
        <div className="h-14 px-4 border-b border-stone-200/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-xs shadow-indigo-600/20">
              <Shield size={16} strokeWidth={2.4} />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-stone-900 flex items-center gap-1">
                Veyra<span className="text-indigo-600 font-extrabold">AI</span>
              </div>
              <div className="text-[10px] text-stone-400 font-medium tracking-tight">
                Private Research Workspace
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls: New Chat & Search */}
        <div className="p-3 space-y-2 border-b border-stone-200/60">
          <Button
            variant="primary"
            size="md"
            className="w-full justify-center shadow-xs"
            icon={<MessageSquarePlus size={15} />}
            onClick={() => startNewChat()}
          >
            New Chat
          </Button>

          {/* Search Input for Project Names & Chat Titles */}
          <div className="relative">
            <button
              onClick={onOpenSearch}
              className="absolute left-2.5 top-2.5 text-stone-400 hover:text-indigo-600 cursor-pointer"
              title="Open full-text search (Ctrl + K)"
            >
              <Search size={13} />
            </button>
            <input
              type="text"
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              placeholder="Search projects & chats..."
              className="w-full bg-white border border-stone-200/80 rounded-lg pl-8 pr-7 py-1.5 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300/40 shadow-2xs"
            />
            {quickFilter && (
              <button
                onClick={() => setQuickFilter('')}
                className="absolute right-2 top-2 text-[10px] text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Project Folders & Chats Hierarchy */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
              Project Folders
            </span>
            <button
              onClick={onOpenNewProject}
              className="p-1 text-stone-400 hover:text-indigo-600 hover:bg-stone-200/50 rounded-md transition-colors cursor-pointer"
              title="Add New Project Folder"
            >
              <FolderPlus size={14} />
            </button>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="text-center py-8 px-4 text-xs text-stone-400 space-y-2">
              {quickFilter ? (
                <p>No projects or chats match "{quickFilter}"</p>
              ) : (
                <>
                  <p>No project folders yet.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Plus size={12} />}
                    onClick={onOpenNewProject}
                    className="mx-auto"
                  >
                    Create Project
                  </Button>
                </>
              )}
            </div>
          ) : (
            filteredProjects.map((proj) => {
              const isExpanded = expandedProjects[proj.id] !== false;
              const isActive = activeProjectId === proj.id;
              let projectConvs = conversations.filter((c) => c.projectId === proj.id);

              if (quickFilter.trim()) {
                const q = quickFilter.toLowerCase();
                if (!proj.name.toLowerCase().includes(q)) {
                  projectConvs = projectConvs.filter((c) => c.title.toLowerCase().includes(q));
                }
              }

              return (
                <div key={proj.id} className="rounded-lg overflow-hidden transition-colors">
                  {/* Project Folder Row */}
                  <div
                    onClick={() => handleSelectProject(proj.id)}
                    className={`group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-stone-200/70 text-stone-900 font-semibold'
                        : 'text-stone-700 hover:bg-stone-100 hover:text-stone-900 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <button
                        onClick={(e) => toggleExpand(proj.id, e)}
                        className="p-0.5 text-stone-400 hover:text-stone-700 transition-colors"
                      >
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>

                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: proj.colorTag }}
                      />

                      <span className="truncate text-xs flex items-center gap-1.5">
                        <span className="truncate">{proj.name}</span>
                        {proj.isPersonalWorkspace && (
                          <span className="text-[9px] px-1 py-0.2 bg-indigo-50 text-indigo-600 rounded font-semibold tracking-wider shrink-0 border border-indigo-200/60">
                            Personal
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Actions on hover */}
                    <div className="flex items-center gap-0.5 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleCreateChatInProject(proj.id, e)}
                        title="New Chat in this Project"
                        className="p-1 text-stone-400 hover:text-indigo-600 hover:bg-white rounded transition-colors cursor-pointer"
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditProject(proj.id);
                        }}
                        title="Edit Project"
                        className="p-1 text-stone-400 hover:text-stone-700 hover:bg-white rounded transition-colors cursor-pointer"
                      >
                        <MoreHorizontal size={12} />
                      </button>
                      {!proj.isPersonalWorkspace && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const count = conversations.filter((c) => c.projectId === proj.id).length;
                            setProjToDelete({ id: proj.id, name: proj.name, convCount: count });
                          }}
                          title="Delete Project Folder"
                          className="p-1 text-stone-400 hover:text-red-600 hover:bg-white rounded transition-colors cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Nested Conversations Sub-list */}
                  {isExpanded && (
                    <div className="ml-4 pl-2 border-l border-stone-200/80 my-0.5 space-y-0.5">
                      {projectConvs.map((conv) => {
                        const isConvActive = activeConversationId === conv.id;
                        const isEditing = editingConvId === conv.id;

                        if (isEditing) {
                          return (
                            <div
                              key={conv.id}
                              className="flex items-center gap-1 px-1.5 py-1 bg-white border border-indigo-300 rounded-md shadow-2xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                autoFocus
                                value={editingConvTitle}
                                onChange={(e) => setEditingConvTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveRenameConversation();
                                  if (e.key === 'Escape') setEditingConvId(null);
                                }}
                                className="w-full text-xs text-stone-900 bg-transparent focus:outline-none"
                              />
                              <button
                                onClick={saveRenameConversation}
                                className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded"
                              >
                                <Check size={11} />
                              </button>
                              <button
                                onClick={cancelRenameConversation}
                                className="p-0.5 text-stone-400 hover:bg-stone-100 rounded"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={conv.id}
                            onClick={() => handleSelectConversation(proj.id, conv.id)}
                            className={`group flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                              isConvActive
                                ? 'bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200/60 shadow-2xs'
                                : 'text-stone-600 hover:bg-stone-100/80 hover:text-stone-900'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate flex-1 min-w-0 mr-1">
                              <MessageSquare
                                size={12}
                                className={`shrink-0 ${
                                  isConvActive ? 'text-indigo-600' : 'text-stone-400'
                                }`}
                              />
                              <span className="truncate">{conv.title}</span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {/* Relative time indicator */}
                              <span className="text-[10px] text-stone-400 font-normal group-hover:hidden">
                                {formatRelativeTime(conv.updatedAt)}
                              </span>

                              {/* Hover actions: Rename & Delete */}
                              <div className="hidden group-hover:flex items-center gap-0.5">
                                <button
                                  onClick={(e) => startRenameConversation(conv.id, conv.title, e)}
                                  title="Rename conversation"
                                  className="p-0.5 text-stone-400 hover:text-stone-700 rounded transition-all cursor-pointer"
                                >
                                  <Edit2 size={11} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConvToDelete({ id: conv.id, title: conv.title });
                                  }}
                                  title="Delete conversation"
                                  className="p-0.5 text-stone-400 hover:text-red-600 rounded transition-all cursor-pointer"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {projectConvs.length === 0 && (
                        <div
                          onClick={(e) => handleCreateChatInProject(proj.id, e)}
                          className="px-2 py-1 text-[11px] text-stone-400 hover:text-indigo-600 cursor-pointer flex items-center gap-1 italic"
                        >
                          <Plus size={10} /> Add first chat
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Area with Privacy Summary */}
        <div className="p-3 border-t border-stone-200/80 bg-white/60">
          <div
            onClick={onOpenSettings}
            className="flex items-center justify-between p-2 rounded-xl bg-stone-50 border border-stone-200/70 hover:border-stone-300 text-xs text-stone-700 cursor-pointer transition-all shadow-2xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Shield size={11} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-stone-900 text-[11px] truncate">
                  No Central Database
                </div>
                <div className="text-[10px] text-stone-500 truncate">
                  {storageMode === 'encrypted'
                    ? 'Encrypted Vault'
                    : storageMode === 'session_only'
                    ? 'Session (RAM Only)'
                    : 'Local IndexedDB'}
                </div>
              </div>
            </div>
            <span className="text-[10px] font-medium text-indigo-600 hover:underline shrink-0">
              Privacy Center
            </span>
          </div>
        </div>
      </aside>

      {/* Confirmation Modal for Deleting Conversation */}
      <ConfirmModal
        isOpen={!!convToDelete}
        onClose={() => setConvToDelete(null)}
        onConfirm={confirmDeleteConversation}
        title="Delete Conversation"
        message={`Are you sure you want to delete "${convToDelete?.title}"? All messages in this conversation will be permanently removed.`}
        confirmText="Delete Conversation"
        cancelText="Cancel"
        isDestructive={true}
      />

      {/* Confirmation Modal for Deleting Project Folder */}
      <ConfirmModal
        isOpen={!!projToDelete}
        onClose={() => setProjToDelete(null)}
        onConfirm={confirmDeleteProject}
        title="Delete Project Folder"
        message={`Are you sure you want to delete "${projToDelete?.name}"? All ${projToDelete?.convCount || 0} conversations, notes, and files inside will be permanently removed.`}
        confirmText="Delete Project"
        cancelText="Cancel"
        isDestructive={true}
      />
    </>
  );
};
