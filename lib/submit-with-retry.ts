type SubmitFetch = () => Promise<Response>;

/** Retry transient submit failures (503/502/504/429) with short backoff. */
export async function fetchSubmitWithRetry(
  fetchFn: SubmitFetch,
  options?: { attempts?: number; baseDelayMs?: number },
): Promise<Response> {
  const maxAttempts = Math.max(1, options?.attempts ?? 5);
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  let last: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const res = await fetchFn();
    last = res;
    if (res.ok || res.status === 403 || res.status === 409) return res;
    if (![429, 502, 503, 504].includes(res.status) || attempt >= maxAttempts - 1) {
      return res;
    }
    await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
  }

  return last ?? new Response(null, { status: 503 });
}
