export function isMissingTableOrColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('schema cache') ||
    m.includes('does not exist') ||
    m.includes('could not find the table') ||
    m.includes('column') && m.includes('does not exist')
  );
}

export function isUuidTypeMismatchError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('invalid input syntax for type uuid') || m.includes('type uuid');
}

export function examSchedulesMigrationHint(message: string): string | null {
  if (message.includes('exam_schedules') && isMissingTableOrColumnError(message)) {
    return 'Run prisma db push or scripts/01-initial-schema.sql on RDS.';
  }
  if (isUuidTypeMismatchError(message) && message.includes('test_id')) {
    return 'Run prisma db push or scripts/01-initial-schema.sql on RDS.';
  }
  return null;
}

export function rmsetPapersMigrationHint(message: string): string | null {
  if (message.includes('rmset_papers') && isMissingTableOrColumnError(message)) {
    return 'Run prisma db push or scripts/01-initial-schema.sql on RDS.';
  }
  return null;
}
