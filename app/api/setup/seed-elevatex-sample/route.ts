import { NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import {
  ELEVATEX_SAMPLE_COUNT,
  ELEVATEX_SAMPLE_PASSWORD,
  ELEVATEX_SAMPLE_STUDENTS,
} from '@/lib/elevatex-sample-credentials';
import { writeElevateXCredentialsPublicCsv } from '@/lib/elevatex-credentials-export';
import { seedElevateXSample } from '@/lib/elevatex-sample-seed';
import { assertSetupDeploymentReady } from '@/lib/setup/deployment-ready';
import path from 'node:path';

/** Seeding 120 users can exceed the default 10s limit on Vercel Hobby. */
export const maxDuration = 120;

/**
 * Creates 120 ElevateX Slot 1 test students (EXS1001–EXS1120), removes legacy EX26001–15,
 * and go-lives ElevateX for 10:00 AM IST today.
 */
export async function POST() {
  try {
    const ready = assertSetupDeploymentReady();
    if (!ready.ok) {
      return NextResponse.json({ error: ready.error }, { status: 500 });
    }

    const db = getDbService();
    if (!db) {
      return NextResponse.json({ error: 'Database client not configured' }, { status: 500 });
    }

    const password =
      process.env.ELEVATEX_SAMPLE_PASSWORD?.trim() || ELEVATEX_SAMPLE_PASSWORD;

    const result = await seedElevateXSample(db, ready.appUrl, password);

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error, partial: result.partial },
        { status: 500 },
      );
    }

    const csvPath = writeElevateXCredentialsPublicCsv(path.join(process.cwd()), password);

    const firstRoll = ELEVATEX_SAMPLE_STUDENTS[0]?.roll ?? 'EXS1001';
    const lastRoll =
      ELEVATEX_SAMPLE_STUDENTS[ELEVATEX_SAMPLE_STUDENTS.length - 1]?.roll ?? 'EXS1120';

    return NextResponse.json({
      success: true,
      message: `ElevateX Slot 1 test students are ready (${firstRoll}–${lastRoll}, ${ELEVATEX_SAMPLE_COUNT} accounts). Legacy EX26001–15 removed.`,
      password: result.password,
      appUrl: ready.appUrl,
      rdsProject: result.rdsProject,
      scheduleId: result.scheduleId,
      scheduleWarning: result.scheduleWarning,
      scheduleLabel: result.scheduleLabel,
      legacyRemoved: result.legacyRemoved,
      accounts: result.accounts,
      studentLogin: '/auth/login/student',
      credentialsCsv: '/api/setup/elevatex-credentials',
      csvWriteSkipped: csvPath === null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ElevateX seed failed unexpectedly';
    console.error('[seed-elevatex-sample]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
