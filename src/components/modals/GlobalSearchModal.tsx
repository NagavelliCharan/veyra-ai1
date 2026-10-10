import {
  FileText,
  Folder,
  Lock,
  MessageSquare,
  Paperclip,
  Search,
  Shield,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { usePrivacy } from '../../context/PrivacyContext';
import { useProjects } from '../../context/ProjectContext';
import { searchAll } from '../../services/search/searchEngine';
import type { SearchResult } from '../../types';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWorkspaceTab?: (tab: 'chat' | 'notes' | 'files') => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onOpenWorkspaceTab,
}) => {
  const {
    projects,
    conversations,
    messages,
    notes,
    files,
    activeProject,
    setActiveProjectId,
    setActiveConversationId,
    setActiveNoteId,
    setActiveTab,
  } = useProjects();
  const { storageMode, isVaultLocked } = usePrivacy();

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'current'>('all');
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (query.trim()) {
      const filterId = scope === 'current' && activeProject ? activeProject.id : undefined;
      const res = searchAll(query, projects, conversations, messages, notes, files, filterId);
      setResults(res);
    } else {
      setResults([]);
    }
  }, [query, scope, projects, conversations, messages, notes, files, activeProject?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectResult = (result: SearchResult) => {
    setActiveProjectId(result.projectId);
    if (result.conversationId) {
      setActiveConversationId(result.conversationId);
    }

    if (result.type === 'note') {
      setActiveNoteId(result.id);
      setActiveTab('notes');
      if (onOpenWorkspaceTab) onOpenWorkspaceTab('notes');
    } else if (result.type === 'file') {
      setActiveTab('files');
      if (onOpenWorkspaceTab) onOpenWorkspaceTab('files');
    } else if (result.type === 'conversation' || result.type === 'message') {
      setActiveTab('chat');
      if (onOpenWorkspaceTab) onOpenWorkspaceTab('chat');
    }

    onClose();
  };

  const getResultIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'project':
        return <Folder size={14} className="text-indigo-600" />;
      case 'conversation':
        return <MessageSquare size={14} className="text-emerald-600" />;
      case 'message':
        return <MessageSquare size={14} className="text-sky-600" />;
      case 'note':
        return <FileText size={14} className="text-amber-600" />;
      case 'file':
        return <Paperclip size={14} className="text-rose-600" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-stone-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-xl bg-white border border-stone-200 rounded-2xl shadow-xl overflow-hidden z-10 flex flex-col max-h-[75vh]">
        {/* Search Input Bar */}
        <div className="p-3.5 border-b border-stone-200 bg-stone-50/50">
          <div className="flex items-center gap-2.5">
            <Search size={17} className="text-stone-400 shrink-0 ml-1" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects, conversations, messages, notes, and files..."
              className="w-full bg-transparent text-xs text-stone-900 placeholder-stone-400 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="p-1 text-stone-400 hover:text-stone-700"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Project Scoping Pills */}
          <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-stone-200/60 text-[11px]">
            <span className="text-stone-400 font-medium mr-1 text-[10px] uppercase tracking-wider">Scope:</span>
            <button
              onClick={() => setScope('all')}
              className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                scope === 'all'
                  ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              All Projects ({projects.length})
            </button>
            {activeProject && (
              <button
                onClick={() => setScope('current')}
                className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer truncate max-w-[200px] ${
                  scope === 'current'
                    ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                In "{activeProject.name}"
              </button>
            )}
          </div>
        </div>

        {/* Vault Locked Warning (if applicable) */}
        {storageMode === 'encrypted' && isVaultLocked && (
          <div className="p-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-900">
            <Lock size={14} className="text-amber-600 shrink-0" />
            <span>
              <strong>Encrypted Vault is Locked:</strong> Private notes, files, and chat messages cannot be searched until the vault is unlocked.
            </span>
          </div>
        )}

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {query.trim() === '' ? (
            <div className="text-center py-12 text-xs text-stone-400">
              Type to search locally across all projects, messages, and notes.
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-xs text-stone-400">
              No matching records found for "{query}"{scope === 'current' && activeProject ? ` in "${activeProject.name}"` : ''}.
            </div>
          ) : (
            results.map((res) => (
              <div
                key={`${res.type}-${res.id}`}
                onClick={() => handleSelectResult(res)}
                className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-stone-100/80 cursor-pointer transition-colors group"
              >
                <div className="p-1.5 rounded-lg bg-stone-100 border border-stone-200/80 shrink-0 mt-0.5">
                  {getResultIcon(res.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-stone-900 truncate group-hover:text-indigo-600">
                      {res.title}
                    </span>
                    <span className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">
                      {res.type}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 truncate mt-0.5">{res.snippet}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-stone-50 border-t border-stone-200 text-[10px] text-stone-400 flex items-center justify-between shrink-0">
          <span className="flex items-center gap-1">
            <Shield size={11} className="text-emerald-600" />
            <span>Client-Side Local Search • 0 B Outbound Network</span>
          </span>
          <span>Press ESC to exit</span>
        </div>
      </div>
    </div>
  );
};
