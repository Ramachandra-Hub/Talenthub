import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import {
  isPostgresConfigured,
  readQuestionBankBootstrapSql,
} from '@/lib/question-bank/apply-bank-schema';
import { rdsSqlEditorUrl } from '@/lib/postgres-url';

export const runtime = 'nodejs';

/** Returns combined 020+021 SQL for AWS RDS SQL editor (when POSTGRES_URL is not configured). */
export async function GET() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  try {
    const sql = readQuestionBankBootstrapSql();
    return NextResponse.json({
      sql,
      sqlEditorUrl: rdsSqlEditorUrl(),
      postgresConfigured: isPostgresConfigured(),
      steps: [
        'Open AWS RDS SQL editor (link below).',
        'Paste the SQL and click Run.',
        'Wait ~30 seconds for the API schema cache to refresh.',
        'Return here and click Load topic question bank.',
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not read bootstrap SQL';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
