import React, { createContext, useContext, useRef, useState } from 'react';
import { disableGoogleAutoSelect, GOOGLE_CLIENT_ID } from '../services/auth/googleIdentity';
import { useToast } from './ToastContext';

export interface UserAccount {
  /** Google account ID (the token's "sub") */
  id: string;
  name: string;
  email: string;
  picture: string;
}

interface AuthContextType {
  /** The signed-in account, or null when signed out */
  currentUser: UserAccount | null;
  /** All Google accounts added on this device (for the account switcher) */
  accounts: UserAccount[];
  isGoogleConfigured: boolean;
  /** Verifies a Google ID token with the backend and makes that account active */
  signInWithGoogleCredential: (credential: string) => Promise<boolean>;
  switchAccount: (accountId: string) => void;
  /** Signs the current account out and removes it from this device */
  signOut: () => void;
  signOutAll: () => void;
}

const ACCOUNTS_KEY = 'veyra_accounts';
const ACTIVE_ACCOUNT_KEY = 'veyra_active_account';

// Only public profile fields are stored — never Google tokens
const readStoredAccounts = (): UserAccount[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((a) => a && typeof a.id === 'string' && typeof a.email === 'string')
      : [];
  } catch {
    return [];
  }
};

const persist = (accounts: UserAccount[], activeId: string | null) => {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    if (activeId) localStorage.setItem(ACTIVE_ACCOUNT_KEY, activeId);
    else localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
  } catch {
    // Storage unavailable (private mode); the session still works in memory
  }
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showToast } = useToast();

  const [accounts, setAccounts] = useState<UserAccount[]>(readStoredAccounts);
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_ACCOUNT_KEY);
    } catch {
      return null;
    }
  });

  // Latest list for callbacks that outlive a render (the Google sign-in callback)
  const accountsRef = useRef(accounts);

  const currentUser = accounts.find((a) => a.id === activeId) || null;

  const update = (nextAccounts: UserAccount[], nextActiveId: string | null) => {
    accountsRef.current = nextAccounts;
    setAccounts(nextAccounts);
    setActiveId(nextActiveId);
    persist(nextAccounts, nextActiveId);
  };

  const signInWithGoogleCredential = async (credential: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Google sign-in failed. Please try again.', 'error');
        return false;
      }

      const account: UserAccount = {
        id: data.id,
        name: data.name,
        email: data.email,
        picture: data.picture,
      };
      const others = accountsRef.current.filter((a) => a.id !== account.id);
      update([...others, account], account.id);
      showToast(`Signed in as ${account.email}`, 'success');
      return true;
    } catch {
      showToast('Could not reach the Veyra AI server to sign in. Is the backend running?', 'error');
      return false;
    }
  };

  const switchAccount = (accountId: string) => {
    const target = accounts.find((a) => a.id === accountId);
    if (!target) return;
    update(accounts, accountId);
    showToast(`Switched to ${target.email}`, 'info');
  };

  const signOut = () => {
    if (!currentUser) return;
    disableGoogleAutoSelect();
    const remaining = accounts.filter((a) => a.id !== currentUser.id);
    // Fall back to another added account if there is one, otherwise show the sign-in screen
    update(remaining, remaining[0]?.id ?? null);
    showToast(`Signed out of ${currentUser.email}`, 'info');
  };

  const signOutAll = () => {
    disableGoogleAutoSelect();
    update([], null);
    showToast('Signed out of all accounts', 'info');
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        accounts,
        isGoogleConfigured: Boolean(GOOGLE_CLIENT_ID),
        signInWithGoogleCredential,
        switchAccount,
        signOut,
        signOutAll,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
