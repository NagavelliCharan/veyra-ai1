import { Check, LogOut, UserPlus } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GoogleSignInButton } from '../auth/GoogleSignInButton';
import { UserAvatar } from '../auth/UserAvatar';
import { Modal } from '../common/Modal';

/** Header profile button: shows the signed-in Google account, account switcher, add account and sign out */
export const ProfileMenu: React.FC = () => {
  const { currentUser, accounts, switchAccount, signOut, signOutAll } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  if (!currentUser) return null;

  const otherAccounts = accounts.filter((a) => a.id !== currentUser.id);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`rounded-full transition-shadow cursor-pointer ${
          isOpen ? 'ring-2 ring-indigo-500/40' : 'hover:ring-2 hover:ring-stone-200'
        }`}
        title={`${currentUser.name}\n${currentUser.email}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <UserAvatar account={currentUser} size="sm" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-lg border border-stone-200 z-50 animate-in fade-in overflow-hidden"
        >
          {/* Current account */}
          <div className="flex flex-col items-center text-center gap-1.5 px-4 pt-5 pb-4 border-b border-stone-100">
            <UserAvatar account={currentUser} size="lg" />
            <div className="min-w-0 w-full">
              <div className="text-sm font-semibold text-stone-900 truncate">{currentUser.name}</div>
              <div className="text-xs text-stone-500 truncate">{currentUser.email}</div>
            </div>
          </div>

          {/* Other accounts on this device */}
          {otherAccounts.length > 0 && (
            <div className="py-1.5 border-b border-stone-100">
              <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider px-4 py-1">
                Switch account
              </div>
              {otherAccounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    switchAccount(account.id);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-stone-50 text-left cursor-pointer transition-colors"
                >
                  <UserAvatar account={account} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-stone-800 truncate">{account.name}</div>
                    <div className="text-[11px] text-stone-500 truncate">{account.email}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="py-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                setIsAddAccountOpen(true);
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 cursor-pointer transition-colors"
            >
              <UserPlus size={15} className="text-indigo-600" />
              Add another Google account
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                signOut();
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-stone-700 hover:bg-rose-50 hover:text-rose-700 cursor-pointer transition-colors"
            >
              <LogOut size={15} />
              Log out
            </button>
            {otherAccounts.length > 0 && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  signOutAll();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-stone-700 hover:bg-rose-50 hover:text-rose-700 cursor-pointer transition-colors"
              >
                <LogOut size={15} />
                Log out of all accounts
              </button>
            )}
          </div>
        </div>
      )}

      <Modal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        title="Add another Google account"
        description="Sign in with a different Gmail account. You can switch between accounts from your profile menu."
        maxWidth="sm"
      >
        <div className="py-2 space-y-3">
          <GoogleSignInButton text="signin_with" onSignedIn={() => setIsAddAccountOpen(false)} />
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-stone-400">
            <Check size={12} className="text-emerald-600" />
            In Google&apos;s window, choose &quot;Use another account&quot; to add a new Gmail.
          </p>
        </div>
      </Modal>
    </div>
  );
};
