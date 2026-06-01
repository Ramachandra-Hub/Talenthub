'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { readJsonResponse } from '@/lib/fetch-json';
import { studentAuthEmail } from '@/lib/college-auth';
import {
  ELEVATEX_SAMPLE_COUNT,
  ELEVATEX_SAMPLE_PASSWORD,
  ELEVATEX_SAMPLE_STUDENTS,
} from '@/lib/elevatex-sample-credentials';

const ELEVATEX_FIRST_ROLL = ELEVATEX_SAMPLE_STUDENTS[0]?.roll ?? 'EXS1001';
const ELEVATEX_LAST_ROLL =
  ELEVATEX_SAMPLE_STUDENTS[ELEVATEX_SAMPLE_STUDENTS.length - 1]?.roll ?? 'EXS1120';
const ELEVATEX_ROLL_RANGE = `${ELEVATEX_FIRST_ROLL}–${ELEVATEX_LAST_ROLL}`;
const ELEVATEX_CREDENTIALS_CSV_URL = '/api/setup/elevatex-credentials';

type SeedAccount = {
  roll: string;
  email: string;
  department: string;
  year: string;
  status?: string;
};

export default function SetupPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [elevatexLoading, setElevatexLoading] = useState(false);
  const [elevatexResetLoading, setElevatexResetLoading] = useState(false);
  const [elevatexAttemptsResetLoading, setElevatexAttemptsResetLoading] = useState(false);
  const [elevatexPassword, setElevatexPassword] = useState<string | null>(null);
  const [elevatexAccounts, setElevatexAccounts] = useState<SeedAccount[]>([]);
  const [elevatexMeta, setElevatexMeta] = useState<string | null>(null);
  const [elevatexCsvUrl, setElevatexCsvUrl] = useState(ELEVATEX_CREDENTIALS_CSV_URL);

  const defaultElevatexAccounts = useMemo(
    () =>
      ELEVATEX_SAMPLE_STUDENTS.map((s) => ({
        roll: s.roll,
        email: studentAuthEmail(s.roll),
        department: s.department,
        year: s.year,
      })),
    [],
  );

  const displayedAccounts =
    elevatexAccounts.length > 0 ? elevatexAccounts : defaultElevatexAccounts;

  const handleResetElevateXAttempts = async () => {
    if (
      !window.confirm(
        `Clear ElevateX exam attempts for all ${ELEVATEX_SAMPLE_COUNT} demo students (${ELEVATEX_ROLL_RANGE})? They keep the same login password and can take the paper again.`,
      )
    ) {
      return;
    }
    setElevatexAttemptsResetLoading(true);
    setElevatexMeta(null);
    setError(null);
    try {
      const res = await fetch('/api/setup/reset-elevatex-attempts', { method: 'POST' });
      const raw = await res.text();
      let json: {
        error?: string;
        message?: string;
        studentsFound?: number;
        attemptsDeleted?: number;
      } = {};
      if (raw.trim()) {
        try {
          json = JSON.parse(raw) as typeof json;
        } catch {
          throw new Error(
            raw.slice(0, 200) || `Reset failed with empty response (HTTP ${res.status})`,
          );
        }
      } else if (!res.ok) {
        throw new Error(`Reset failed with empty response (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error(json.error ?? 'ElevateX attempt reset failed');
      setElevatexMeta(
        json.message ??
          `Cleared ${json.attemptsDeleted ?? 0} attempt(s) for ${json.studentsFound ?? 0} student(s).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ElevateX attempt reset failed');
    } finally {
      setElevatexAttemptsResetLoading(false);
    }
  };

  const handleResetElevateX = async () => {
    if (
      !window.confirm(
        `Remove all ${ELEVATEX_SAMPLE_COUNT} ElevateX demo logins (${ELEVATEX_ROLL_RANGE})? Students will need to sign up again with their own password.`,
      )
    ) {
      return;
    }
    setElevatexResetLoading(true);
    setElevatexMeta(null);
    setError(null);
    try {
      const res = await fetch('/api/setup/reset-elevatex-sample', { method: 'POST' });
      const raw = await res.text();
      let json: {
        error?: string;
        message?: string;
        deletedRolls?: string[];
        notFoundRolls?: string[];
        attemptsDeleted?: number;
      } = {};
      if (raw.trim()) {
        try {
          json = JSON.parse(raw) as typeof json;
        } catch {
          throw new Error(
            raw.slice(0, 200) || `Reset failed with empty response (HTTP ${res.status})`,
          );
        }
      } else if (!res.ok) {
        throw new Error(`Reset failed with empty response (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error(json.error ?? 'ElevateX reset failed');
      setElevatexPassword(null);
      setElevatexAccounts([]);
      setElevatexMeta(
        json.message ??
          `Removed ${json.deletedRolls?.length ?? 0} demo account(s). ${json.attemptsDeleted ?? 0} test attempt(s) cleared.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ElevateX reset failed');
    } finally {
      setElevatexResetLoading(false);
    }
  };

  const handleSeedElevateX = async () => {
    setElevatexLoading(true);
    setElevatexMeta(null);
    setError(null);
    try {
      const res = await fetch('/api/setup/seed-elevatex-sample', { method: 'POST' });
      const raw = await res.text();
      let json: {
        error?: string;
        password?: string;
        rdsProject?: string;
        scheduleLabel?: string;
        scheduleWarning?: string;
        legacyRemoved?: string[];
        accounts?: SeedAccount[];
        credentialsCsv?: string;
      } = {};
      if (raw.trim()) {
        try {
          json = JSON.parse(raw) as typeof json;
        } catch {
          throw new Error(
            raw.slice(0, 200) || `Seed failed with empty response (HTTP ${res.status})`,
          );
        }
      } else if (!res.ok) {
        throw new Error(`Seed failed with empty response (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error(json.error ?? 'ElevateX seed failed');
      setElevatexPassword(json.password ?? ELEVATEX_SAMPLE_PASSWORD);
      setElevatexAccounts(json.accounts ?? defaultElevatexAccounts);
      if (json.credentialsCsv) setElevatexCsvUrl(json.credentialsCsv);
      const parts = [
        `Created ${json.accounts?.length ?? ELEVATEX_SAMPLE_COUNT} accounts (${json.rdsProject ?? 'RDS'}).`,
        json.scheduleLabel ? `Schedule: ${json.scheduleLabel}.` : null,
        json.scheduleWarning ? `Schedule note: ${json.scheduleWarning}` : null,
        json.legacyRemoved?.length
          ? `Removed old rolls: ${json.legacyRemoved.join(', ')}.`
          : null,
      ].filter(Boolean);
      setElevatexMeta(parts.join(' '));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ElevateX seed failed');
    } finally {
      setElevatexLoading(false);
    }
  };

  const handleInitialize = async () => {
    setLoading(true);
    setStatus('Checking database mode...');
    setError(null);

    try {
      const statusRes = await fetch('/api/setup/rds', { cache: 'no-store' });
      const { json: statusJson } = await readJsonResponse<{
        mode?: string;
        error?: string;
        schemaReady?: boolean;
        needsSchema?: boolean;
        setupComplete?: boolean;
        adminEmail?: string;
        userCount?: number;
        categoryCount?: number;
      }>(statusRes);

      if (!statusRes.ok) {
        throw new Error(statusJson.error ?? `Setup status failed (HTTP ${statusRes.status})`);
      }

      if (statusJson.mode === 'aws') {
        if (statusJson.setupComplete) {
          setStatus(
            `Database is already set up (${statusJson.userCount ?? 0} user(s), ${statusJson.categoryCount ?? 0} categories). Sign in at /auth/login/admin as ${statusJson.adminEmail ?? 'admin@rce.ac.in'}.`,
          );
          setCompleted(true);
          return;
        }

        setStatus('Creating tables and columns on AWS RDS (Prisma schema sync)...');
        const rdsRes = await fetch('/api/setup/rds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'all' }),
        });
        const { json: rdsJson } = await readJsonResponse<{
          error?: string;
          detail?: string;
          hint?: string;
          message?: string;
          alreadyConfigured?: boolean;
          adminEmail?: string;
          results?: { admin?: { email?: string } };
        }>(rdsRes);
        if (!rdsRes.ok && !rdsJson.alreadyConfigured) {
          throw new Error(rdsJson.detail ?? rdsJson.hint ?? rdsJson.error ?? 'RDS setup failed');
        }
        if (rdsJson.alreadyConfigured && !rdsRes.ok) {
          setStatus(
            rdsJson.message ??
              `Already set up. Sign in at /auth/login/admin as ${rdsJson.adminEmail ?? 'admin@rce.ac.in'}.`,
          );
          setCompleted(true);
          return;
        }
        const adminEmail =
          rdsJson.results?.admin?.email ?? rdsJson.adminEmail ?? statusJson.adminEmail;
        setStatus(
          rdsJson.message ??
            `RDS ready.${adminEmail ? ` Admin: ${adminEmail}` : ''} Use /auth/login/admin`,
        );
        setCompleted(true);
        return;
      }

      setStatus('Initializing database (legacy path — requires POSTGRES_URL)...');
      const initResponse = await fetch('/api/setup/init-direct', { method: 'POST' });
      const { json: initData } = await readJsonResponse<{ error?: string }>(initResponse);
      if (!initResponse.ok) {
        throw new Error(initData.error || 'Database initialization failed');
      }

      setStatus('Seeding sample data...');
      const seedResponse = await fetch('/api/setup/seed-direct', { method: 'POST' });
      const { json: seedData } = await readJsonResponse<{ error?: string }>(seedResponse);
      if (!seedResponse.ok) {
        throw new Error(seedData.error || 'Data seeding failed');
      }

      setStatus('Setup completed successfully!');
      setCompleted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Database Setup</h1>
          <p className="text-gray-600">
            AWS RDS: creates all tables/columns from Prisma, admin, and sample tests. AWS RDS: legacy
            path below.
          </p>
            </div>

        {error ? (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
        ) : null}

        {status ? (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700">{status}</div>
        ) : null}

        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h2 className="font-semibold text-gray-900 mb-2">What will be created:</h2>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>✓ Database tables (users, tests, questions, etc.)</li>
              <li>✓ Load sample test categories</li>
              <li>✓ Load sample tests and questions</li>
              <li>✓ Load sample blog posts</li>
            </ul>
          </div>

          <Button
            onClick={() => void handleInitialize()}
            disabled={loading || completed}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? 'Initializing...' : completed ? 'Completed' : 'Start Setup'}
          </Button>

          <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
            <h2 className="font-semibold text-gray-900">
              ElevateX Slot 1 — {ELEVATEX_SAMPLE_COUNT} test logins
            </h2>
            <p className="text-sm text-gray-600">
              Creates <strong>{ELEVATEX_ROLL_RANGE}</strong> (replaces old EX26001–15). Password for all:{' '}
              <strong>ElevateX2026</strong>. Year on login: <strong>III Year</strong>.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSeedElevateX()}
                disabled={
                  elevatexLoading || elevatexResetLoading || elevatexAttemptsResetLoading
                }
                className="w-full sm:flex-1"
              >
                {elevatexLoading
                  ? 'Seeding ElevateX…'
                  : `Seed / refresh ${ELEVATEX_SAMPLE_COUNT} ElevateX credentials`}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleResetElevateXAttempts()}
                disabled={
                  elevatexLoading || elevatexResetLoading || elevatexAttemptsResetLoading
                }
                className="w-full sm:flex-1 text-amber-800 border-amber-200 hover:bg-amber-50"
              >
                {elevatexAttemptsResetLoading
                  ? 'Clearing attempts…'
                  : `Allow retake (${ELEVATEX_SAMPLE_COUNT} students)`}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleResetElevateX()}
                disabled={
                  elevatexLoading || elevatexResetLoading || elevatexAttemptsResetLoading
                }
                className="w-full sm:flex-1 text-red-700 border-red-200 hover:bg-red-50"
              >
                {elevatexResetLoading
                  ? 'Resetting…'
                  : `Delete ${ELEVATEX_SAMPLE_COUNT} demo logins`}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              <strong>Allow retake</strong> keeps {ELEVATEX_ROLL_RANGE} logins (password{' '}
              <code className="bg-gray-100 px-1 rounded">ElevateX2026</code>) and clears completed
              papers so students can write ElevateX again.{' '}
              <strong>Delete {ELEVATEX_SAMPLE_COUNT} demo logins</strong> removes accounts for fresh signup.{' '}
              <strong>Seed</strong> recreates demo accounts.
            </p>

            {elevatexMeta ? (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-900">
                {elevatexMeta}
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold text-gray-900">
                  Shared password:{' '}
                  <code className="bg-gray-100 px-2 py-0.5 rounded">
                    {elevatexPassword ?? ELEVATEX_SAMPLE_PASSWORD}
                  </code>
                </span>
                <a
                  href={elevatexCsvUrl}
                  download="elevatex-slot1-credentials.csv"
                  className="text-blue-600 hover:underline font-medium"
                >
                  Download CSV ({ELEVATEX_SAMPLE_COUNT} rows)
                </a>
                <a href="/auth/login/student" className="text-blue-600 hover:underline font-medium">
                  Student login →
                </a>
              </div>
              <div className="max-h-96 overflow-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-semibold">#</th>
                      <th className="text-left p-2 font-semibold">Roll</th>
                      <th className="text-left p-2 font-semibold">Email</th>
                      <th className="text-left p-2 font-semibold">Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedAccounts.map((a, i) => (
                      <tr key={a.roll} className="border-t border-gray-100 odd:bg-white even:bg-gray-50/80">
                        <td className="p-2 text-gray-500">{i + 1}</td>
                        <td className="p-2 font-mono font-semibold text-gray-900">{a.roll}</td>
                        <td className="p-2 font-mono text-gray-700">{a.email}</td>
                        <td className="p-2 text-gray-700">{a.department}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500">
                Click &quot;Seed / refresh&quot; above to create these accounts in AWS RDS (required before
                login works on this deployment).
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
