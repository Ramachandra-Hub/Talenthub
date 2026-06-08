'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminTestDetailModal } from '@/components/admin/admin-test-detail-modal';
import type {
  AdminTestBucket,
  AdminTestOverviewItem,
  AdminTestsOverviewPayload,
} from '@/lib/admin/tests-overview-data';
import { formatCollegeDateTime } from '@/lib/college-timezone';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | AdminTestBucket;

function statusTone(status: AdminTestBucket) {
  if (status === 'live') return 'success';
  if (status === 'upcoming') return 'warning';
  return 'danger';
}

function formatSchedule(starts: string | null, ends: string | null): string {
  if (!starts) return 'Not scheduled';
  const startLabel = formatCollegeDateTime(starts);
  if (!ends) return startLabel;
  return `${startLabel} → ${formatCollegeDateTime(ends)}`;
}

export default function AdminTestsPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tests, setTests] = useState<AdminTestOverviewItem[]>([]);
  const [counts, setCounts] = useState<AdminTestsOverviewPayload['counts']>({
    live: 0,
    upcoming: 0,
    ended: 0,
    total: 0,
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTest, setSelectedTest] = useState<AdminTestOverviewItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/tests-overview', { credentials: 'include' });
      const json = (await res.json()) as AdminTestsOverviewPayload & { error?: string };

      if (!res.ok) {
        setLoadError(json.error ?? 'Failed to load tests');
        return;
      }

      setLoadError(null);
      setTests(json.tests ?? []);
      setCounts(json.counts ?? { live: 0, upcoming: 0, ended: 0, total: 0 });
    } catch {
      setLoadError('Failed to load tests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (counts.live === 0) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [counts.live]);

  const filteredTests = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return tests.filter((test) => {
      const matchesStatus = statusFilter === 'all' || test.status === statusFilter;
      const haystack = [
        test.title,
        test.kind_label,
        test.status_label,
        ...test.departments,
        test.topic ?? '',
      ]
        .join(' ')
        .toLowerCase();
      const matchesSearch = !q || haystack.includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [tests, statusFilter, searchTerm]);

  const openTestDetails = (test: AdminTestOverviewItem) => {
    setSelectedTest(test);
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p className="text-gray-600">Loading tests…</p>
      </div>
    );
  }

  const filterTabs: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.total },
    { id: 'live', label: 'Live', count: counts.live },
    { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
    { id: 'ended', label: 'Ended', count: counts.ended },
  ];

  return (
    <div>
      <AdminPageHeader
        title="Tests"
        description="All faculty exams, ElevateX modules, and scheduled assessments — live, upcoming, and ended."
      />

      {loadError ? (
        <Card className="p-4 mb-6 border-red-200 bg-red-50 text-red-800 text-sm">{loadError}</Card>
      ) : null}

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-sm text-gray-600">Total tests</p>
          <p className="text-3xl font-bold text-[#1e3a5f]">{counts.total}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-600">Live now</p>
          <p className="text-3xl font-bold text-green-600">{counts.live}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-600">Upcoming</p>
          <p className="text-3xl font-bold text-amber-600">{counts.upcoming}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-gray-600">Ended</p>
          <p className="text-3xl font-bold text-red-600">{counts.ended}</p>
        </Card>
      </div>

      <Card className="p-4 mb-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition border',
                statusFilter === tab.id
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300',
              )}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-[1fr_auto] gap-3">
          <Input
            placeholder="Search by title, department, or type…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Link
            href="/admin/test-attempts"
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-[#1e3a5f] hover:bg-gray-50"
          >
            Open attempt monitor →
          </Link>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Test</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Type</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Schedule</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Departments</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Writing</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Submitted</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredTests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-500">
                    No tests match the current filters.
                  </td>
                </tr>
              ) : (
                filteredTests.map((test) => (
                  <tr
                    key={test.id}
                    className="border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer transition"
                    onClick={() => openTestDetails(test)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openTestDetails(test);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`View details for ${test.title}`}
                  >
                    <td className="py-3 px-4">
                      <p className="text-sm font-semibold text-gray-900">{test.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{test.status_label}</p>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700">{test.kind_label}</td>
                    <td className="py-3 px-4">
                      <Badge tone={statusTone(test.status)} className="capitalize">
                        {test.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 max-w-xs">
                      {formatSchedule(test.starts_at, test.ends_at)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700 max-w-xs">
                      {test.departments.length > 0 ? test.departments.join(', ') : 'All departments'}
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-semibold text-amber-700">
                      {test.status === 'live' ? test.students_writing : '—'}
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-semibold text-green-700">
                      {test.completed_attempts}
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-semibold text-[#1e3a5f]">
                      {test.students_attempted}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <AdminTestDetailModal
        test={selectedTest}
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setSelectedTest(null);
        }}
        onDeleted={() => void load()}
      />
    </div>
  );
}
