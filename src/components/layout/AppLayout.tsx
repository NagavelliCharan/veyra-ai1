import React, { useState } from 'react';
import { useProjects } from '../../context/ProjectContext';
import { ChatArea } from '../chat/ChatArea';
import { GlobalSearchModal } from '../modals/GlobalSearchModal';
import { PrivacySettingsModal } from '../modals/PrivacySettingsModal';
import { ProjectModal } from '../modals/ProjectModal';
import { FileManager } from '../workspace/FileManager';
import { NotesEditor } from '../workspace/NotesEditor';
import { WorkspacePanel } from '../workspace/WorkspacePanel';
import { GeminiConsentModal } from '../modals/GeminiConsentModal.tsx';
import { usePrivacy } from '../../context/PrivacyContext.tsx';
import { WorkspaceLockScreen } from '../auth/WorkspaceLockScreen.tsx';
import { SignInScreen } from '../auth/SignInScreen';
import { useAuth } from '../../context/AuthContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export const AppLayout: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isConsentModalOpen,
    setIsConsentModalOpen,
    handleConsentSuccess,
  } = useProjects();
  const { storageMode, isVaultConfigured, isVaultLocked } = usePrivacy();
  const { currentUser } = useAuth();

  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  // Require a signed-in Google account before showing the workspace
  if (!currentUser) {
    return <SignInScreen />;
  }

  // If in Encrypted Vault mode and locked, present the secure unlock screen
  if (storageMode === 'encrypted' && isVaultConfigured && isVaultLocked) {
    return <WorkspaceLockScreen />;
  }

  const handleOpenNewProject = () => {
    setEditingProjectId(null);
    setIsProjectModalOpen(true);
  };

  const handleEditProject = (projectId: string) => {
    setEditingProjectId(projectId);
    setIsProjectModalOpen(true);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#fcfbf9] text-stone-900 overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSearch={() => setIsSearchOpen(true)}
        isWorkspaceOpen={isWorkspaceOpen}
        onToggleWorkspace={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
      />

      {/* Main Responsive Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar */}
        <Sidebar
          onOpenNewProject={handleOpenNewProject}
          onEditProject={handleEditProject}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Central Work Area */}
        <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-[#fcfbf9]">
          {/* Main View Router based on top tab */}
          {activeTab === 'chat' && <ChatArea />}
          {activeTab === 'notes' && <NotesEditor />}
          {activeTab === 'files' && <FileManager />}
        </main>

        {/* Desktop Split-Workspace Drawer (if user opens side-by-side mode while in chat) */}
        {activeTab === 'chat' && (
          <WorkspacePanel
            isOpen={isWorkspaceOpen}
            onClose={() => setIsWorkspaceOpen(false)}
          />
        )}
      </div>

      {/* Modals & Overlays */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        editProjectId={editingProjectId}
      />

      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onOpenWorkspaceTab={(tab) => {
          setActiveTab(tab);
        }}
      />

      <PrivacySettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <GeminiConsentModal
        isOpen={isConsentModalOpen}
        onClose={() => setIsConsentModalOpen(false)}
        onConsentSuccess={handleConsentSuccess}
      />
    </div>
  );
};
