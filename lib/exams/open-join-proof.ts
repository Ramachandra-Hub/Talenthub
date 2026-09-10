import { createHmac, timingSafeEqual } from 'crypto';

function secret(): string {
  return process.env.AUTH_SECRET?.trim() || 'open-join-dev-secret';
}

/** Short-lived proof that joinOpenExam already authenticated this user. */
export function createOpenJoinProof(userId: string): string {
  const ts = Date.now().toString(36);
  const payload = `${userId}.${ts}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('hex').slice(0, 32);
  return `${payload}.${sig}`;
}

/** Returns userId when proof is valid and fresh (default 2 minutes). */
export function verifyOpenJoinProof(proof: string, maxAgeMs = 120_000): string | null {
  const raw = proof.trim();
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [userId, ts, sig] = parts;
  if (!userId || !ts || !sig) return null;
  const payload = `${userId}.${ts}`;
  const expected = createHmac('sha256', secret()).update(payload).digest('hex').slice(0, 32);
  try {
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  const issued = Number.parseInt(ts, 36);
  if (!Number.isFinite(issued)) return null;
  const age = Date.now() - issued;
  if (age > maxAgeMs || age < -60_000) return null;
  return userId;
}
