'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import {
  attemptStatusBadgeClass,
  formatAttemptStatus,
  isCompletedAttemptStatus,
  isInProgressStatus,
  normalizeAttemptStatus,
} from '@/lib/attempt-status';
import { averageScorePercent, formatScorePercentLabel } from '@/lib/format-score';
import { testIdsMatch } from '@/lib/test-attempts';
import { cn } from '@/lib/utils';

const POLL_MS = 5000;

type AttemptWithMeta = {
  id: string | number;
  user_id: string;
  test_id: string | null;
  score: number | null;
  status: string;
  created_at: string;
  completed_at?: string | null;
  testName: string;
  studentName: string;
  studentEmail: string;
  roll_number?: string;
  source?: string;
};

type TestOption = { id: string; name: string };

export default function AdminTestAttemptsPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [tests, setTests] = useState<TestOption[]>([]);
  const [attempts, setAttempts] = useState<AttemptWithMeta[]>([]);
  const [selectedTestId, setSelectedTestId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress' | 'abandoned'>(
    'all',
  );
  const [live, setLive] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/test-attempts', {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = (await res.json()) as {
        tests?: TestOption[];
        attempts?: AttemptWithMeta[];
        warnings?: string[];
        error?: string;
      };

      if (!res.ok) {
        setLoadError(json.error ?? 'Failed to load test attempts');
        return;
      }

      setLoadError(null);
      setTests(json.tests ?? []);
      setAttempts(json.attempts ?? []);
      setWarnings(json.warnings ?? []);
      setRefreshedAt(new Date().toISOString());
    } catch {
      setLoadError('Failed to load test attempts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [live, load]);

  const filteredAttempts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return attempts.filter((a) => {
      const matchesTest =
        selectedTestId === 'all' ||
        String(a.test_id) === selectedTestId ||
        (a.test_id != null && testIdsMatch(String(a.test_id), selectedTestId));
      const normalized = normalizeAttemptStatus(a.status);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'completed' && isCompletedAttemptStatus(a.status, a.completed_at)) ||
        (statusFilter === 'in_progress' && isInProgressStatus(a.status) && !a.completed_at) ||
        (statusFilter === 'abandoned' && normalized === 'abandoned');
      const matchesSearch =
        !q ||
        a.studentName.toLowerCase().includes(q) ||
        a.studentEmail.toLowerCase().includes(q) ||
        (a.roll_number ?? '').toLowerCase().includes(q) ||
        a.testName.toLowerCase().includes(q);
      return matchesTest && matchesStatus && matchesSearch;
    });
  }, [attempts, searchTerm, selectedTestId, statusFilter]);

  const summary = useMemo(() => {
    const total = filteredAttempts.length;
    const completed = filteredAttempts.filter((a) =>
      isCompletedAttemptStatus(a.status, a.completed_at),
    );
    const inProgress = filteredAttempts.filter(
      (a) => isInProgressStatus(a.status) && !a.completed_at,
    );
    const avgScore =
      completed.length > 0
        ? averageScorePercent(completed.map((a) => Number(a.score ?? 0)))
        : 0;
    const uniqueStudents = new Set(filteredAttempts.map((a) => String(a.user_id))).size;
    return { total, completed: completed.length, inProgress: inProgress.length, avgScore, uniqueStudents };
  }, [filteredAttempts]);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p className="text-gray-600">Loading attempt log…</p>
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="Attempt monitor"
        description="Live submission log — ElevateX, faculty exams, and practice tests. Auto-refreshes every 5s."
        actions={
          <div className="flex gap-2">
            <Button variant={live ? 'default' : 'outline'} size="sm" onClick={() => setLive((v) => !v)}>
              {live ? 'Live refresh on' : 'Live refresh off'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      />

      {loadError ? (
        <Card className="p-4 mb-6 border-red-200 bg-red-50 text-red-800 text-sm">{loadError}</Card>
      ) : null}

      {warnings.length > 0 ? (
        <Card className="p-4 mb-6 border-amber-200 bg-amber-50 text-amber-900 text-sm space-y-1">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </Card>
      ) : null}

      <div className="grid md:grid-cols-5 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-sm text-gray-600">Attempts</p>
          <p className="text-3xl font-bold text-blue-600">{summary.total}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-600">In progress</p>
          <p className="text-3xl font-bold text-amber-600">{summary.inProgress}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-600">Completed</p>
          <p className="text-3xl font-bold text-green-600">{summary.completed}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-600">Students</p>
          <p className="text-3xl font-bold text-[#1e3a5f]">{summary.uniqueStudents}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-600">Average score</p>
          <p className="text-3xl font-bold text-orange-600">{formatScorePercentLabel(summary.avgScore)}</p>
        </Card>
      </div>

      <Card className="p-4 mb-6">
        <div className="grid md:grid-cols-4 gap-3">
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={selectedTestId}
            onChange={(e) => setSelectedTestId(e.target.value)}
          >
            <option value="all">All tests</option>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | 'completed' | 'in_progress' | 'abandoned')
            }
          >
            <option value="all">All status</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="abandoned">Abandoned</option>
          </select>

          <Input
            placeholder="Search name, email, or roll…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="md:col-span-2"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
          <table className="admin-table">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-2.5 px-3 text-sm font-semibold text-gray-700">Test</th>
                <th className="text-left py-2.5 px-3 text-sm font-semibold text-gray-700">Student</th>
                <th className="text-left py-2.5 px-3 text-sm font-semibold text-gray-700">Score</th>
                <th className="text-left py-2.5 px-3 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left py-2.5 px-3 text-sm font-semibold text-gray-700 hidden md:table-cell">Attempted</th>
              </tr>
            </thead>
            <tbody>
              {filteredAttempts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-gray-500">
                    No student attempts found for the current filters.
                  </td>
                </tr>
              ) : (
                filteredAttempts.map((a) => (
                  <tr key={String(a.id)} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-sm text-gray-900 truncate" title={a.testName}>
                      {a.testName}
                    </td>
                    <td className="py-2.5 px-3 text-sm min-w-0">
                      <p className="font-medium text-gray-900 truncate">{a.studentName}</p>
                      <p className="text-xs text-gray-500 truncate">{a.studentEmail}</p>
                      <p className="text-xs font-mono text-gray-600">{a.roll_number || '—'}</p>
                    </td>
                    <td className="py-2.5 px-3 text-sm font-semibold text-blue-700">
                      {a.score == null ? '—' : formatScorePercentLabel(Number(a.score))}
                    </td>
                    <td className="py-2.5 px-3 text-sm">
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          attemptStatusBadgeClass(a.status),
                        )}
                      >
                        {formatAttemptStatus(a.status)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-sm text-gray-600 hidden md:table-cell">
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        {refreshedAt ? (
          <p className="text-xs text-gray-500 px-4 py-3 border-t border-gray-100">
            Last updated {new Date(refreshedAt).toLocaleTimeString()} · {attempts.length} total in log
          </p>
        ) : null}
      </Card>
    </div>
  );
}
