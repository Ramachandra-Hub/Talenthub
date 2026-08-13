/** RDS tables often require updated_at with no DB default on direct PostgREST inserts. */
export function dbRowTimestamps(): { created_at: string; updated_at: string } {
  const now = new Date().toISOString();
  return { created_at: now, updated_at: now };
}

export function withDbRowTimestamps(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, ...dbRowTimestamps() };
}
