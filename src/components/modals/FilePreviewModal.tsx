import {
  Code,
  Download,
  Eye,
  FileCode,
  FileText,
  Lock,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import type { ProjectFile } from '../../types';
import { formatFileSize } from '../../utils/fileValidators';

interface FilePreviewModalProps {
  file: ProjectFile | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  file,
  isOpen,
  onClose,
  onDelete,
}) => {
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered');

  if (!isOpen || !file) return null;

  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf');
  const isMarkdown =
    file.name.toLowerCase().endsWith('.md') ||
    file.name.toLowerCase().endsWith('.markdown') ||
    file.type.includes('markdown');

  const handleDownload = () => {
    if (!file.dataUrl) return;
    const a = document.createElement('a');
    a.href = file.dataUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to permanently delete "${file.name}"?`)) {
      onDelete(file.id);
      onClose();
    }
  };

  // Safe markdown line renderer preventing XSS
  const renderSafeMarkdown = (content: string) => {
    const lines = content.split('\n');
    return (
      <div className="space-y-2 text-xs leading-relaxed text-stone-800">
        {lines.map((line, idx) => {
          if (line.startsWith('# ')) {
            return (
              <h1 key={idx} className="text-lg font-bold text-stone-900 border-b border-stone-200 pb-1 mt-4">
                {line.slice(2)}
              </h1>
            );
          }
          if (line.startsWith('## ')) {
            return (
              <h2 key={idx} className="text-base font-bold text-stone-900 border-b border-stone-100 pb-0.5 mt-3">
                {line.slice(3)}
              </h2>
            );
          }
          if (line.startsWith('### ')) {
            return (
              <h3 key={idx} className="text-sm font-semibold text-stone-900 mt-2">
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

  const previewContent = file.textPreview || (file.dataUrl?.startsWith('data:text') ? atob(file.dataUrl.split(',')[1] || '') : '');

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="px-5 py-3.5 border-b border-stone-200/80 flex items-center justify-between bg-stone-50/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0 mr-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
              {isPdf ? (
                <FileText size={16} className="text-rose-600" />
              ) : isMarkdown ? (
                <FileCode size={16} className="text-indigo-600" />
              ) : (
                <FileText size={16} className="text-stone-600" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-stone-900 truncate" title={file.name}>
                {file.name}
              </h3>
              <div className="text-[11px] text-stone-500 flex items-center gap-2 mt-0.5">
                <span>{formatFileSize(file.size)}</span>
                <span>•</span>
                <span>{isPdf ? 'PDF Document' : isMarkdown ? 'Markdown Document' : 'Plain Text'}</span>
                <span>•</span>
                <span>Imported {new Date(file.uploadedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* View Mode Toggle for Markdown */}
            {isMarkdown && (
              <div className="flex items-center bg-stone-200/80 rounded-lg p-0.5 text-xs mr-2">
                <button
                  onClick={() => setViewMode('rendered')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    viewMode === 'rendered'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Eye size={12} className="inline mr-1" />
                  Rendered
                </button>
                <button
                  onClick={() => setViewMode('raw')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    viewMode === 'raw'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Code size={12} className="inline mr-1" />
                  Raw Source
                </button>
              </div>
            )}

            {/* Download Button */}
            <button
              onClick={handleDownload}
              className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-200/70 rounded-lg transition-colors cursor-pointer"
              title="Download/Export File"
            >
              <Download size={16} />
            </button>

            {/* Delete Button */}
            <button
              onClick={handleDelete}
              className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              title="Delete File"
            >
              <Trash2 size={16} />
            </button>

            <div className="w-px h-5 bg-stone-200 mx-1" />

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
              title="Close Preview"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Preview Viewer Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-white min-h-[350px]">
          {isPdf ? (
            <div className="w-full h-full min-h-[500px] flex flex-col items-center justify-center">
              {file.dataUrl ? (
                <object
                  data={file.dataUrl}
                  type="application/pdf"
                  className="w-full h-full min-h-[520px] rounded-xl border border-stone-200"
                >
                  <div className="p-8 text-center space-y-3">
                    <p className="text-xs text-stone-600">
                      Your browser does not support inline PDF rendering.
                    </p>
                    <button
                      onClick={handleDownload}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download size={14} />
                      <span>Download PDF to View</span>
                    </button>
                  </div>
                </object>
              ) : (
                <div className="text-center text-xs text-stone-500">
                  PDF payload unavailable for direct preview.
                </div>
              )}
            </div>
          ) : isMarkdown && viewMode === 'rendered' ? (
            <div className="prose prose-stone prose-xs max-w-none">
              {previewContent ? (
                renderSafeMarkdown(previewContent)
              ) : (
                <p className="text-xs text-stone-400 italic">No text content available.</p>
              )}
            </div>
          ) : (
            <pre className="font-mono text-xs text-stone-800 leading-relaxed whitespace-pre-wrap bg-stone-50 p-4 rounded-xl border border-stone-200 overflow-x-auto">
              <code>{previewContent || 'Empty text file'}</code>
            </pre>
          )}
        </div>

        {/* Footer Bar with Security & Privacy Guarantee */}
        <div className="px-5 py-2.5 border-t border-stone-200 bg-stone-50/90 flex items-center justify-between text-[11px] text-stone-500 shrink-0">
          <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
            <Shield size={13} className="text-emerald-600" />
            <span>Local Sandbox Isolation • 0 B Outbound • Never uploaded to AI provider</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-stone-400">
              <Lock size={11} />
              <span>{file.importStatus === 'encrypted' ? 'AES-GCM Encrypted Vault' : 'Local IndexedDB Storage'}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
