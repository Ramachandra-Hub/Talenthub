import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { ELEVATEX_SAMPLE_PASSWORD } from '@/lib/elevatex-sample-credentials';
import { writeElevateXCredentialsPublicCsv } from '@/lib/elevatex-credentials-export';
import { seedElevateXSample } from '@/lib/elevatex-sample-seed';
import path from 'node:path';

/** Seeding 42 users can exceed the default 10s limit on Vercel Hobby. */
export const maxDuration = 60;

function getServiceRoleKey(): string | undefined {
  const raw = process.env.AUTH_SECRET?.trim();
  if (!raw || raw.includes('YOUR_')) return undefined;
  return raw;
}

/**
 * Creates 42 ElevateX Slot 1 test students (EXS1001–EXS1042), removes legacy EX26001–15,
 * and go-lives ElevateX for 10:00 AM IST today on this AWS RDS project.
 */
export async function POST() {
  try {
    const rdsUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const serviceRoleKey = getServiceRoleKey();

    if (!rdsUrl || !serviceRoleKey || !rdsUrl.includes('.db.co')) {
      return NextResponse.json(
        {
          error:
            'Set NEXT_PUBLIC_APP_URL and AUTH_SECRET (service role) for this deployment.',
        },
        { status: 500 },
      );
    }

    const db = getDbService();

    const password =
      process.env.ELEVATEX_SAMPLE_PASSWORD?.trim() || ELEVATEX_SAMPLE_PASSWORD;

    const result = await seedElevateXSample(db, rdsUrl, password);

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error, partial: result.partial },
        { status: 500 },
      );
    }

    const csvPath = writeElevateXCredentialsPublicCsv(path.join(process.cwd()), password);

    return NextResponse.json({
      success: true,
      message:
        'ElevateX Slot 1 test students are ready (EXS1001–EXS1042). Legacy EX26001–15 removed.',
      password: result.password,
      rdsProject: result.rdsProject,
      scheduleId: result.scheduleId,
      scheduleWarning: result.scheduleWarning,
      scheduleLabel: result.scheduleLabel,
      legacyRemoved: result.legacyRemoved,
      accounts: result.accounts,
      studentLogin: '/auth/login/student',
      credentialsCsv: '/elevatex-slot1-credentials.csv',
      csvWriteSkipped: csvPath === null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ElevateX seed failed unexpectedly';
    console.error('[seed-elevatex-sample]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
