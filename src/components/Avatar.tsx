import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

interface AvatarProps {
  name: string;
  color: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  online?: boolean;
  showPresence?: boolean;
}

function getInitials(name: string): string {
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export function VerifiedBadge({
  size = 'md',
  title = 'Verified Lead Developer & Admin (Hmxerr)',
}: {
  size?: 'sm' | 'md';
  title?: string;
}) {
  const sizeClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const iconSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center ${sizeClass} rounded-full bg-blue-600 text-white shrink-0 shadow-xs align-middle ml-1`}
    >
      <Check className={`${iconSize} stroke-[3]`} aria-hidden="true" />
    </span>
  );
}

export function DeveloperTag({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200 ${className}`}
    >
      <span>🛡️ Dev &amp; Admin</span>
    </span>
  );
}

export function Avatar({
  name,
  color,
  avatarUrl,
  size = 'md',
  online = false,
  showPresence = false,
}: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl]);

  const sizeClasses =
    size === 'sm'
      ? 'h-8 w-8 text-xs'
      : size === 'lg'
        ? 'h-11 w-11 text-sm'
        : 'h-9 w-9 text-xs';

  const safeUrl =
    avatarUrl && (avatarUrl.startsWith('/api/uploads/') || avatarUrl.startsWith('data:image/'))
      ? avatarUrl
      : null;

  return (
    <div className="relative inline-flex shrink-0">
      {safeUrl && !imgFailed ? (
        <img
          src={safeUrl}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`${sizeClasses} rounded-lg object-cover border border-slate-200 select-none`}
        />
      ) : (
        <div
          className={`${sizeClasses} flex items-center justify-center rounded-lg font-semibold tracking-tight text-white select-none`}
          style={{ backgroundColor: color }}
          aria-hidden="true"
        >
          {getInitials(name)}
        </div>
      )}
      {showPresence && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
            online ? 'bg-emerald-600' : 'bg-slate-300'
          }`}
          title={online ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
}
