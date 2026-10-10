import React, { useState } from 'react';
import type { UserAccount } from '../../context/AuthContext';

const SIZE_CLASSES = {
  sm: 'w-7 h-7 text-[11px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-14 h-14 text-lg',
} as const;

const getInitials = (account: UserAccount) => {
  const source = account.name?.trim() || account.email;
  const parts = source.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
};

/** Google profile photo, falling back to initials if it can't load */
export const UserAvatar: React.FC<{ account: UserAccount; size?: keyof typeof SIZE_CLASSES }> = ({
  account,
  size = 'md',
}) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(account.picture) && failedSrc !== account.picture;

  return showImage ? (
    <img
      src={account.picture}
      alt={account.name}
      // Google photo URLs refuse requests that carry a referrer from other sites
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(account.picture)}
      className={`${SIZE_CLASSES[size]} rounded-full object-cover border border-stone-200 shrink-0`}
    />
  ) : (
    <span
      className={`${SIZE_CLASSES[size]} rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center shrink-0`}
      aria-label={account.name}
    >
      {getInitials(account)}
    </span>
  );
};
