import {
  Cloud,
  Cpu,
  FileText,
  HardDrive,
  Lock,
  Menu,
  MessageSquare,
  PanelRight,
  Paperclip,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import React from 'react';
import { usePrivacy } from '../../context/PrivacyContext';
import { useProjects } from '../../context/ProjectContext';
import { Badge } from '../common/Badge';
import { ProfileMenu } from './ProfileMenu';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  isWorkspaceOpen: boolean;
  onToggleWorkspace: () => void;
  onToggleMobileSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenSearch,
  isWorkspaceOpen,
  onToggleWorkspace,
  onToggleMobileSidebar,
}) => {
  const {
    storageMode,
    lockVault,
    isVaultLocked,
    aiEngine,
    setAiEngine,
    geminiServerStatus,
  } = usePrivacy();
  const { activeProject, activeConversation, activeTab, setActiveTab } = useProjects();

  return (
    <header className="h-14 border-b border-stone-200/80 bg-white/90 backdrop-blur-md px-4 flex items-center justify-between z-30 shrink-0">
      {/* Left: Mobile hamburger & breadcrumbs */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
          title="Open Sidebar"
        >
          <Menu size={18} />
        </button>

        {/* Project Breadcrumb */}
        {activeProject ? (
          <div className="flex items-center gap-2 text-xs min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
              style={{ backgroundColor: activeProject.colorTag }}
            />
            <span className="font-semibold text-stone-900 truncate max-w-[130px] sm:max-w-[180px]">
              {activeProject.name}
            </span>
            {activeConversation && (
              <>
                <span className="text-stone-300">/</span>
                <span className="text-stone-500 font-medium truncate max-w-[120px] sm:max-w-[200px]">
                  {activeConversation.title}
                </span>
              </>
            )}
          </div>
        ) : (
          <span className="text-xs text-stone-400 italic">No project active</span>
        )}
      </div>

      {/* Center Tabs: Chat / Notes / Files (Mobile & Tablet quick switch) */}
      <div className="hidden sm:flex items-center p-0.5 bg-stone-100/90 rounded-lg border border-stone-200/60">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
            activeTab === 'chat'
              ? 'bg-white text-stone-900 shadow-xs font-semibold'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <MessageSquare size={13} className={activeTab === 'chat' ? 'text-indigo-600' : 'text-stone-400'} />
          <span>Chat</span>
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
            activeTab === 'notes'
              ? 'bg-white text-stone-900 shadow-xs font-semibold'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <FileText size={13} className={activeTab === 'notes' ? 'text-indigo-600' : 'text-stone-400'} />
          <span>Notes</span>
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
            activeTab === 'files'
              ? 'bg-white text-stone-900 shadow-xs font-semibold'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <Paperclip size={13} className={activeTab === 'files' ? 'text-indigo-600' : 'text-stone-400'} />
          <span>Files</span>
        </button>
      </div>

      {/* Right Controls & Privacy Indicators */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* AI Engine Switcher (Google Gemini vs Local Mock) */}
        <div className="hidden lg:flex items-center bg-stone-100/90 rounded-lg p-0.5 border border-stone-200/60 text-xs">
          <button
            onClick={() => setAiEngine('gemini')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
              aiEngine !== 'mock'
                ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
            title="Google Gemini Cloud AI (Official Gemini API via privacy backend)"
          >
            <Sparkles size={11} className={aiEngine !== 'mock' ? 'text-indigo-600' : 'text-stone-400'} />
            <span>Google Gemini</span>
          </button>
          <button
            onClick={() => setAiEngine('mock')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
              aiEngine === 'mock'
                ? 'bg-white text-stone-800 shadow-xs font-semibold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
            title="Local Mock Engine (Offline, 0 B network outbound)"
          >
            <Cpu size={11} className={aiEngine === 'mock' ? 'text-emerald-600' : 'text-stone-400'} />
            <span>Local Mock</span>
          </button>
        </div>

        {/* Dynamic Outbound Network Privacy Badge */}
        {aiEngine !== 'mock' ? (
          <Badge
            variant={geminiServerStatus.isOnline && geminiServerStatus.geminiConfigured ? 'indigo' : 'amber'}
            size="sm"
            icon={<Cloud size={11} />}
            className="hidden md:inline-flex cursor-pointer"
            onClick={onOpenSettings}
            title={
              geminiServerStatus.isOnline
                ? geminiServerStatus.geminiConfigured
                  ? `Cloud AI: Minimal prompt context transmitted to Google Gemini (${geminiServerStatus.model}). Files & notes stay strictly local.`
                  : 'Backend server is running, but GEMINI_API_KEY is missing in server/.env'
                : 'Backend server is offline (run: npm run server). Click to inspect settings.'
            }
          >
            {geminiServerStatus.isOnline && geminiServerStatus.geminiConfigured
              ? 'Google Gemini'
              : geminiServerStatus.isOnline
              ? 'Key Missing'
              : 'Server Offline'}
          </Badge>
        ) : (
          <Badge
            variant="emerald"
            size="sm"
            icon={<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
            className="hidden md:inline-flex cursor-pointer"
            onClick={() => setAiEngine('gemini')}
            title="Prompts are processed locally with mock responses; zero network transmission. Click to switch to Google Gemini."
          >
            0 B Outbound (Offline)
          </Badge>
        )}

        {/* Storage Location Badge */}
        {storageMode === 'session_only' ? (
          <Badge
            variant="amber"
            size="sm"
            icon={<Zap size={11} />}
            className="cursor-pointer"
            onClick={onOpenSettings}
            title="Session Mode: Kept in RAM. Discarded on close."
          >
            Session RAM
          </Badge>
        ) : storageMode === 'encrypted' ? (
          <Badge
            variant="indigo"
            size="sm"
            icon={<ShieldCheck size={11} />}
            className="cursor-pointer"
            onClick={onOpenSettings}
            title="Encrypted Local Vault: Protected with client-side AES-GCM 256-bit encryption"
          >
            Encrypted Vault
          </Badge>
        ) : (
          <Badge
            variant="indigo"
            size="sm"
            icon={<HardDrive size={11} />}
            className="cursor-pointer"
            onClick={onOpenSettings}
            title="Local Persistence: Stored in your browser IndexedDB via Dexie (Survives Restarts)."
          >
            IndexedDB (Local)
          </Badge>
        )}

        {/* Lock Button for Encrypted Mode */}
        {storageMode === 'encrypted' && !isVaultLocked && (
          <button
            onClick={lockVault}
            title="Lock Workspace (Clear in-memory key)"
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors cursor-pointer"
          >
            <Lock size={12} className="text-stone-600" />
            <span className="hidden sm:inline">Lock</span>
          </button>
        )}

        {/* Search Trigger */}
        <button
          onClick={onOpenSearch}
          className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
          title="Search workspace (Ctrl + K)"
        >
          <Search size={16} />
        </button>

        {/* Workspace Panel Toggle (side-by-side mode) */}
        <button
          onClick={onToggleWorkspace}
          className={`hidden lg:inline-flex p-1.5 rounded-lg transition-colors cursor-pointer ${
            isWorkspaceOpen
              ? 'text-indigo-600 bg-indigo-50 border border-indigo-200/60'
              : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
          }`}
          title="Toggle Split Workspace Drawer"
        >
          <PanelRight size={16} />
        </button>

        {/* Privacy Center Trigger */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
          title="Privacy Center & Storage Settings"
        >
          <Settings size={16} />
        </button>

        {/* Signed-in Google account: profile, switch/add account, log out */}
        <ProfileMenu />
      </div>
    </header>
  );
};
