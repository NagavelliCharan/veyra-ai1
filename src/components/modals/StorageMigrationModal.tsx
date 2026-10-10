import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Modal } from '../common/Modal.tsx';
import { Button } from '../common/Button.tsx';
import type { StorageMode } from '../../types/index.ts';

export interface StorageMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode: StorageMode;
  targetMode: StorageMode;
  isVaultConfigured: boolean;
  isVaultLocked: boolean;
  onConfirmMigration: (options: {
    passphrase?: string;
    decryptExisting?: boolean;
    persistSessionData?: boolean;
  }) => Promise<boolean>;
  onExportBackup: () => void;
}

export const StorageMigrationModal: React.FC<StorageMigrationModalProps> = ({
  isOpen,
  onClose,
  currentMode,
  targetMode,
  isVaultConfigured,
  isVaultLocked,
  onConfirmMigration,
  onExportBackup,
}) => {
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [persistSessionData, setPersistSessionData] = useState(true);
  const [hasExported, setHasExported] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExportClick = () => {
    onExportBackup();
    setHasExported(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const options: {
        passphrase?: string;
        decryptExisting?: boolean;
        persistSessionData?: boolean;
      } = {};

      if (currentMode === 'encrypted' && targetMode === 'local_storage') {
        if (isVaultLocked && !passphrase) {
          setError('Master passphrase is required to authorize decrypting stored records.');
          setIsSubmitting(false);
          return;
        }
        options.passphrase = passphrase || undefined;
        options.decryptExisting = true;
      } else if (targetMode === 'encrypted') {
        if (isVaultConfigured && isVaultLocked && !passphrase) {
          setError('Master passphrase is required to unlock the vault and encrypt data.');
          setIsSubmitting(false);
          return;
        }
        options.passphrase = passphrase || undefined;
        if (currentMode === 'session_only') {
          options.persistSessionData = persistSessionData;
        }
      } else if (currentMode === 'session_only') {
        options.persistSessionData = persistSessionData;
      }

      const success = await onConfirmMigration(options);
      if (success) {
        setPassphrase('');
        setError(null);
        onClose();
      } else {
        setError('Migration could not be completed. Please verify your passphrase.');
      }
    } catch (err: any) {
      setError(err?.message || 'Storage migration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine modal title & description
  let title = 'Confirm Storage Migration';
  let description = 'Review the impact of changing your local persistence mode.';

  if (currentMode === 'encrypted' && targetMode === 'local_storage') {
    title = 'Decrypt Vault to Local Storage';
    description =
      'Convert your encrypted database records into unencrypted plaintext IndexedDB storage.';
  } else if (targetMode === 'session_only') {
    title = 'Switch to Session-Only Mode (RAM)';
    description =
      'Operate in volatile memory without writing new conversations or notes to disk.';
  } else if (currentMode === 'session_only' && (targetMode === 'local_storage' || targetMode === 'encrypted')) {
    title = 'Save In-Memory Session to Persistent Storage';
    description =
      'Choose whether to persist your active session conversations and notes to local storage.';
  } else if (targetMode === 'encrypted') {
    title = 'Migrate Data to Encrypted Vault';
    description =
      'Encrypt existing plaintext records with your client-side master key.';
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} description={description} maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2.5">
            <AlertTriangle size={15} className="shrink-0 text-rose-600 mt-0.5" />
            <div className="leading-relaxed font-medium">{error}</div>
          </div>
        )}

        {/* Case 1: Encrypted -> Local Storage (Privacy Downgrade) */}
        {currentMode === 'encrypted' && targetMode === 'local_storage' && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5 text-xs text-amber-900">
              <div className="flex items-center gap-1.5 font-bold">
                <ShieldAlert size={15} className="text-amber-600" />
                <span>Security Notice: Encryption Removal</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Switching to unencrypted local persistence decrypts your stored projects,
                conversations, messages, notes, and files into plaintext IndexedDB records. Anyone
                with access to this computer or browser DevTools can inspect them.
              </p>
            </div>

            {/* Passphrase required if vault is locked */}
            {isVaultLocked && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Master Passphrase (to authorize decryption)
                </label>
                <div className="relative">
                  <input
                    type={showPassphrase ? 'text' : 'password'}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter vault passphrase..."
                    autoFocus
                    className="w-full pl-9 pr-10 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono"
                  />
                  <KeyRound
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase(!showPassphrase)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    {showPassphrase ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}

            {/* Recommend Export */}
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-stone-900">Download Offline Backup</div>
                <div className="text-[11px] text-stone-500">
                  Save a copy of your records before decrypting.
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<Download size={13} />}
                onClick={handleExportClick}
              >
                {hasExported ? 'Backup Downloaded ✓' : 'Export JSON'}
              </Button>
            </div>
          </div>
        )}

        {/* Case 2: Any -> Session-Only */}
        {targetMode === 'session_only' && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5 text-xs text-amber-900">
              <div className="flex items-center gap-1.5 font-bold">
                <Zap size={15} className="text-amber-600" />
                <span>Volatile Storage Warning</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                In Session-Only mode, any new conversations, notes, or uploaded files will live
                strictly in volatile browser RAM. When you close or refresh this browser window,
                all session data will be permanently cleared.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-stone-900">Export Backup First</div>
                <div className="text-[11px] text-stone-500">
                  Download a JSON archive before switching to session memory.
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<Download size={13} />}
                onClick={handleExportClick}
              >
                {hasExported ? 'Backup Downloaded ✓' : 'Export JSON'}
              </Button>
            </div>
          </div>
        )}

        {/* Case 3: Session-Only -> Persistent Mode */}
        {currentMode === 'session_only' && targetMode !== 'session_only' && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-900">
              <span className="font-bold block mb-1">Session Data Detected</span>
              <p className="text-[11px] text-indigo-700 leading-relaxed">
                You have active conversations and notes in memory. Would you like to commit them to{' '}
                {targetMode === 'encrypted' ? 'your Encrypted Vault' : 'IndexedDB local storage'}?
              </p>
            </div>

            <label className="flex items-center gap-2 p-2.5 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer">
              <input
                type="checkbox"
                checked={persistSessionData}
                onChange={(e) => setPersistSessionData(e.target.checked)}
                className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs font-medium text-stone-800">
                Persist current in-memory conversations and notes to disk
              </span>
            </label>

            {targetMode === 'encrypted' && isVaultConfigured && isVaultLocked && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Master Passphrase (to unlock vault)
                </label>
                <div className="relative">
                  <input
                    type={showPassphrase ? 'text' : 'password'}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter vault passphrase..."
                    autoFocus
                    className="w-full pl-9 pr-10 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono"
                  />
                  <KeyRound
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase(!showPassphrase)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    {showPassphrase ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Case 4: Local Storage -> Encrypted (when vault is already configured) */}
        {currentMode === 'local_storage' && targetMode === 'encrypted' && isVaultConfigured && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <ShieldCheck size={15} className="text-indigo-600" />
                <span>Encrypting Plaintext Records</span>
              </div>
              <p className="text-[11px] text-indigo-700 leading-relaxed">
                All existing plaintext projects, conversations, messages, notes, and files stored in
                IndexedDB will be encrypted using authenticated AES-GCM 256-bit encryption.
              </p>
            </div>

            {isVaultLocked && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Master Passphrase (to unlock and encrypt)
                </label>
                <div className="relative">
                  <input
                    type={showPassphrase ? 'text' : 'password'}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter vault passphrase..."
                    autoFocus
                    className="w-full pl-9 pr-10 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono"
                  />
                  <KeyRound
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase(!showPassphrase)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    {showPassphrase ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={
              currentMode === 'encrypted' && targetMode === 'local_storage' ? 'danger' : 'primary'
            }
            size="sm"
            disabled={isSubmitting}
            icon={
              isSubmitting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <CheckCircle2 size={13} />
              )
            }
          >
            {isSubmitting
              ? 'Migrating Data...'
              : currentMode === 'encrypted' && targetMode === 'local_storage'
              ? 'Decrypt & Switch Mode'
              : targetMode === 'session_only'
              ? 'Confirm Switch to Session'
              : 'Confirm Storage Migration'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
