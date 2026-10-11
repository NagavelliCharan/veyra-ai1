import { Loader2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { loadGoogleIdentity } from '../../services/auth/googleIdentity';

interface GoogleSignInButtonProps {
  /** Called after the account was verified and made active */
  onSignedIn?: () => void;
  text?: 'signin_with' | 'continue_with';
}

/** Renders Google's official "Sign in with Google" button */
export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onSignedIn,
  text = 'continue_with',
}) => {
  const { signInWithGoogleCredential, googleClientId } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'verifying' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');

  // Keep the latest handlers for Google's long-lived callback
  const handlersRef = useRef({ signInWithGoogleCredential, onSignedIn });
  useEffect(() => {
    handlersRef.current = { signInWithGoogleCredential, onSignedIn };
  });

  useEffect(() => {
    let cancelled = false;
    loadGoogleIdentity()
      .then((gsi) => {
        if (cancelled || !containerRef.current) return;
        gsi.initialize({
          client_id: googleClientId,
          ux_mode: 'popup',
          auto_select: false,
          use_fedcm_for_button: true,
          callback: async ({ credential }) => {
            setStatus('verifying');
            const ok = await handlersRef.current.signInWithGoogleCredential(credential);
            setStatus('ready');
            if (ok) handlersRef.current.onSignedIn?.();
          },
        });
        containerRef.current.innerHTML = '';
        gsi.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text,
          logo_alignment: 'left',
          width: 280,
        });
        setStatus('ready');
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLoadError(err.message);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [text, googleClientId]);

  return (
    <div className="flex flex-col items-center gap-2 min-h-[44px]">
      <div ref={containerRef} className={status === 'verifying' ? 'opacity-40 pointer-events-none' : ''} />
      {status === 'loading' && (
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <Loader2 size={14} className="animate-spin text-indigo-600" />
          Loading Google sign-in...
        </div>
      )}
      {status === 'verifying' && (
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <Loader2 size={14} className="animate-spin text-indigo-600" />
          Verifying your Google account...
        </div>
      )}
      {status === 'error' && <p className="text-xs text-rose-600 text-center">{loadError}</p>}
    </div>
  );
};
