/** Allow only same-origin relative paths (blocks open redirects). */
export function safeNextPath(next: unknown, fallback = '/exams'): string {
  if (typeof next !== 'string') return fallback;
  const trimmed = next.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback;
  if (trimmed.includes('://') || trimmed.includes('\\')) return fallback;
  return trimmed;
}
