import crypto from 'node:crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface TokenPayload {
  userId: string;
  username: string;
  exp: number;
}

const AVATAR_COLORS = [
  '#1E3A8A',
  '#0F766E',
  '#4338CA',
  '#B45309',
  '#9D174D',
  '#0369A1',
  '#374151',
  '#166534',
];

export function pickAvatarColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i += 1) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function validateUsername(raw: unknown): {
  ok: boolean;
  username?: string;
  displayName?: string;
  error?: string;
} {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Username is required.' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 24) {
    return { ok: false, error: 'Username must be between 3 and 24 characters.' };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return {
      ok: false,
      error: 'Username can only contain letters, numbers, dots, underscores, and hyphens.',
    };
  }
  return {
    ok: true,
    username: trimmed.toLowerCase(),
    displayName: trimmed,
  };
}

export function validatePassword(raw: unknown): {
  ok: boolean;
  password?: string;
  error?: string;
} {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Password is required.' };
  }
  if (raw.length < 6 || raw.length > 128) {
    return { ok: false, error: 'Password must be between 6 and 128 characters.' };
  }
  return { ok: true, password: raw };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const expectedKey = Buffer.from(keyHex, 'hex');
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  if (derivedKey.length !== expectedKey.length) return false;
  return crypto.timingSafeEqual(derivedKey, expectedKey);
}

export function signAuthToken(userId: string, username: string): string {
  const payload: TokenPayload = {
    userId,
    username,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifyAuthToken(token: string): TokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  const expectedSignature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as TokenPayload;
    if (!parsed.userId || !parsed.username || typeof parsed.exp !== 'number') {
      return null;
    }
    if (parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
