import React, { useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Cpu,
  Download,
  Eye,
  HardDrive,
  Info,
  KeyRound,
  Lock,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  Zap,
} from 'lucide-react';
import { usePrivacy } from '../../context/PrivacyContext.tsx';
import { useProjects } from '../../context/ProjectContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { Button } from '../common/Button.tsx';
import { ConfirmModal } from '../common/ConfirmModal.tsx';
import { Modal } from '../common/Modal.tsx';
import { SetupVaultModal } from './SetupVaultModal.tsx';
import { StorageMigrationModal } from './StorageMigrationModal.tsx';
import type { StorageMode } from '../../types/index.ts';

interface PrivacySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabKey = 'overview' | 'matrix' | 'storage' | 'ai' | 'actions' | 'limitations';

export const PrivacySettingsModal: React.FC<PrivacySettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    storageMode,
    migrateStorageMode,
    clearAllData,
    storageQuota,
    requestPersistentStorage,
    isVaultConfigured,
    isVaultLocked,
    lockVault,
    aiEngine,
    setAiEngine,
    hasGeminiConsent,
    grantGeminiConsent,
    geminiServerStatus,
    checkGeminiServer,
  } = usePrivacy();

  const { projects, conversations, messages, notes, files } = useProjects();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [isRequestingPersist, setIsRequestingPersist] = useState(false);
  const [isSetupVaultOpen, setIsSetupVaultOpen] = useState(false);
  const [isCheckingServer, setIsCheckingServer] = useState(false);

  // Migration modal state
  const [pendingTargetMode, setPendingTargetMode] = useState<StorageMode | null>(null);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const [includeFilePayloads, setIncludeFilePayloads] = useState(false);

  const handleExportJson = () => {
    const backupData = {
      exportedAt: new Date().toISOString(),
      app: 'Veyra AI',
      storageMode,
      securityNotice:
        'UNENCRYPTED BACKUP: This file contains decrypted plaintext data exported by the user. Anyone with this file can read its contents without your passphrase. Store it securely.',
      projects,
      conversations,
      messages,
      notes,
      files: files.map((f) => ({
        ...f,
        dataUrl: includeFilePayloads ? f.dataUrl : undefined,
      })),
    };

    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `privy_ai_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Decrypted JSON backup exported successfully', 'success');
  };

  const handleRequestPersist = async () => {
    setIsRequestingPersist(true);
    const granted = await requestPersistentStorage();
    setIsRequestingPersist(false);
    if (granted) {
      showToast('Persistent browser storage granted by browser', 'success');
    } else {
      showToast('Persistent storage was not granted by browser', 'info');
    }
  };

  const handleRefreshServer = async () => {
    setIsCheckingServer(true);
    await checkGeminiServer();
    setIsCheckingServer(false);
    showToast('Backend server connection refreshed', 'info');
  };

  const handleModeCardClick = (mode: StorageMode) => {
    if (mode === storageMode) return;

    if (mode === 'encrypted' && !isVaultConfigured) {
      setIsSetupVaultOpen(true);
      return;
    }

    setPendingTargetMode(mode);
  };

  const handleExecuteMigration = async (options: {
    passphrase?: string;
    decryptExisting?: boolean;
    persistSessionData?: boolean;
  }): Promise<boolean> => {
    if (!pendingTargetMode) return false;

    const result = await migrateStorageMode(pendingTargetMode, options);
    if (result.success) {
      showToast(`Switched storage mode to ${pendingTargetMode.replace('_', ' ')}`, 'success');
      setPendingTargetMode(null);
      return true;
    } else {
      showToast(result.error || 'Storage migration failed', 'error');
      return false;
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Veyra AI Privacy Center"
        description="Verify client-side storage modes, inspect cryptographic guarantees, control external AI boundaries, and audit data sovereign controls."
        maxWidth="xl"
      >
        {/* Navigation Tabs */}
        <div className="flex border-b border-stone-200 mb-4 gap-1 overflow-x-auto scrollbar-none pb-0.5">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Shield size={13} />
            <span>Live Audit</span>
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activeTab === 'matrix'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Eye size={13} />
            <span>Data Boundary Matrix</span>
          </button>
          <button
            onClick={() => setActiveTab('storage')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activeTab === 'storage'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <HardDrive size={13} />
            <span>Storage & Migration</span>
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activeTab === 'ai'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Sparkles size={13} />
            <span>AI Boundaries</span>
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activeTab === 'actions'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <KeyRound size={13} />
            <span>Export & Wipe</span>
          </button>
          <button
            onClick={() => setActiveTab('limitations')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activeTab === 'limitations'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Info size={13} />
            <span>Threat Model</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: OVERVIEW & LIVE AUDIT DASHBOARD */}
        {/* ========================================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Card 1: Storage Mode */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/90 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                    Storage Mode
                  </span>
                  <div className="flex items-center gap-1.5 mt-1 font-bold text-xs text-stone-900">
                    {storageMode === 'encrypted' && (
                      <ShieldCheck size={14} className="text-indigo-600" />
                    )}
                    {storageMode === 'local_storage' && (
                      <HardDrive size={14} className="text-stone-600" />
                    )}
                    {storageMode === 'session_only' && (
                      <Zap size={14} className="text-amber-600" />
                    )}
                    <span>
                      {storageMode === 'encrypted'
                        ? 'Encrypted Vault'
                        : storageMode === 'local_storage'
                        ? 'Local Persistence'
                        : 'Session-Only (RAM)'}
                    </span>
                  </div>
                </div>
                <div className="text-[10px] text-stone-500 mt-2 font-mono">
                  {storageMode === 'encrypted'
                    ? 'AES-GCM 256 + PBKDF2'
                    : storageMode === 'local_storage'
                    ? 'IndexedDB via Dexie'
                    : 'Volatile RAM Only'}
                </div>
              </div>

              {/* Card 2: Lock Status */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/90 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                    Workspace Lock
                  </span>
                  <div className="flex items-center gap-1.5 mt-1 font-bold text-xs">
                    {storageMode === 'encrypted' ? (
                      !isVaultLocked ? (
                        <>
                          <Unlock size={14} className="text-emerald-600" />
                          <span className="text-emerald-700">Unlocked in RAM</span>
                        </>
                      ) : (
                        <>
                          <Lock size={14} className="text-stone-600" />
                          <span className="text-stone-700">Locked on Disk</span>
                        </>
                      )
                    ) : (
                      <>
                        <CheckCircle2 size={14} className="text-stone-500" />
                        <span className="text-stone-700">Not Password-Locked</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-stone-500 mt-2">
                  {storageMode === 'encrypted' && !isVaultLocked ? (
                    <button
                      onClick={lockVault}
                      className="text-stone-900 hover:text-indigo-600 font-semibold cursor-pointer underline text-[10px]"
                    >
                      Lock Workspace Now
                    </button>
                  ) : storageMode === 'encrypted' ? (
                    'Ciphertext stored; 0 keys in RAM'
                  ) : (
                    'Encryption not active'
                  )}
                </div>
              </div>

              {/* Card 3: AI Provider */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/90 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                    AI Reasoning Engine
                  </span>
                  <div className="flex items-center gap-1.5 mt-1 font-bold text-xs text-stone-900">
                    {aiEngine !== 'mock' ? (
                      <Sparkles size={14} className="text-indigo-600" />
                    ) : (
                      <Cpu size={14} className="text-emerald-600" />
                    )}
                    <span>
                      {aiEngine !== 'mock' ? 'Groq Cloud AI' : 'Local Mock Engine'}
                    </span>
                  </div>
                </div>
                <div className="text-[10px] text-stone-500 mt-2">
                  {aiEngine !== 'mock'
                    ? geminiServerStatus.isOnline
                      ? geminiServerStatus.geminiConfigured
                        ? `Online (${geminiServerStatus.model})`
                        : 'API Key Missing'
                      : 'Backend Offline'
                    : '100% Offline (0 B Outbound)'}
                </div>
              </div>

              {/* Card 4: Outbound Network State */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/90 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                    Outbound Network
                  </span>
                  <div className="flex items-center gap-1.5 mt-1 font-bold text-xs">
                    {aiEngine === 'mock' ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-emerald-700">0 B (Offline)</span>
                      </>
                    ) : hasGeminiConsent ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-indigo-700">Minimal Prompts</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-amber-700">Consent Blocked</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-stone-500 mt-2">
                  {aiEngine === 'mock'
                    ? 'No data leaves device'
                    : hasGeminiConsent
                    ? 'Active thread context only'
                    : 'HTTP 403 consent guard'}
                </div>
              </div>
            </div>

            {/* Storage Quota & Eviction Protection Card */}
            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/90 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold text-stone-900">
                  <HardDrive size={14} className="text-stone-700" />
                  <span>Browser Storage Quota & Eviction Status</span>
                </div>
                <span className="text-[11px] text-stone-500 font-mono">
                  {formatBytes(storageQuota.usageBytes)} / {formatBytes(storageQuota.quotaBytes)} (
                  {storageQuota.percentageUsed}%)
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-stone-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(1, Math.min(100, storageQuota.percentageUsed))}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1">
                <span>
                  Storage Durability:{' '}
                  {storageQuota.isPersisted ? (
                    <strong className="text-emerald-700">Persistent (Browser Protected)</strong>
                  ) : (
                    <strong className="text-stone-600">Best-Effort (May Be Evicted by OS)</strong>
                  )}
                </span>
                {!storageQuota.isPersisted && (
                  <button
                    onClick={handleRequestPersist}
                    disabled={isRequestingPersist}
                    className="text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer underline text-[11px]"
                  >
                    Request Persistent Storage API
                  </button>
                )}
              </div>
            </div>

            {/* Quick Action Bar */}
            <div className="p-3 rounded-xl bg-stone-100/70 border border-stone-200/70 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-stone-600 font-medium">
                Sovereign Workspace Controls:
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Download size={13} />}
                  onClick={handleExportJson}
                >
                  Export JSON Backup
                </Button>
                {storageMode === 'encrypted' && !isVaultLocked && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Lock size={13} />}
                    onClick={lockVault}
                  >
                    Lock Workspace
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: DATA BOUNDARY & FLOW MATRIX */}
        {/* ========================================================================= */}
        {activeTab === 'matrix' && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 text-xs text-stone-700 leading-relaxed">
              <strong>Transparent Data Boundary:</strong> Veyra AI implements strict client-side
              isolation. Review exactly which records stay on your device versus what minimal
              prompt context leaves your computer.
            </div>

            {/* Data Boundary Table */}
            <div className="border border-stone-200 rounded-xl overflow-hidden bg-white text-xs">
              <div className="grid grid-cols-12 bg-stone-100/90 font-bold text-stone-800 p-2.5 border-b border-stone-200 text-[11px]">
                <div className="col-span-4">Data Category</div>
                <div className="col-span-4">Device Storage Boundary</div>
                <div className="col-span-4">Transmitted to External AI?</div>
              </div>

              {/* Row 1: Chat Messages */}
              <div className="grid grid-cols-12 p-2.5 border-b border-stone-100 items-center">
                <div className="col-span-4 font-semibold text-stone-900">
                  Active Chat Messages
                </div>
                <div className="col-span-4 text-stone-600 text-[11px]">
                  Stored locally in IndexedDB (encrypted in Vault) or RAM
                </div>
                <div className="col-span-4 text-[11px]">
                  {aiEngine === 'mock' ? (
                    <span className="text-emerald-700 font-medium">✕ Never (0 B Offline)</span>
                  ) : (
                    <span className="text-stone-800 font-medium">
                      ✓ Max 6 recent messages in active thread (IF consented)
                    </span>
                  )}
                </div>
              </div>

              {/* Row 2: Research Notes */}
              <div className="grid grid-cols-12 p-2.5 border-b border-stone-100 items-center bg-stone-50/40">
                <div className="col-span-4 font-semibold text-stone-900">
                  Project Notes & Markdown
                </div>
                <div className="col-span-4 text-stone-600 text-[11px]">
                  Stored strictly on device in IndexedDB (encrypted in Vault)
                </div>
                <div className="col-span-4 text-emerald-700 font-semibold text-[11px]">
                  ✕ Strictly Never Transmitted (0 B)
                </div>
              </div>

              {/* Row 3: Uploaded Files */}
              <div className="grid grid-cols-12 p-2.5 border-b border-stone-100 items-center">
                <div className="col-span-4 font-semibold text-stone-900">
                  Imported Files & Documents
                </div>
                <div className="col-span-4 text-stone-600 text-[11px]">
                  Stored locally as Data URLs (encrypted in Vault)
                </div>
                <div className="col-span-4 text-emerald-700 font-semibold text-[11px]">
                  ✕ Strictly Never Transmitted (0 B)
                </div>
              </div>

              {/* Row 4: Passphrases & Keys */}
              <div className="grid grid-cols-12 p-2.5 border-b border-stone-100 items-center bg-stone-50/40">
                <div className="col-span-4 font-semibold text-stone-900">
                  Passphrase & Encryption Keys
                </div>
                <div className="col-span-4 text-stone-600 text-[11px]">
                  Held strictly in volatile RAM while unlocked; 0 disk trace
                </div>
                <div className="col-span-4 text-emerald-700 font-semibold text-[11px]">
                  ✕ Strictly Never Transmitted (0 B)
                </div>
              </div>

              {/* Row 5: Other Projects & History */}
              <div className="grid grid-cols-12 p-2.5 border-b border-stone-100 items-center">
                <div className="col-span-4 font-semibold text-stone-900">
                  Other Project Histories
                </div>
                <div className="col-span-4 text-stone-600 text-[11px]">
                  Isolated strictly to device database
                </div>
                <div className="col-span-4 text-emerald-700 font-semibold text-[11px]">
                  ✕ Strictly Never Transmitted (0 B)
                </div>
              </div>

              {/* Row 6: Telemetry & Analytics */}
              <div className="grid grid-cols-12 p-2.5 items-center bg-stone-50/40">
                <div className="col-span-4 font-semibold text-stone-900">
                  User Tracking & Analytics
                </div>
                <div className="col-span-4 text-stone-600 text-[11px]">
                  Zero tracking cookies or session replay tools
                </div>
                <div className="col-span-4 text-emerald-700 font-semibold text-[11px]">
                  ✕ 0 B (No Telemetry Exists)
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: STORAGE MODES & SAFE MIGRATION */}
        {/* ========================================================================= */}
        {activeTab === 'storage' && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-900">
              <span className="font-bold block mb-0.5">Guarded Storage Mode Transitions</span>
              <p className="text-[11px] text-indigo-700 leading-relaxed">
                Switching modes never silently destroys or exposes data. Migrating between
                plaintext and encrypted vaults requires deliberate confirmation, master
                passphrases, and backup export prompts.
              </p>
            </div>

            {/* Mode Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Encrypted Vault Mode Card */}
              <div
                onClick={() => handleModeCardClick('encrypted')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  storageMode === 'encrypted'
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-2xs'
                    : 'border-stone-200 bg-stone-50/50 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck size={16} className="text-indigo-600" />
                    <span className="text-xs font-bold text-stone-900">Encrypted Vault</span>
                  </div>
                  {storageMode === 'encrypted' && (
                    <CheckCircle2 size={15} className="text-indigo-600" />
                  )}
                </div>
                <div className="text-[10px] text-indigo-700 font-semibold mb-1">
                  AES-GCM 256 + PBKDF2
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Encrypts messages, notes, titles, and file contents before saving to disk. Key
                  resides strictly in RAM.
                </p>
              </div>

              {/* Local Storage Mode Card */}
              <div
                onClick={() => handleModeCardClick('local_storage')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  storageMode === 'local_storage'
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-2xs'
                    : 'border-stone-200 bg-stone-50/50 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <HardDrive size={16} className="text-stone-700" />
                    <span className="text-xs font-bold text-stone-900">Local Persistence</span>
                  </div>
                  {storageMode === 'local_storage' && (
                    <CheckCircle2 size={15} className="text-indigo-600" />
                  )}
                </div>
                <div className="text-[10px] text-stone-600 font-semibold mb-1">
                  IndexedDB via Dexie
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Saves unencrypted records locally in browser IndexedDB. Fast access across browser
                  restarts without a password.
                </p>
              </div>

              {/* Session-Only Mode Card */}
              <div
                onClick={() => handleModeCardClick('session_only')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  storageMode === 'session_only'
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-2xs'
                    : 'border-stone-200 bg-stone-50/50 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Zap size={16} className="text-amber-600" />
                    <span className="text-xs font-bold text-stone-900">Session-Only</span>
                  </div>
                  {storageMode === 'session_only' && (
                    <CheckCircle2 size={15} className="text-indigo-600" />
                  )}
                </div>
                <div className="text-[10px] text-amber-700 font-semibold mb-1">
                  Volatile RAM Only
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Stores data strictly in volatile memory. Closing or refreshing the page purges all
                  records with zero disk trace.
                </p>
              </div>
            </div>

            {/* Quota Progress */}
            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-800">Allocated Browser Quota</span>
                <span className="text-[11px] text-stone-500">
                  {formatBytes(storageQuota.usageBytes)} of {formatBytes(storageQuota.quotaBytes)} (
                  {storageQuota.percentageUsed}%)
                </span>
              </div>
              <div className="w-full bg-stone-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(1, Math.min(100, storageQuota.percentageUsed))}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: AI BOUNDARIES & GROQ CLOUD CONSENT */}
        {/* ========================================================================= */}
        {activeTab === 'ai' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-stone-900 block mb-2">
                Active Reasoning Engine
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Groq Cloud Card */}
                <div
                  onClick={() => setAiEngine('groq')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    aiEngine !== 'mock'
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-2xs'
                      : 'border-stone-200 bg-stone-50/50 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={16} className="text-indigo-600" />
                      <span className="text-xs font-bold text-stone-900">
                        Groq Cloud AI (LPU)
                      </span>
                    </div>
                    {aiEngine !== 'mock' && (
                      <CheckCircle2 size={15} className="text-indigo-600" />
                    )}
                  </div>
                  <div className="text-[10px] text-indigo-700 font-semibold mb-1">
                    Model: {geminiServerStatus.model || 'llama-3.3-70b-versatile'}
                  </div>
                  <p className="text-[11px] text-stone-500 leading-relaxed">
                    Ultra-fast LPU inference via secure Node.js backend. Strict data minimization:
                    transmits only active thread messages.
                  </p>
                </div>

                {/* Local Mock Card */}
                <div
                  onClick={() => setAiEngine('mock')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    aiEngine === 'mock'
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-2xs'
                      : 'border-stone-200 bg-stone-50/50 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Cpu size={16} className="text-emerald-600" />
                      <span className="text-xs font-bold text-stone-900">
                        Local Mock Engine
                      </span>
                    </div>
                    {aiEngine === 'mock' && (
                      <CheckCircle2 size={15} className="text-indigo-600" />
                    )}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-semibold mb-1">
                    100% Offline • 0 B Outbound
                  </div>
                  <p className="text-[11px] text-stone-500 leading-relaxed">
                    Zero network requests. Heuristic responses generated purely in-browser. Ideal for
                    air-gapped or confidential work.
                  </p>
                </div>
              </div>
            </div>

            {/* Backend Server Status Box */}
            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/90 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server size={15} className="text-stone-700" />
                  <span className="text-xs font-bold text-stone-900">
                    Local Node.js Proxy Status (:3001)
                  </span>
                </div>
                <button
                  onClick={handleRefreshServer}
                  disabled={isCheckingServer}
                  className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                >
                  <RefreshCw size={12} className={isCheckingServer ? 'animate-spin' : ''} />
                  <span>Refresh Status</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                <div className="p-2 rounded-lg bg-white border border-stone-200/70">
                  <span className="text-stone-400 block text-[10px]">Server Connection</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        geminiServerStatus.isOnline ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    />
                    <strong
                      className={
                        geminiServerStatus.isOnline ? 'text-stone-800' : 'text-rose-600'
                      }
                    >
                      {geminiServerStatus.isOnline ? 'Online (:3001)' : 'Offline'}
                    </strong>
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-white border border-stone-200/70">
                  <span className="text-stone-400 block text-[10px]">Server GROQ_API_KEY</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        geminiServerStatus.geminiConfigured ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                    />
                    <strong
                      className={
                        geminiServerStatus.geminiConfigured
                          ? 'text-stone-800'
                          : 'text-amber-600'
                      }
                    >
                      {geminiServerStatus.geminiConfigured ? 'Configured' : 'Missing in server/.env'}
                    </strong>
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-white border border-stone-200/70">
                  <span className="text-stone-400 block text-[10px]">Active Model</span>
                  <strong className="text-stone-800 block mt-0.5 truncate font-mono text-[10px]">
                    {geminiServerStatus.model || 'llama-3.3-70b-versatile'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Consent Toggle Box */}
            <div className="p-3.5 rounded-xl border border-stone-200/90 bg-stone-50/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-stone-900">Explicit User Consent Boundary</h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    The backend strictly rejects unauthorized prompts with HTTP 403 unless explicit
                    consent is provided.
                  </p>
                </div>
                <button
                  onClick={() => grantGeminiConsent(!hasGeminiConsent)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    hasGeminiConsent
                      ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {hasGeminiConsent ? 'Revoke Consent' : 'Grant Consent'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: SOVEREIGN ACTIONS (EXPORT, LOCK & WIPE) */}
        {/* ========================================================================= */}
        {activeTab === 'actions' && (
          <div className="space-y-4">
            {/* Lock Workspace Card */}
            {storageMode === 'encrypted' && (
              <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/40 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-stone-900">Lock Encrypted Workspace</h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Immediately purges the in-memory CryptoKey from browser RAM and locks storage.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Lock size={13} />}
                  onClick={lockVault}
                  disabled={isVaultLocked}
                >
                  {isVaultLocked ? 'Workspace Locked' : 'Lock Workspace'}
                </Button>
              </div>
            )}

            {/* Export Section */}
            <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-stone-900">Export Decrypted Backup (JSON)</h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Download a portable JSON archive of all projects, conversations, and notes.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Download size={13} />}
                  onClick={handleExportJson}
                >
                  Export JSON
                </Button>
              </div>

              <div className="pt-2 border-t border-stone-200/70 flex items-center justify-between">
                <label className="flex items-center gap-2 text-[11px] text-stone-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeFilePayloads}
                    onChange={(e) => setIncludeFilePayloads(e.target.checked)}
                    className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Include base64 file payloads (may increase backup file size)</span>
                </label>
              </div>

              <div className="p-2 rounded-lg bg-amber-50/80 border border-amber-200/70 text-[10.5px] text-amber-800 leading-relaxed">
                ⚠️ <strong>Advisory:</strong> Exported backups contain unencrypted plaintext records. Anyone with access to this file can view its contents without your master passphrase. Store it in a secure location.
              </div>
            </div>

            {/* Panic Wipe Section */}
            <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-rose-900">Clear All Local Data (Panic Wipe)</h4>
                <p className="text-[11px] text-rose-700/80 mt-0.5">
                  Permanently deletes all IndexedDB databases, conversations, notes, files, and
                  encryption keys.
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 size={13} />}
                onClick={() => setShowClearConfirmModal(true)}
              >
                Clear All Data
              </Button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: REALISTIC THREAT MODEL & HONEST LIMITATIONS */}
        {/* ========================================================================= */}
        {activeTab === 'limitations' && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-950 font-medium">
              Veyra AI does not make marketing claims such as &quot;100% private&quot; or
              &quot;unhackable&quot;. Below is an honest audit of client-side architecture limits.
            </div>

            <div className="space-y-3 text-xs">
              {/* Limitation 1: Browser Storage Loss */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                <div className="font-bold text-stone-900 flex items-center gap-1.5">
                  <HardDrive size={14} className="text-amber-600" />
                  <span>1. Browser Storage Loss & Origin Eviction</span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  IndexedDB is not an indestructible backup. When disk space runs low, browser
                  engines can purge origin data without notice. Clearing browser history or
                  clearing site data wipes the database. Regular JSON exports are required to
                  prevent accidental loss.
                </p>
              </div>

              {/* Limitation 2: Device Compromise */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                <div className="font-bold text-stone-900 flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-rose-600" />
                  <span>2. Endpoint Device Compromise & Malware</span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Client-side AES-GCM encryption protects stored data at rest against physical
                  device theft. However, if your operating system has keyloggers, RAM scrapers, or
                  malicious browser extensions with page access, decrypted data can be intercepted
                  while the workspace is unlocked.
                </p>
              </div>

              {/* Limitation 3: AI Provider Retention */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                <div className="font-bold text-stone-900 flex items-center gap-1.5">
                  <Cloud size={14} className="text-indigo-600" />
                  <span>3. External AI Provider Retention (Groq Cloud)</span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  When Groq Cloud mode is active and consented, prompts and active thread context
                  are transmitted over TLS to Groq API servers. Prompts are subject to Groq&apos;s
                  Terms of Service and Privacy Policy. While the local Veyra AI backend logs zero prompts, Groq
                  operates under its own retention policy.
                </p>
              </div>

              {/* Limitation 4: Zero Recovery */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                <div className="font-bold text-stone-900 flex items-center gap-1.5">
                  <KeyRound size={14} className="text-stone-700" />
                  <span>4. Zero-Recovery Master Passphrase</span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  There is no centralized database, no customer support reset, and no secret escrow
                  key. If you forget your vault passphrase, all encrypted conversations and notes
                  are mathematically impossible to decrypt.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Modal Close */}
        <div className="flex justify-end pt-3 border-t border-stone-200/80 mt-4">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </Modal>

      {/* Setup Vault Modal */}
      <SetupVaultModal
        isOpen={isSetupVaultOpen}
        onClose={() => setIsSetupVaultOpen(false)}
      />

      {/* Storage Migration Guard Modal */}
      {pendingTargetMode && (
        <StorageMigrationModal
          isOpen={!!pendingTargetMode}
          onClose={() => setPendingTargetMode(null)}
          currentMode={storageMode}
          targetMode={pendingTargetMode}
          isVaultConfigured={isVaultConfigured}
          isVaultLocked={isVaultLocked}
          onConfirmMigration={handleExecuteMigration}
          onExportBackup={handleExportJson}
        />
      )}

      {/* Confirmation Dialog for Clear All Data */}
      <ConfirmModal
        isOpen={showClearConfirmModal}
        onClose={() => setShowClearConfirmModal(false)}
        onConfirm={clearAllData}
        title="Permanently Clear All Local Data?"
        message="This operation cannot be undone. All IndexedDB records, projects, conversations, notes, file metadata, and encrypted vault keys will be permanently deleted from this browser."
        confirmText="Yes, Wipe All Local Data"
        isDestructive={true}
      />
    </>
  );
};
