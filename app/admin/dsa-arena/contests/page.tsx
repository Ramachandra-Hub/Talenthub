'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Overview = {
  totalContests: number;
  publishedContests: number;
  studentsParticipated: number;
  totalSubmissions: number;
  totalProblemsSolved: number;
  averageScorePercent: number;
  averageRuntimeMs: number | null;
  javaAttempts: number;
  pythonAttempts: number;
  javaSuccessRate: number;
  pythonSuccessRate: number;
};

type ContestRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  isPublished: boolean;
  problemCount: number;
  attemptCount: number;
  submissionCount: number;
};

export default function AdminDsaContestsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [contests, setContests] = useState<ContestRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [students, setStudents] = useState<unknown[]>([]);
  const [problems, setProblems] = useState<unknown[]>([]);
  const [submissions, setSubmissions] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [oRes, cRes] = await Promise.all([
        fetch('/api/admin/dsa/contests?view=overview', { credentials: 'include' }),
        fetch('/api/admin/dsa/contests', { credentials: 'include' }),
      ]);
      if (!oRes.ok || !cRes.ok) {
        setError('Failed to load admin contest data');
        return;
      }
      setOverview(await oRes.json());
      const cJson = await cRes.json();
      setContests(cJson.contests ?? []);
    };
    void load();
  }, []);

  const openContest = async (id: string) => {
    setSelected(id);
    const [sRes, pRes, subRes] = await Promise.all([
      fetch(`/api/admin/dsa/contests/${id}/analytics?view=students`, {
        credentials: 'include',
      }),
      fetch(`/api/admin/dsa/contests/${id}/analytics?view=problems`, {
        credentials: 'include',
      }),
      fetch(`/api/admin/dsa/contests/${id}/analytics?view=submissions`, {
        credentials: 'include',
      }),
    ]);
    if (sRes.ok) setStudents((await sRes.json()).students ?? []);
    if (pRes.ok) setProblems((await pRes.json()).problems ?? []);
    if (subRes.ok) setSubmissions((await subRes.json()).submissions ?? []);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          DSA Arena
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">Coding Contests</h1>
        <p className="mt-1 text-sm text-slate-600">
          Contest analytics are separate from Exam / Placement coding.
        </p>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {overview ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Contests', overview.totalContests],
            ['Published', overview.publishedContests],
            ['Participants', overview.studentsParticipated],
            ['Submissions', overview.totalSubmissions],
            ['Problems solved', overview.totalProblemsSolved],
            ['Avg score %', overview.averageScorePercent],
            ['Java attempts', overview.javaAttempts],
            ['Python attempts', overview.pythonAttempts],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border bg-white p-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Contest list</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Title</th>
                <th>Status</th>
                <th>Problems</th>
                <th>Attempts</th>
                <th>Subs</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {contests.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-2 font-medium">{c.title}</td>
                  <td>
                    {c.status}
                    {c.isPublished ? ' · published' : ''}
                  </td>
                  <td>{c.problemCount}</td>
                  <td>{c.attemptCount}</td>
                  <td>{c.submissionCount}</td>
                  <td>
                    <button
                      type="button"
                      className="text-cyan-700 hover:underline"
                      onClick={() => void openContest(c.id)}
                    >
                      Analytics
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <div className="space-y-4">
          <Section title="Student performance" rows={students as Record<string, unknown>[]} />
          <Section title="Problem analytics" rows={problems as Record<string, unknown>[]} />
          <Section
            title="Submission history (source visible to admin)"
            rows={(submissions as Record<string, unknown>[]).map((s) => ({
              id: s.id,
              student: s.studentName,
              roll: s.rollNumber,
              problem: s.problemTitle,
              language: s.language,
              status: s.status,
              score: s.scorePercent,
              passed: `${s.passed}/${s.total}`,
              runtimeMs: s.runtimeMs,
              submittedAt: s.submittedAt,
            }))}
          />
        </div>
      ) : null}

      <Link href="/admin/dashboard" className="text-sm text-cyan-700 hover:underline">
        ← Admin dashboard
      </Link>
    </div>
  );
}

function Section({
  title,
  rows,
}: {
  title: string;
  rows: Record<string, unknown>[];
}) {
  if (!rows.length) {
    return (
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">No rows yet.</p>
      </section>
    );
  }
  const keys = Object.keys(rows[0]!).slice(0, 12);
  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm overflow-x-auto">
      <h2 className="text-sm font-semibold">{title}</h2>
      <table className="mt-3 w-full min-w-[800px] text-left text-xs">
        <thead className="uppercase text-slate-500">
          <tr>
            {keys.map((k) => (
              <th key={k} className="py-1 pr-2">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t align-top">
              {keys.map((k) => (
                <td key={k} className="py-1.5 pr-2">
                  {formatCell(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function formatCell(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}
