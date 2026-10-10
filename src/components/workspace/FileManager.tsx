import {
  ChevronRight,
  Download,
  Eye,
  FileCode,
  FileText,
  Folder,
  FolderPlus,
  FolderUp,
  HardDrive,
  Home,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Plus,
  Search,
  Shield,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { useProjects } from '../../context/ProjectContext';
import type { ProjectFile, ProjectFolder } from '../../types';
import { formatFileSize } from '../../utils/fileValidators';
import { FilePreviewModal } from '../modals/FilePreviewModal';

export const FileManager: React.FC = () => {
  const {
    activeProject,
    files,
    folders,
    currentFolderId,
    setCurrentFolderId,
    currentBreadcrumbs,
    uploadFile,
    deleteFile,
    downloadFile,
    createFolder,
    deleteFolder,
    storeFileInChat,
    storeFolderInChat,
  } = useProjects();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importingStatus, setImportingStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'folders' | 'pdf' | 'md' | 'txt'>('all');
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);

  // Debounce ref to prevent single-click folder open from swallowing double-click
  const folderClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New folder dialog state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Handle explicit files upload
  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const targetProjId = activeProject?.id;
    if (!targetProjId) return;
    setIsImporting(true);
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setImportingStatus(`Uploading "${file.name}"...`);
        const relPath = file.webkitRelativePath || file.name;
        await uploadFile(targetProjId, file, currentFolderId, relPath);
      }
    } finally {
      setIsImporting(false);
      setImportingStatus(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  // Recursive directory reader for drag-and-drop
  const traverseEntry = async (
    entry: any,
    parentFolderId: string | null = currentFolderId,
    baseRelPath = ''
  ): Promise<void> => {
    if (!activeProject) return;

    if (entry.isFile) {
      return new Promise<void>((resolve) => {
        entry.file(async (file: File) => {
          const relPath = baseRelPath ? `${baseRelPath}/${file.name}` : file.name;
          setImportingStatus(`Uploading "${file.name}"...`);
          await uploadFile(activeProject.id, file, parentFolderId, relPath);
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      setImportingStatus(`Creating folder "${entry.name}"...`);
      const created = await createFolder(activeProject.id, entry.name, parentFolderId);
      const nextParentId = created?.id || parentFolderId;
      const nextRelPath = baseRelPath ? `${baseRelPath}/${entry.name}` : entry.name;

      const reader = entry.createReader();
      const readAllEntries = async (): Promise<any[]> => {
        const entries: any[] = [];
        let batch: any[];
        do {
          batch = await new Promise((res) => reader.readEntries(res));
          entries.push(...batch);
        } while (batch.length > 0);
        return entries;
      };

      const children = await readAllEntries();
      for (const child of children) {
        await traverseEntry(child, nextParentId, nextRelPath);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!activeProject) return;

    setIsImporting(true);
    try {
      const items = e.dataTransfer.items;
      if (items && items.length > 0 && typeof (items[0] as any).webkitGetAsEntry === 'function') {
        for (let i = 0; i < items.length; i++) {
          const entry = (items[i] as any).webkitGetAsEntry();
          if (entry) {
            await traverseEntry(entry, currentFolderId);
          }
        }
      } else {
        await handleFiles(e.dataTransfer.files);
      }
    } finally {
      setIsImporting(false);
      setImportingStatus(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !newFolderName.trim()) return;

    await createFolder(activeProject.id, newFolderName.trim(), currentFolderId);
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const getFileIcon = (fileName: string, type: string) => {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.pdf') || type.includes('pdf')) {
      return <FileText size={16} className="text-rose-600" />;
    }
    if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown') || type.includes('markdown')) {
      return <FileCode size={16} className="text-indigo-600" />;
    }
    return <FileText size={16} className="text-stone-600" />;
  };

  const getFileTypeLabel = (fileName: string) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) return 'PDF';
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'MD';
    return 'TXT';
  };

  const handleDeleteFile = (fileId: string, fileName: string) => {
    if (window.confirm(`Permanently remove "${fileName}" from persistent disk storage?`)) {
      deleteFile(fileId);
    }
  };

  const handleDeleteFolder = (folderId: string, folderName: string) => {
    if (
      window.confirm(
        `Permanently delete folder "${folderName}" and all of its nested files and subfolders from disk storage?`
      )
    ) {
      deleteFolder(folderId);
    }
  };

  const handleFolderClick = (folder: ProjectFolder) => {
    if (folderClickTimeoutRef.current) {
      clearTimeout(folderClickTimeoutRef.current);
    }
    folderClickTimeoutRef.current = setTimeout(() => {
      setCurrentFolderId(folder.id);
      folderClickTimeoutRef.current = null;
    }, 220);
  };

  const handleFolderDoubleClick = (folder: ProjectFolder) => {
    if (folderClickTimeoutRef.current) {
      clearTimeout(folderClickTimeoutRef.current);
      folderClickTimeoutRef.current = null;
    }
    storeFolderInChat(folder);
  };

  // Filter and search strictly scoped to activeProject
  const projectFolders = folders.filter((folder) => folder.projectId === activeProject?.id);
  const projectFiles = files.filter((file) => file.projectId === activeProject?.id);

  const filteredFolders = projectFolders.filter((folder) => {
    if (typeFilter !== 'all' && typeFilter !== 'folders') return false;
    return !searchQuery.trim() || folder.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredFiles = projectFiles.filter((file) => {
    if (typeFilter === 'folders') return false;
    const lowerName = file.name.toLowerCase();
    const matchesSearch = !searchQuery.trim() || lowerName.includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (typeFilter === 'pdf') return lowerName.endsWith('.pdf') || file.type.includes('pdf');
    if (typeFilter === 'md')
      return (
        lowerName.endsWith('.md') ||
        lowerName.endsWith('.markdown') ||
        file.type.includes('markdown')
      );
    if (typeFilter === 'txt') return lowerName.endsWith('.txt') || file.type.includes('text');

    return true;
  });

  const pdfCount = projectFiles.filter((f) => f.name.toLowerCase().endsWith('.pdf')).length;
  const mdCount = projectFiles.filter(
    (f) => f.name.toLowerCase().endsWith('.md') || f.name.toLowerCase().endsWith('.markdown')
  ).length;
  const txtCount = projectFiles.filter((f) => f.name.toLowerCase().endsWith('.txt')).length;

  if (!activeProject) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-stone-400">
        Select a project from the sidebar to access and manage its files.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
      {/* Upload Zone & Action Bar */}
      <div className="p-4 border-b border-stone-200/80 bg-stone-50/50 shrink-0">
        {/* Hidden File and Folder Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is a standard non-standard browser attribute
          webkitdirectory=""
          directory=""
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />

        {/* Drag and Drop Box */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/60 scale-[0.99]'
              : 'border-stone-300 hover:border-indigo-400 bg-white hover:bg-stone-50/80 shadow-2xs'
          }`}
        >
          {isImporting ? (
            <div className="flex flex-col items-center gap-2 py-1">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Loader2 size={18} className="animate-spin text-indigo-600" />
              </div>
              <div className="text-xs font-semibold text-indigo-950">
                {importingStatus || 'Uploading files and folders...'}
              </div>
              <div className="text-[11px] text-stone-500">
                Persisting directly to uploads/ disk storage and database metadata
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <UploadCloud size={18} />
              </div>
              <div className="text-xs font-semibold text-stone-800">
                Drag and drop files & folders or <span className="text-indigo-600 underline">browse</span>
              </div>
              <div className="text-[11px] text-stone-500 flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-stone-100 font-medium text-[10px]">Zero-Byte Files Accepted</span>
                <span>•</span>
                <span className="px-1.5 py-0.5 rounded bg-stone-100 font-medium text-[10px]">Folders & Subfolders</span>
                <span>•</span>
                <span>Max 50 MB • Saved to persistent disk</span>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons Toolbar */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-stone-700 hover:text-indigo-600 hover:border-indigo-300 text-xs font-medium inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <FolderPlus size={14} className="text-indigo-600" />
              <span>New Folder</span>
            </button>
            <button
              onClick={() => folderInputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-stone-700 hover:text-indigo-600 hover:border-indigo-300 text-xs font-medium inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <FolderUp size={14} className="text-stone-500" />
              <span>Upload Folder</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-medium inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>Upload Files</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
            <HardDrive size={13} className="text-stone-400" />
            <span>Persistent Disk Storage (`uploads/`)</span>
          </div>
        </div>

        {/* Inline New Folder Creator Modal / Input */}
        {isCreatingFolder && (
          <form
            onSubmit={handleCreateFolderSubmit}
            className="mt-3 p-3 rounded-xl bg-white border border-indigo-200 shadow-sm flex items-center gap-2 animate-in fade-in"
          >
            <Folder size={16} className="text-indigo-600 shrink-0" />
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Enter folder name..."
              className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-stone-200 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={!newFolderName.trim()}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreatingFolder(false);
                setNewFolderName('');
              }}
              className="px-2.5 py-1.5 text-stone-500 hover:text-stone-800 text-xs cursor-pointer"
            >
              Cancel
            </button>
          </form>
        )}

        {/* Privacy Callout Banner */}
        <div className="mt-2.5 p-2 rounded-xl bg-emerald-50/70 border border-emerald-200/70 flex items-center justify-between text-[11px] text-emerald-900">
          <div className="flex items-center gap-1.5">
            <Shield size={13} className="text-emerald-600 shrink-0" />
            <span>
              <strong>Zero-Transmission Boundary:</strong> Files are stored locally on persistent disk and are never uploaded to AI providers.
            </span>
          </div>
          <span className="text-[10px] text-emerald-700 font-medium shrink-0 flex items-center gap-1">
            <HardDrive size={11} />
            Persistent Disk Storage
          </span>
        </div>
      </div>

      {/* Breadcrumb Navigation Bar */}
      <div className="px-4 py-2 border-b border-stone-200/80 bg-stone-50/80 flex items-center gap-1.5 text-xs text-stone-600 overflow-x-auto shrink-0">
        <button
          onClick={() => setCurrentFolderId(null)}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-stone-200/60 transition-colors cursor-pointer ${
            currentFolderId === null ? 'font-bold text-stone-900' : 'text-stone-500'
          }`}
        >
          <Home size={13} />
          <span>Root</span>
        </button>

        {currentBreadcrumbs
          .filter((crumb) => crumb.id !== null)
          .map((crumb, idx) => (
            <React.Fragment key={crumb.id || idx}>
              <ChevronRight size={12} className="text-stone-400 shrink-0" />
              <button
                onClick={() => setCurrentFolderId(crumb.id)}
                className={`px-1.5 py-0.5 rounded hover:bg-stone-200/60 transition-colors cursor-pointer truncate max-w-[150px] ${
                  crumb.id === currentFolderId ? 'font-bold text-indigo-700 bg-indigo-50/70' : 'text-stone-600'
                }`}
                title={crumb.name}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
      </div>

      {/* Search and Filters Bar */}
      <div className="px-4 py-2.5 border-b border-stone-200/80 flex items-center justify-between gap-3 bg-white shrink-0">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search folders and files..."
            className="w-full pl-7 pr-7 py-1 text-xs bg-stone-100 focus:bg-white rounded-lg border border-stone-200/80 focus:border-indigo-500 focus:outline-none transition-all"
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

        {/* Filter Pills */}
        <div className="flex items-center gap-1 text-[11px] font-medium">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              typeFilter === 'all'
                ? 'bg-stone-900 text-white font-semibold'
                : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
            }`}
          >
            All ({folders.length + files.length})
          </button>
          <button
            onClick={() => setTypeFilter('folders')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              typeFilter === 'folders'
                ? 'bg-amber-600 text-white font-semibold'
                : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
            }`}
          >
            Folders ({folders.length})
          </button>
          <button
            onClick={() => setTypeFilter('pdf')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              typeFilter === 'pdf'
                ? 'bg-rose-600 text-white font-semibold'
                : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
            }`}
          >
            PDF ({pdfCount})
          </button>
          <button
            onClick={() => setTypeFilter('md')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              typeFilter === 'md'
                ? 'bg-indigo-600 text-white font-semibold'
                : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
            }`}
          >
            MD ({mdCount})
          </button>
          <button
            onClick={() => setTypeFilter('txt')}
            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              typeFilter === 'txt'
                ? 'bg-stone-700 text-white font-semibold'
                : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
            }`}
          >
            TXT ({txtCount})
          </button>
        </div>
      </div>

      {/* Folders and Files List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filteredFolders.length === 0 && filteredFiles.length === 0 ? (
          <div className="text-center py-12 text-xs text-stone-400 flex flex-col items-center gap-2">
            <Paperclip size={22} className="text-stone-300" />
            <span>
              {searchQuery
                ? `No items matching "${searchQuery}"`
                : 'This folder is empty. Upload files, folders, or create a new subfolder above.'}
            </span>
          </div>
        ) : (
          <>
            {/* Render Folders First */}
            {filteredFolders.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center justify-between p-3 rounded-xl bg-amber-50/40 border border-amber-200/80 hover:border-amber-300 hover:bg-amber-50/70 transition-all group"
              >
                <div
                  onClick={() => handleFolderClick(folder)}
                  onDoubleClick={() => handleFolderDoubleClick(folder)}
                  title="Click to open • Double-click to store folder files in Chatbot"
                  className="flex items-center gap-3 min-w-0 flex-1 mr-3 cursor-pointer select-none"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
                    <Folder size={16} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-stone-900 truncate">
                        {folder.name}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                        FOLDER
                      </span>
                    </div>

                    <div className="text-[11px] text-stone-400 flex items-center gap-2 mt-0.5">
                      <span>Folder</span>
                      <span>•</span>
                      <span>{new Date(folder.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className="text-amber-800 font-medium">Click to open • Double-click to store in Chat</span>
                    </div>
                  </div>
                </div>

                {/* Folder Action Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      storeFolderInChat(folder);
                    }}
                    className="p-1.5 text-stone-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                    title="Store all folder files in Chatbot conversation"
                  >
                    <MessageSquarePlus size={15} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFolder(folder.id, folder.name);
                    }}
                    className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete folder and contents"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}

            {/* Render Files */}
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200/90 hover:border-indigo-300 hover:shadow-xs transition-all group"
              >
                <div
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    storeFileInChat(file);
                  }}
                  title="Double-click to store in Chatbot • Or click preview icon"
                  className="flex items-center gap-3 min-w-0 flex-1 mr-3 cursor-pointer select-none"
                >
                  <div className="w-8 h-8 rounded-lg bg-stone-50 border border-stone-200/70 flex items-center justify-center shrink-0">
                    {getFileIcon(file.name, file.type)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-stone-900 truncate">
                        {file.name}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-stone-100 text-stone-600">
                        {getFileTypeLabel(file.name)}
                      </span>
                    </div>

                    <div className="text-[11px] text-stone-400 flex items-center gap-2 mt-0.5">
                      <span className="font-medium text-stone-600">{formatFileSize(file.size)}</span>
                      <span>•</span>
                      <span>{new Date(file.uploadedAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className="text-indigo-600 font-medium">
                        Double-click to store in Chatbot
                      </span>
                    </div>
                  </div>
                </div>

                {/* File Action Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Chat with file button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      storeFileInChat(file);
                    }}
                    className="p-1.5 text-stone-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                    title="Store file in Chatbot conversation"
                  >
                    <MessageSquarePlus size={15} />
                  </button>

                  {/* Preview Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewFile(file);
                    }}
                    className="p-1.5 text-stone-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                    title="Preview file"
                  >
                    <Eye size={15} />
                  </button>

                  {/* Download Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadFile(file.id, file.name);
                    }}
                    className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                    title="Download stream from disk"
                  >
                    <Download size={15} />
                  </button>

                  {/* Delete Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(file.id, file.name);
                    }}
                    className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete file from disk"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* File Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        isOpen={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        onDelete={(id) => deleteFile(id)}
      />
    </div>
  );
};
