import { AlertTriangle, ShieldCheck } from 'lucide-react';
import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { GoogleSignInButton } from './GoogleSignInButton';

/** Full-page sign-in shown when no Google account is active */
export const SignInScreen: React.FC = () => {
  const { isGoogleConfigured } = useAuth();

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#fbfaf8] text-stone-900 p-4 font-sans">
      <div className="w-full max-w-md bg-white border border-stone-200/90 rounded-2xl shadow-xl shadow-stone-200/50 p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 mb-1 shadow-2xs">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900">
            Welcome to Veyra<span className="text-indigo-600 font-extrabold">AI</span>
          </h1>
          <p className="text-xs text-stone-500 max-w-xs mx-auto leading-relaxed">
            Sign in with your Google account to continue to your private AI workspace.
          </p>
        </div>

        {isGoogleConfigured ? (
          <GoogleSignInButton />
        ) : (
          <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 space-y-1.5 text-stone-700">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900">
              <AlertTriangle size={13} className="text-amber-600 shrink-0" />
              Google sign-in is not set up yet
            </div>
            <p className="text-[11px] text-amber-800/90 leading-relaxed">
              Set <code className="font-mono bg-amber-100 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> in the
              server&apos;s <code className="font-mono bg-amber-100 px-1 rounded">.env</code> file (or your hosting
              provider&apos;s environment settings), then restart the backend.
            </p>
          </div>
        )}

        <p className="pt-2 border-t border-stone-100 text-[10px] text-stone-400 text-center leading-relaxed">
          Veyra AI only receives your name, email address and profile photo. Your chats and notes stay on
          this device.
        </p>
      </div>
    </div>
  );
};
