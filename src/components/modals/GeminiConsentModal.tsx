import React from 'react';
import {
  Cloud,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import { Modal } from '../common/Modal.tsx';
import { usePrivacy } from '../../context/PrivacyContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';

interface GeminiConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConsentSuccess?: () => void;
}

export const GeminiConsentModal: React.FC<GeminiConsentModalProps> = ({
  isOpen,
  onClose,
  onConsentSuccess,
}) => {
  const { grantGeminiConsent, setAiEngine, geminiServerStatus } = usePrivacy();
  const { showToast } = useToast();

  const handleAgree = () => {
    grantGeminiConsent(true);
    setAiEngine('gemini');
    showToast('Google Gemini Cloud AI mode enabled', 'success');
    onClose();
    if (onConsentSuccess) onConsentSuccess();
  };

  const handleDecline = () => {
    setAiEngine('mock');
    showToast('Switched to Local Mock mode (100% offline)', 'info');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="External AI Provider Disclosure & Consent"
      description="Veyra AI protects your privacy by requiring explicit consent before transmitting any data to external cloud services."
      maxWidth="md"
    >
      <div className="space-y-4 text-xs text-stone-700">
        {/* Notice Card */}
        <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-600 text-white shrink-0 mt-0.5">
            <Cloud size={18} />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-stone-900 text-xs">
              Sending Data to Google Gemini Cloud AI
            </h4>
            <p className="text-[11px] text-stone-600 leading-relaxed">
              When Google Gemini Cloud AI is selected, your current prompt and the minimal recent conversation context will be transmitted via our secure local proxy to Google Gemini API servers.
            </p>
          </div>
        </div>

        {/* Data Minimization Breakdown */}
        <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2.5">
          <div className="flex items-center gap-1.5 font-bold text-stone-900 text-xs">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Strict Data Minimization Boundaries</span>
          </div>

          <ul className="text-[11px] text-stone-600 space-y-1.5 list-disc pl-4 leading-relaxed">
            <li>
              <strong>Sent to Gemini:</strong> Only your active message and up to 6 recent messages in the current conversation thread to maintain conversational context.
            </li>
            <li>
              <strong>Never Uploaded:</strong> Project notes, uploaded files, encryption keys, other conversations, and local IndexedDB database records remain strictly on your device.
            </li>
            <li>
              <strong>No Server-Side Storage:</strong> The local Node.js proxy is stateless and does not record or persist prompts or responses.
            </li>
          </ul>
        </div>

        {/* Server Status Callout */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-100 border border-stone-200 text-[11px]">
          <span className="font-medium text-stone-600">Local Proxy Server:</span>
          {geminiServerStatus.isOnline ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online (port 3001) • {geminiServerStatus.model}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Backend offline (run `npm run server`)
            </span>
          )}
        </div>

        {/* Provider Policies Link */}
        <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900 space-y-1">
          <div className="flex items-center gap-1 font-semibold">
            <ShieldAlert size={12} className="text-amber-600" />
            <span>Provider Terms & Data Handling</span>
          </div>
          <p className="text-[10.5px] leading-relaxed text-amber-800">
            Prompts processed by external providers are subject to Groq’s API Terms of Service and Privacy Policy. If you are handling classified or strictly confidential data, prefer <strong>Local Mock Engine</strong>.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-stone-100">
          <button
            type="button"
            onClick={handleDecline}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-stone-600 hover:text-stone-900 text-xs font-semibold hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <Cpu size={13} />
            <span>Stay in Local Mock Mode</span>
          </button>

          <button
            type="button"
            onClick={handleAgree}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <CheckCircle2 size={13} />
            <span>I Consent & Enable Groq</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
