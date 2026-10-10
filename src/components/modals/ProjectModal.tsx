import React, { useEffect, useState } from 'react';
import { useProjects } from '../../context/ProjectContext';
import { formatRelativeTime } from '../../utils/timeFormatters';
import { Button } from '../common/Button';
import { ConfirmModal } from '../common/ConfirmModal';
import { Modal } from '../common/Modal';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  editProjectId?: string | null;
}

const COLOR_OPTIONS = [
  '#4f46e5', // Indigo
  '#059669', // Emerald
  '#d97706', // Amber
  '#db2777', // Pink
  '#7c3aed', // Purple
  '#0891b2', // Cyan
  '#ea580c', // Orange
  '#475569', // Slate
];

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  editProjectId,
}) => {
  const { projects, conversations, notes, files, createProject, updateProject, deleteProject } = useProjects();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [colorTag, setColorTag] = useState(COLOR_OPTIONS[0]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const existing = projects.find((p) => p.id === editProjectId);
  const projectConvs = existing ? conversations.filter((c) => c.projectId === existing.id) : [];
  const projectNotes = existing ? notes.filter((n) => n.projectId === existing.id) : [];
  const projectFiles = existing ? files.filter((f) => f.projectId === existing.id) : [];

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setDescription(existing.description || '');
      setColorTag(existing.colorTag);
    } else {
      setName('');
      setDescription('');
      setColorTag(COLOR_OPTIONS[0]);
    }
  }, [existing, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (existing) {
      await updateProject(existing.id, {
        name: name.trim(),
        description: description.trim(),
        colorTag,
      });
    } else {
      await createProject(name.trim(), description.trim(), colorTag);
    }
    onClose();
  };

  const handleConfirmDelete = async () => {
    if (existing) {
      await deleteProject(existing.id);
      setShowDeleteConfirm(false);
      onClose();
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={existing ? 'Edit Project Folder' : 'New Project Folder'}
        description="Organize your private chats, notes, and research documents into dedicated workspaces."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-stone-800">
                Folder Name <span className="text-red-500">*</span>
              </label>
              {existing && (
                <span className="text-[10px] text-stone-400">
                  Updated {formatRelativeTime(existing.updatedAt)}
                </span>
              )}
            </div>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Master Thesis, Privacy Research, Clinical Study..."
              className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-800 mb-1">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief scope, subject matter, or objectives..."
              className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-indigo-500 focus:bg-white resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-800 mb-1.5">
              Color Badge
            </label>
            <div className="flex items-center gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColorTag(c)}
                  style={{ backgroundColor: c }}
                  className={`w-6 h-6 rounded-full transition-transform cursor-pointer shadow-2xs ${
                    colorTag === c ? 'ring-2 ring-stone-900 ring-offset-2 scale-110' : 'hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>

          {existing && (
            <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/60 text-[11px] text-stone-500 flex items-center justify-between">
              <span>{projectConvs.length} conversations</span>
              <span>{projectNotes.length} notes</span>
              <span>{projectFiles.length} files</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-stone-200">
            {existing && !existing.isPersonalWorkspace ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-xs text-red-600 hover:text-red-700 font-medium transition-colors cursor-pointer"
              >
                Delete Folder
              </button>
            ) : existing?.isPersonalWorkspace ? (
              <span className="text-[11px] text-stone-400 italic">
                Default workspace cannot be deleted
              </span>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" disabled={!name.trim()}>
                {existing ? 'Save Changes' : 'Create Folder'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Confirmation Modal for Project Deletion */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Project Folder"
        message={`Are you sure you want to delete "${existing?.name}"? This will permanently delete all ${projectConvs.length} conversations, notes, and ${projectFiles.length} files inside this folder.`}
        confirmText="Delete Project"
        cancelText="Cancel"
        isDestructive={true}
      />
    </>
  );
};
