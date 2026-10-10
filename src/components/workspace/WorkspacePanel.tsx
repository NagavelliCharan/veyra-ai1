import { FileText, Paperclip, X } from 'lucide-react';
import React, { useState } from 'react';
import { FileManager } from './FileManager';
import { NotesEditor } from './NotesEditor';

interface WorkspacePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WorkspacePanel: React.FC<WorkspacePanelProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'files'>('notes');

  if (!isOpen) return null;

  return (
    <aside className="w-80 md:w-96 border-l border-stone-200/90 bg-[#fcfbf9] flex flex-col shrink-0 h-full z-20">
      {/* Tab Switcher Header */}
      <div className="h-12 border-b border-stone-200/80 px-3 flex items-center justify-between bg-white/70 backdrop-blur-xs shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'notes'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60 shadow-2xs'
                : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            <FileText size={13} />
            <span>Notes</span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'files'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60 shadow-2xs'
                : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            <Paperclip size={13} />
            <span>Files</span>
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
          title="Close Workspace Drawer"
        >
          <X size={15} />
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col bg-white">
        {activeTab === 'notes' ? <NotesEditor /> : <FileManager />}
      </div>
    </aside>
  );
};
