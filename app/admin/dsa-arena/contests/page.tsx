'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  problems?: Array<{ position: number; title: string }>;
};

type BankProblem = {
  id: string;
  title: string;
  difficulty: string;
  category: string | null;
  tags: string[];
};

export default function AdminDsaContestsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [contests, setContests] = useState<ContestRow[]>([]);
  const [bank, setBank] = useState<BankProblem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [students, setStudents] = useState<unknown[]>([]);
  const [problems, setProblems] = useState<unknown[]>([]);
  const [submissions, setSubmissions] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [oRes, cRes, bRes] = await Promise.all([
      fetch('/api/admin/dsa/contests?view=overview', { credentials: 'include' }),
      fetch('/api/admin/dsa/contests', { credentials: 'include' }),
      fetch('/api/admin/dsa/contests?view=bank', { credentials: 'include' }),
    ]);
    if (!oRes.ok || !cRes.ok) {
      setError('Failed to load admin contest data');
      return;
    }
    setOverview(await oRes.json());
    const cJson = await cRes.json();
    setContests(cJson.contests ?? []);
    if (bRes.ok) {
      const bJson = await bRes.json();
      setBank(bJson.problems ?? []);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

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

  const togglePick = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const createContest = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/dsa/contests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || `DSA Arena Coding Challenge Draft`,
          durationMinutes: 60,
          problemIds: picked,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Create failed');
        return;
      }
      setMessage(`Created draft contest ${json.contest?.slug ?? ''}`);
      setTitle('');
      setPicked([]);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const patchContest = async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/dsa/contests/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Update failed');
        return;
      }
      setMessage(`Updated ${json.contest?.title ?? id}`);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const bankByCategory = useMemo(() => {
    const map = new Map<string, BankProblem[]>();
    for (const p of bank) {
      const key = p.category || 'Uncategorized';
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [bank]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          DSA Arena
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">Coding Contests</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage contests from the imported 50-question bank. Published contests require exactly 3
          problems.
        </p>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

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

      <section className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Create contest</h2>
        <p className="text-xs text-slate-500">
          Question bank loaded: {bank.length} problems. Select up to 3 for a draft (exactly 3 to
          publish).
        </p>
        <input
          className="w-full rounded border px-3 py-2 text-sm"
          placeholder="Contest title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="max-h-64 overflow-y-auto rounded border p-2 text-xs space-y-3">
          {bankByCategory.map(([cat, items]) => (
            <div key={cat}>
              <p className="mb-1 font-semibold text-slate-600">{cat}</p>
              <div className="space-y-1">
                {items.map((p) => {
                  const checked = picked.includes(p.id);
                  return (
                    <label key={p.id} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && picked.length >= 3}
                        onChange={() => togglePick(p.id)}
                      />
                      <span>
                        <span className="font-medium text-slate-800">{p.title}</span>
                        <span className="text-slate-500">
                          {' '}
                          · {p.difficulty}
                          {p.tags.length ? ` · ${p.tags.slice(0, 3).join(', ')}` : ''}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {!bank.length ? (
            <p className="text-slate-500">
              No bank problems yet. Run `pnpm run import:dsa-contests` first.
            </p>
          ) : null}
        </div>
        <p className="text-xs text-slate-600">Selected: {picked.length} / 3</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void createContest()}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Create draft contest
        </button>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Contest list</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Title</th>
                <th>Status</th>
                <th>Problems</th>
                <th>Attempts</th>
                <th>Subs</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contests.map((c) => (
                <tr key={c.id} className="border-t align-top">
                  <td className="py-2 font-medium">
                    {c.title}
                    <div className="text-[11px] font-normal text-slate-500">{c.slug}</div>
                  </td>
                  <td>
                    {c.status}
                    {c.isPublished ? ' · published' : ''}
                  </td>
                  <td>
                    {c.problemCount}
                    {c.problems?.length ? (
                      <ul className="mt-1 text-[11px] text-slate-500">
                        {c.problems.map((p) => (
                          <li key={p.position}>
                            {p.position}. {p.title}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td>{c.attemptCount}</td>
                  <td>{c.submissionCount}</td>
                  <td className="space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      className="text-cyan-700 hover:underline"
                      onClick={() => void openContest(c.id)}
                    >
                      Analytics
                    </button>
                    <button
                      type="button"
                      disabled={busy || c.problemCount !== 3}
                      className="text-emerald-700 hover:underline disabled:opacity-40"
                      onClick={() => void patchContest(c.id, { action: 'activate' })}
                    >
                      Publish/Activate
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-amber-700 hover:underline disabled:opacity-40"
                      onClick={() => void patchContest(c.id, { action: 'unpublish' })}
                    >
                      Unpublish
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-rose-700 hover:underline disabled:opacity-40"
                      onClick={() => void patchContest(c.id, { action: 'end' })}
                    >
                      End
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
