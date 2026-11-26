import { useEffect, useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';

interface AvatarProps {
  name: string;
  color: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
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
      className={`inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 ${className}`}
    >
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Official Creator &amp; Admin</span>
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
      ? 'h-9 w-9 text-xs rounded-xl'
      : size === 'xl'
        ? 'h-16 w-16 text-lg rounded-2xl'
        : size === 'lg'
          ? 'h-12 w-12 text-sm rounded-2xl'
          : 'h-10 w-10 text-xs rounded-xl';

  const presenceDotClass =
    size === 'xl'
      ? 'h-3.5 w-3.5 right-0 bottom-0'
      : size === 'lg'
        ? 'h-3 w-3 -right-0.5 -bottom-0.5'
        : 'h-2.5 w-2.5 -right-0.5 -bottom-0.5';

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
          className={`${sizeClasses} object-cover ring-1 ring-slate-900/10 select-none bg-slate-100`}
        />
      ) : (
        <div
          className={`${sizeClasses} flex items-center justify-center font-display font-bold tracking-tight text-white select-none ring-1 ring-black/5`}
          style={{ backgroundColor: color }}
          aria-hidden="true"
        >
          {getInitials(name)}
        </div>
      )}
      {showPresence && (
        <span
          className={`absolute ${presenceDotClass} rounded-full ring-2 ring-white ${
            online ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
          title={online ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
}
