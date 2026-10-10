import {
  BookOpen,
  Clock,
  Edit2,
  FolderOpen,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useProjects } from '../../context/ProjectContext';
import { formatRelativeTime } from '../../utils/timeFormatters';
import { ConfirmModal } from '../common/ConfirmModal';
import { ChatInput } from './ChatInput';
import { MessageBubble } from './MessageBubble';

export const ChatArea: React.FC = () => {
  const {
    activeProject,
    activeConversation,
    messages,
    activeConversationId,
    sendMessage,
    updateConversation,
    deleteConversation,
    isGeneratingResponse,
    streamingContent,
    streamingMessageId,
  } = useProjects();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversationMessages = messages.filter((m) => m.conversationId === activeConversationId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversationMessages.length, streamingContent, isGeneratingResponse]);

  useEffect(() => {
    if (activeConversation) {
      setTitleInput(activeConversation.title);
    }
  }, [activeConversation]);

  const handleSaveTitle = () => {
    if (activeConversation && titleInput.trim()) {
      updateConversation(activeConversation.id, { title: titleInput.trim() });
    }
    setIsEditingTitle(false);
  };

  const handleConfirmDelete = async () => {
    if (activeConversation) {
      await deleteConversation(activeConversation.id);
      setShowDeleteConfirm(false);
    }
  };

  // Friendly Empty State when no project is active
  if (!activeProject) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#fcfbf9]">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3 shadow-2xs">
          <FolderOpen size={26} />
        </div>
        <h3 className="text-base font-bold text-stone-900 tracking-tight">No Project Selected</h3>
        <p className="text-xs text-stone-500 mt-1 max-w-sm leading-relaxed">
          Select an existing research project or create a new folder from the sidebar to organize your private conversations and notes.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 flex flex-col h-full bg-[#fcfbf9] overflow-hidden">
        {/* Chat Area Header */}
        <div className="h-12 border-b border-stone-200/80 px-4 flex items-center justify-between bg-white/70 backdrop-blur-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare size={15} className="text-indigo-600 shrink-0" />
            {isEditingTitle ? (
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                autoFocus
                className="bg-stone-100 text-xs font-semibold text-stone-900 px-2 py-0.5 rounded border border-indigo-400 focus:outline-none"
              />
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-stone-900 truncate">
                  {activeConversation?.title || 'Untitled Chat'}
                </span>
                {activeConversation && (
                  <>
                    <button
                      onClick={() => setIsEditingTitle(true)}
                      className="p-1 text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
                      title="Rename conversation"
                    >
                      <Edit2 size={12} />
                    </button>
                    <span className="text-[10px] text-stone-400 flex items-center gap-1">
                      <Clock size={10} />
                      {formatRelativeTime(activeConversation.updatedAt)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {activeConversation && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
                title="Delete this conversation"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Message Feed / Welcoming Empty State */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {conversationMessages.length === 0 && !isGeneratingResponse ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 max-w-xl mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3 shadow-2xs">
                <Sparkles size={22} />
              </div>

              <h3 className="text-base font-bold text-stone-900 tracking-tight">
                Welcome to your private research workspace
              </h3>
              <p className="text-xs text-stone-500 mt-1 max-w-md leading-relaxed">
                Veyra AI keeps your notes, files, and queries confidential. Nothing is logged to a centralized server.
              </p>

              {/* Quick Prompt Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-6 w-full text-left">
                <div
                  onClick={() => sendMessage('Can you draft a literature review framework for privacy-preserving AI?')}
                  className="p-3 rounded-xl bg-white border border-stone-200 hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-stone-800 group-hover:text-indigo-600 mb-1">
                    <BookOpen size={14} className="text-indigo-500" />
                    <span>Literature Review</span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-normal">
                    Synthesize academic literature and structure key research findings.
                  </p>
                </div>

                <div
                  onClick={() => sendMessage('What are the key technical requirements for local-first software architectures?')}
                  className="p-3 rounded-xl bg-white border border-stone-200 hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-stone-800 group-hover:text-indigo-600 mb-1">
                    <ShieldCheck size={14} className="text-emerald-600" />
                    <span>Threat Modeling</span>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-normal">
                    Evaluate client storage vectors and zero-knowledge data retention.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            conversationMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}

          {/* Thinking for the answer indicator (waiting for model response) */}
          {isGeneratingResponse && !streamingContent && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-white border border-stone-200/90 shadow-2xs max-w-xl animate-in fade-in duration-200">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                <Sparkles size={14} className="animate-spin text-white" />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-stone-900">Veyra AI</span>
                  <span className="text-[10px] text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping inline-block" />
                    Thinking for the answer...
                  </span>
                </div>
                <div className="flex items-center gap-1.5 py-1 text-xs text-stone-500">
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:0ms]" />
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:150ms]" />
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:300ms]" />
                  <span className="text-xs text-stone-400 ml-1.5 font-normal">Analyzing your question...</span>
                </div>
              </div>
            </div>
          )}

          {/* Streaming Simulated Message */}
          {isGeneratingResponse && streamingContent && (
            <MessageBubble
              message={{
                id: streamingMessageId || 'streaming',
                conversationId: activeConversationId || '',
                projectId: activeProject.id,
                role: 'assistant',
                content: streamingContent,
                createdAt: Date.now(),
                metadata: {
                  modelName: 'Veyra Local Mock',
                  isSimulated: true,
                },
              }}
              isStreaming={true}
            />
          )}
        </div>

        {/* Message Composer */}
        <ChatInput
          onSendMessage={sendMessage}
          disabled={isGeneratingResponse}
        />
      </div>

      {/* Confirmation Modal for Conversation Deletion */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Conversation"
        message={`Are you sure you want to delete "${activeConversation?.title}"? All messages in this conversation will be permanently removed.`}
        confirmText="Delete Conversation"
        cancelText="Cancel"
        isDestructive={true}
      />
    </>
  );
};
