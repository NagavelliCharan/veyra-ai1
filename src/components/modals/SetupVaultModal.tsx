import React, { useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Modal } from '../common/Modal.tsx';
import { usePrivacy } from '../../context/PrivacyContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';

interface SetupVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SetupVaultModal: React.FC<SetupVaultModalProps> = ({ isOpen, onClose }) => {
  const { setupVault } = usePrivacy();
  const { showToast } = useToast();

  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (passphrase.length < 8) {
      setError('Master passphrase must be at least 8 characters long.');
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match. Please re-enter.');
      return;
    }

    if (!acknowledged) {
      setError('You must acknowledge the zero-recovery warning before proceeding.');
      return;
    }

    setIsSubmitting(true);
    try {
      await setupVault(passphrase);
      showToast('Encrypted Local Vault initialized successfully', 'success');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize encrypted vault.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Set Up Encrypted Local Vault"
      description="Protect your conversations, notes, and files with client-side AES-GCM 256-bit encryption."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2.5">
            <AlertTriangle size={15} className="shrink-0 text-rose-600 mt-0.5" />
            <div className="leading-relaxed font-medium">{error}</div>
          </div>
        )}

        {/* Cryptographic Specifications Pill */}
        <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 space-y-1 text-xs text-indigo-900">
          <div className="flex items-center gap-1.5 font-bold">
            <ShieldCheck size={14} className="text-indigo-600" />
            <span>Cryptographic Architecture</span>
          </div>
          <p className="text-[11px] text-indigo-700 leading-relaxed">
            Derived using <strong>PBKDF2</strong> (100,000 iterations of SHA-256) with a 128-bit random salt. Data is authenticated using <strong>AES-GCM (256-bit)</strong> with a fresh 96-bit IV per item.
          </p>
        </div>

        {/* Passphrase Input */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Create Master Passphrase
          </label>
          <div className="relative">
            <input
              type={showPassphrase ? 'text' : 'password'}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Minimum 8 characters..."
              autoFocus
              className="w-full pl-9 pr-10 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono"
            />
            <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <button
              type="button"
              onClick={() => setShowPassphrase(!showPassphrase)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              {showPassphrase ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Confirm Passphrase Input */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Confirm Master Passphrase
          </label>
          <div className="relative">
            <input
              type={showPassphrase ? 'text' : 'password'}
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              placeholder="Re-enter passphrase..."
              className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono"
            />
            <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          </div>
        </div>

        {/* Permanent Recovery Warning */}
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-stone-800 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
            <AlertTriangle size={14} className="text-amber-600" />
            <span>Zero-Recovery Architecture Warning</span>
          </div>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            Because Veyra AI operates with zero central servers and does not store your passphrase, <strong>there is NO password recovery mechanism</strong>. If you lose this passphrase, your encrypted data cannot be recovered.
          </p>

          <label className="flex items-start gap-2 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-[11px] font-semibold text-amber-950">
              I understand that if I lose my passphrase, my encrypted local data is permanently lost.
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:text-stone-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !passphrase || !confirmPassphrase || !acknowledged}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Deriving Key & Encrypting...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={13} />
                <span>Initialize Encrypted Vault</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
