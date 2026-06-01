import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import {
  applyQuestionBankSchemaMigrations,
  isPostgresConfigured,
  readQuestionBankBootstrapSql,
  waitForQuestionsTable,
} from '@/lib/question-bank/apply-bank-schema';
import { rdsSqlEditorUrl } from '@/lib/postgres-url';

export const runtime = 'nodejs';

/** Creates question bank tables (migrations 020 + 021) when POSTGRES_URL or DATABASE_PASSWORD is set. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin'], request);
  if ('response' in auth) return auth.response;

  const result = await applyQuestionBankSchemaMigrations();
  if (!result.ok) {
    let bootstrapSql: string | undefined;
    if (result.error === 'Database connection not configured') {
      try {
        bootstrapSql = readQuestionBankBootstrapSql();
      } catch {
        /* optional */
      }
    }
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        hint:
          result.error === 'Database connection not configured'
            ? 'Add DATABASE_PASSWORD to .env.local for one-click setup, or use Copy bootstrap SQL below.'
            : result.hint,
        sqlEditorUrl: result.sqlEditorUrl ?? rdsSqlEditorUrl(),
        postgresConfigured: isPostgresConfigured(),
        bootstrapSql,
        applied: result.applied ?? [],
      },
      { status: 400 },
    );
  }

  const admin = getDbService();
  let tableReady = true;
  let waitError: string | null = null;
  if (admin) {
    waitError = await waitForQuestionsTable(admin);
    tableReady = waitError == null;
  }

  return NextResponse.json({
    ok: true,
    applied: result.applied,
    tableReady,
    waitError,
    sqlEditorUrl: result.sqlEditorUrl,
    message: tableReady
      ? 'Question bank tables are ready. Click "Load topic question bank".'
      : 'Migrations applied. Wait ~30 seconds, then retry Load topic bank.',
  });
}
