/**
 * Formats a timestamp into a friendly relative time indicator
 * e.g., "Just now", "4m ago", "2h ago", "Yesterday", "3d ago"
 */
export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';

  const now = Date.now();
  const diffMs = now - timestamp;

  // Future or instantaneous
  if (diffMs < 30 * 1000) {
    return 'Just now';
  }

  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  // Older dates: e.g. "Oct 8" or "10/08/2026"
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats a timestamp into full localized date and time string
 */
export function formatFullDateTime(timestamp: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
