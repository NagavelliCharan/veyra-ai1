import {
  AlertCircle,
  Check,
  Eye,
  FilePlus2,
  FileText,
  Loader2,
  PanelLeft,
  PenLine,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useProjects } from '../../context/ProjectContext';
import { formatRelativeTime } from '../../utils/timeFormatters';

export const NotesEditor: React.FC = () => {
  const {
    activeProject,
    currentProjectNotes,
    createNote,
    updateNote,
    deleteNote,
    setActiveNoteId,
    activeNote,
  } = useProjects();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [showNoteList, setShowNoteList] = useState(true);

  // Keep track of the currently loaded note to avoid overwriting during switch
  const loadedNoteIdRef = useRef<string | null>(null);
  const isInitialMountRef = useRef<boolean>(true);

  // Sync state when active note changes
  useEffect(() => {
    if (activeNote) {
      loadedNoteIdRef.current = activeNote.id;
      setTitle(activeNote.title);
      setContent(activeNote.content);
      setSaveStatus('saved');
    } else if (currentProjectNotes.length > 0) {
      // Default to first note if activeNoteId is not set
      setActiveNoteId(currentProjectNotes[0].id);
    } else {
      loadedNoteIdRef.current = null;
      setTitle('');
      setContent('');
      setSaveStatus('saved');
    }
  }, [activeNote?.id, currentProjectNotes.length]);

  // Flush pending save immediately
  const flushPendingSave = async (targetNoteId = activeNote?.id): Promise<boolean> => {
    if (!targetNoteId || !activeProject) return true;
    setSaveStatus('saving');
    try {
      const res = await updateNote(targetNoteId, title, content);
      if (res) {
        setSaveStatus('saved');
        return true;
      } else {
        setSaveStatus('error');
        return false;
      }
    } catch {
      setSaveStatus('error');
      return false;
    }
  };

  // Warn on page unload if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'unsaved' || saveStatus === 'saving' || saveStatus === 'error') {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes in your note. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  // Keyboard shortcut Ctrl+S / Cmd+S to explicitly save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        flushPendingSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [title, content, activeNote?.id, activeProject?.id]);

  // Debounced Autosave (600ms) with error handling
  useEffect(() => {
    // Skip autosave on initial mount or when no active note is loaded
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    if (!activeNote || !activeProject) return;

    // Check if anything actually changed
    if (title === activeNote.title && content === activeNote.content) {
      return;
    }

    setSaveStatus('unsaved');
    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const res = await updateNote(activeNote.id, title, content);
        if (res) {
          setSaveStatus('saved');
        } else {
          setSaveStatus('error');
        }
      } catch {
        setSaveStatus('error');
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [title, content, activeNote?.id, activeProject?.id]);

  const handleCreateNote = async () => {
    if (!activeProject) return;
    if (saveStatus === 'unsaved' || saveStatus === 'error') {
      await flushPendingSave();
    }
    const newNote = await createNote(activeProject.id, 'New Research Note', '');
    setActiveNoteId(newNote.id);
    setIsPreview(false);
  };

  const handleSelectNote = async (newNoteId: string) => {
    if (newNoteId === activeNote?.id) return;
    if (saveStatus === 'unsaved' || saveStatus === 'error') {
      const saved = await flushPendingSave();
      if (!saved) {
        const proceed = window.confirm(
          'Recent note edits could not be saved. Switch notes anyway and discard unsaved edits?'
        );
        if (!proceed) return;
      }
    }
    setActiveNoteId(newNoteId);
  };

  const handleDeleteNote = async (noteId: string) => {
    const target = currentProjectNotes.find((n) => n.id === noteId);
    const hasUnsaved = (saveStatus === 'unsaved' || saveStatus === 'error') && noteId === activeNote?.id;
    const confirmMessage = hasUnsaved
      ? `Delete note "${target?.title || 'note'}"? You have unsaved edits that will be permanently lost.`
      : `Delete note "${target?.title || 'note'}"?`;

    if (window.confirm(confirmMessage)) {
      await deleteNote(noteId);
    }
  };

  // Filter notes by search query
  const filteredNotes = currentProjectNotes.filter((note) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      note.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query)
    );
  });

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  // Safe light-theme markdown rendering preventing XSS
  const renderFormattedMarkdown = (markdownText: string) => {
    const lines = markdownText.split('\n');
    return (
      <div className="space-y-2 text-xs leading-relaxed text-stone-800">
        {lines.map((line, idx) => {
          if (line.startsWith('# ')) {
            return (
              <h1 key={idx} className="text-base font-bold text-stone-900 border-b border-stone-200 pb-1 mt-3">
                {line.slice(2)}
              </h1>
            );
          }
          if (line.startsWith('## ')) {
            return (
              <h2 key={idx} className="text-sm font-bold text-stone-900 border-b border-stone-100 pb-0.5 mt-2.5">
                {line.slice(3)}
              </h2>
            );
          }
          if (line.startsWith('### ')) {
            return (
              <h3 key={idx} className="text-xs font-semibold text-stone-900 mt-2">
                {line.slice(4)}
              </h3>
            );
          }
          if (line.startsWith('```')) {
            return (
              <div key={idx} className="font-mono text-[11px] bg-stone-100 text-stone-800 p-2 rounded border border-stone-200/80 my-1 overflow-x-auto">
                {line.replace(/```/g, '')}
              </div>
            );
          }
          if (line.startsWith('> ')) {
            return (
              <blockquote key={idx} className="border-l-2 border-indigo-400 pl-3 py-0.5 text-stone-600 italic bg-stone-50/70 rounded-r">
                {line.slice(2)}
              </blockquote>
            );
          }
          if (line.startsWith('- ') || line.startsWith('* ')) {
            return (
              <div key={idx} className="flex items-start gap-2 ml-2">
                <span className="text-indigo-600 mt-0.5">•</span>
                <span>{line.slice(2)}</span>
              </div>
            );
          }
          if (!line.trim()) {
            return <div key={idx} className="h-1.5" />;
          }
          return <p key={idx}>{line}</p>;
        })}
      </div>
    );
  };

  if (!activeProject) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-stone-400">
        Select a project from the sidebar to view and manage its notes.
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-white">
      {/* Left Column: Note List & Search (Collapsible on narrow layouts) */}
      <div
        className={`${
          showNoteList ? 'w-64 sm:w-72' : 'w-0 hidden'
        } border-r border-stone-200/80 bg-stone-50/60 flex flex-col shrink-0 transition-all duration-200`}
      >
        {/* Header & New Note Action */}
        <div className="p-3 border-b border-stone-200/80 flex items-center justify-between shrink-0 bg-white/70">
          <div className="flex items-center gap-1.5">
            <FileText size={15} className="text-indigo-600" />
            <span className="text-xs font-bold text-stone-900">
              Project Notes ({currentProjectNotes.length})
            </span>
          </div>

          <button
            onClick={handleCreateNote}
            className="flex items-center gap-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
            title="Create a new note in this project"
          >
            <FilePlus2 size={12} />
            <span>New</span>
          </button>
        </div>

        {/* Search Notes Input */}
        <div className="p-2.5 border-b border-stone-200/60 bg-white/50">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes..."
              className="w-full pl-7 pr-7 py-1 text-xs bg-stone-100 focus:bg-white rounded-lg border border-stone-200/70 focus:border-indigo-500 focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredNotes.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-400 px-3">
              {searchQuery ? (
                <span>No notes matching "{searchQuery}"</span>
              ) : (
                <div className="space-y-2">
                  <p>No notes yet.</p>
                  <button
                    onClick={handleCreateNote}
                    className="text-indigo-600 hover:text-indigo-700 text-xs font-semibold underline cursor-pointer"
                  >
                    + Create First Note
                  </button>
                </div>
              )}
            </div>
          ) : (
            filteredNotes.map((note) => {
              const isSelected = activeNote?.id === note.id;
              const previewSnippet = note.content
                ? note.content.replace(/[#*`\-_]/g, '').trim().slice(0, 50)
                : 'Empty note...';

              return (
                <div
                  key={note.id}
                  onClick={() => handleSelectNote(note.id)}
                  className={`group relative p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white border-indigo-200 shadow-2xs'
                      : 'border-transparent hover:bg-white/80 hover:border-stone-200/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5 mb-1">
                    <span
                      className={`text-xs font-semibold truncate flex-1 ${
                        isSelected ? 'text-indigo-950 font-bold' : 'text-stone-800'
                      }`}
                    >
                      {note.title || 'Untitled Note'}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNote(note.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-rose-600 p-0.5 rounded transition-all cursor-pointer"
                      title="Delete note"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  <p className="text-[11px] text-stone-500 line-clamp-1 leading-snug">
                    {previewSnippet}
                  </p>

                  <div className="text-[10px] text-stone-400 mt-1">
                    {formatRelativeTime(note.updatedAt)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Note Editor and Markdown Preview */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-white">
        {activeNote ? (
          <>
            {/* Editor Top Bar */}
            <div className="px-4 py-2.5 border-b border-stone-200/80 flex items-center justify-between bg-stone-50/70 shrink-0">
              {/* Note Title Input */}
              <div className="flex items-center gap-2 flex-1 min-w-0 mr-3">
                <button
                  onClick={() => setShowNoteList(!showNoteList)}
                  className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-md transition-colors cursor-pointer"
                  title={showNoteList ? 'Collapse Notes List' : 'Expand Notes List'}
                >
                  <PanelLeft size={15} />
                </button>
                <FileText size={15} className="text-indigo-600 shrink-0" />
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Note title..."
                  className="w-full bg-transparent text-sm font-bold text-stone-900 focus:outline-none truncate"
                />
              </div>

              {/* Action Buttons & Save Status */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Autosave / Save Status Indicator */}
                {saveStatus === 'saved' ? (
                  <span className="text-[11px] font-medium flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-stone-100/90 text-emerald-700 border border-stone-200/50">
                    <Check size={12} className="text-emerald-600" />
                    <span>Saved</span>
                  </span>
                ) : saveStatus === 'saving' ? (
                  <span className="text-[11px] font-medium flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/50">
                    <Loader2 size={12} className="animate-spin text-amber-600" />
                    <span>Saving...</span>
                  </span>
                ) : saveStatus === 'error' ? (
                  <span className="text-[11px] font-medium flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                    <AlertCircle size={12} className="text-rose-600" />
                    <span>Save failed</span>
                    <button
                      onClick={() => flushPendingSave()}
                      className="ml-0.5 underline font-semibold text-rose-800 hover:text-rose-950 cursor-pointer"
                    >
                      Retry
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => flushPendingSave()}
                    className="text-[11px] font-medium flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors cursor-pointer"
                    title="Click or press Ctrl+S to save now"
                  >
                    <Save size={11} className="text-amber-700" />
                    <span>Save now</span>
                  </button>
                )}

                {/* Edit / Preview Toggle */}
                <button
                  onClick={() => setIsPreview(!isPreview)}
                  className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                    isPreview
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'text-stone-500 hover:text-stone-800 hover:bg-stone-200/60'
                  }`}
                  title={isPreview ? 'Switch to Markdown Edit Mode' : 'Switch to Rendered Preview'}
                >
                  {isPreview ? <PenLine size={14} /> : <Eye size={14} />}
                  <span className="text-[11px] hidden sm:inline font-semibold">
                    {isPreview ? 'Edit' : 'Preview'}
                  </span>
                </button>

                {/* Delete Note */}
                <button
                  onClick={() => handleDeleteNote(activeNote.id)}
                  className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  title="Delete this note"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Note Editor / Preview Area */}
            <div className="flex-1 p-4 overflow-y-auto">
              {isPreview ? (
                <div className="prose prose-stone prose-xs max-w-none">
                  {content.trim() ? (
                    renderFormattedMarkdown(content)
                  ) : (
                    <p className="text-xs text-stone-400 italic">This note is empty.</p>
                  )}
                </div>
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Draft project notes, research observations, or outline chapters (Markdown supported)..."
                  className="w-full h-full bg-transparent text-xs text-stone-800 placeholder-stone-400 resize-none focus:outline-none font-mono leading-relaxed"
                />
              )}
            </div>

            {/* Note Footer */}
            <div className="px-4 py-2 border-t border-stone-200/80 bg-stone-50/80 text-[10px] text-stone-500 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span>{wordCount} words</span>
                <span>•</span>
                <span>{charCount} characters</span>
              </div>
              <span className="text-stone-400">
                Autosaved locally in browser sandbox
              </span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <FileText size={24} />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-stone-900">No Note Selected</h4>
              <p className="text-xs text-stone-500 max-w-xs">
                Create a new research note or select an existing note from the list.
              </p>
            </div>
            <button
              onClick={handleCreateNote}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              + Create Note
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
