import React, { useState } from 'react';
import {
  Lock,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertTriangle,
  KeyRound,
  Trash2,
  Loader2,
} from 'lucide-react';
import { usePrivacy } from '../../context/PrivacyContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';

export const WorkspaceLockScreen: React.FC = () => {
  const { unlockVault, clearAllData } = usePrivacy();
  const { showToast } = useToast();

  const [passphrase, setPassphrase] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPanicConfirm, setShowPanicConfirm] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim()) {
      setErrorMessage('Please enter your master passphrase.');
      return;
    }

    setIsUnlocking(true);
    setErrorMessage(null);

    try {
      // Derive key via PBKDF2 and verify against canary
      await unlockVault(passphrase);
      showToast('Workspace unlocked successfully', 'success');
    } catch {
      setErrorMessage('Incorrect master passphrase. Authentication challenge failed.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handlePanicWipe = async () => {
    await clearAllData();
  };

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#fbfaf8] text-stone-900 p-4 font-sans select-none">
      <div className="w-full max-w-md bg-white border border-stone-200/90 rounded-2xl shadow-xl shadow-stone-200/50 p-6 sm:p-8 space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 mb-1 shadow-2xs">
            <ShieldCheck size={26} strokeWidth={2.2} />
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <Lock size={15} className="text-indigo-600" />
            <h1 className="text-xl font-bold tracking-tight text-stone-900">
              Workspace Locked
            </h1>
          </div>
          <p className="text-xs text-stone-500 max-w-xs mx-auto leading-relaxed">
            Enter your master passphrase to decrypt your local conversations and notes.
          </p>
        </div>

        {/* Error Feedback */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2.5">
            <AlertTriangle size={15} className="shrink-0 text-rose-600 mt-0.5" />
            <div className="leading-relaxed font-medium">{errorMessage}</div>
          </div>
        )}

        {/* Unlock Form */}
        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Master Passphrase
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Enter passphrase..."
                autoFocus
                disabled={isUnlocking}
                className="w-full pl-9 pr-10 py-2.5 bg-stone-50/70 border border-stone-200 rounded-xl text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all font-mono"
              />
              <KeyRound
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isUnlocking || !passphrase.trim()}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {isUnlocking ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Decrypting Workspace...</span>
              </>
            ) : (
              <>
                <Lock size={14} />
                <span>Unlock Workspace</span>
              </>
            )}
          </button>
        </form>

        {/* Password Recovery Warning */}
        <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 space-y-1 text-stone-700">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900">
            <AlertTriangle size={13} className="text-amber-600 shrink-0" />
            <span>Zero-Recovery Notice</span>
          </div>
          <p className="text-[10px] text-amber-800/90 leading-relaxed">
            Your encryption key is never stored on disk. If you forget this passphrase, your encrypted local conversations cannot be recovered.
          </p>
        </div>

        {/* Emergency Panic Reset Option */}
        <div className="pt-2 border-t border-stone-100 text-center">
          <button
            type="button"
            onClick={() => setShowPanicConfirm(true)}
            className="text-[11px] text-stone-500 hover:text-rose-600 font-medium transition-colors cursor-pointer"
          >
            Forgot passphrase? Reset and wipe local data
          </button>
        </div>
      </div>

      {/* Panic Wipe Confirmation Modal */}
      {showPanicConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 p-6 space-y-4 shadow-2xl">
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
              <Trash2 size={20} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-stone-900">Reset All Local Data?</h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                This will permanently delete all encrypted local conversations, projects, notes, and the encryption vault. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPanicConfirm(false)}
                className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePanicWipe}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
              >
                Permanently Wipe Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
