/** Parse fetch bodies safely (avoids "Unexpected end of JSON input" on empty 502/504). */
export async function readJsonResponse<T = Record<string, unknown>>(
  res: Response,
): Promise<{ json: T; raw: string }> {
  const raw = await res.text();
  if (!raw.trim()) {
    throw new Error(
      res.ok
        ? `Empty response from server (HTTP ${res.status}). Try again or run pnpm init:rds locally.`
        : `Server error with empty body (HTTP ${res.status}). Check Vercel logs for /api/setup/rds.`,
    );
  }
  try {
    return { json: JSON.parse(raw) as T, raw };
  } catch {
    throw new Error(
      `Invalid JSON from server (HTTP ${res.status}): ${raw.slice(0, 200)}`,
    );
  }
}
