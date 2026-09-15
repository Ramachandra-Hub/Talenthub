'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileSpreadsheet, Search, Trophy, X, Zap } from 'lucide-react';
import { downloadXlsxWorkbook } from '@/lib/reports/xlsx-workbook';
import {
  ReportBarCard,
  ReportChartGrid,
  ReportDonutCard,
} from '@/components/admin/admin-report-charts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { COLLEGE } from '@/lib/college-brand';
import type { AdminContestTournamentPayload } from '@/lib/dsa/contest/admin-tournament';
import { cn } from '@/lib/utils';

type TournamentPayload = AdminContestTournamentPayload;
type Standing = TournamentPayload['standings'][number];

type DetailKey =
  | 'fighters'
  | 'wins'
  | 'solved'
  | 'avg'
  | 'language'
  | 'tiers'
  | 'year'
  | 'branch'
  | null;

function initials(name: string | null | undefined, roll: string | null | undefined): string {
  const src = (name || roll || '?').trim();
  return src.slice(0, 2).toUpperCase();
}

function RingStat({
  label,
  value,
  hint,
  percent,
  accent,
  onClick,
}: {
  label: string;
  value: string | number;
  hint: string;
  percent: number;
  accent: string;
  onClick: () => void;
}) {
  const p = Math.max(0, Math.min(100, percent));
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (p / 100) * c;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-[#12181f]/90 px-4 py-4 text-left transition hover:border-amber-400/40 hover:bg-[#161e27]"
    >
      <div className="relative h-[84px] w-[84px] shrink-0">
        <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
          <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
          <circle
            cx="42"
            cy="42"
            r={r}
            fill="none"
            stroke={accent}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-black tabular-nums text-white">{value}</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">{label}</p>
        <p className="mt-1 text-sm font-semibold text-white/90 group-hover:text-amber-200">{hint}</p>
        <p className="mt-1 text-[11px] text-cyan-300/80">Open full intel →</p>
      </div>
    </button>
  );
}

function FighterCard({
  fighter,
  selected,
  onSelect,
}: {
  fighter: Standing;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
        selected
          ? 'border-amber-400/50 bg-amber-400/10'
          : 'border-white/8 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black',
          fighter.globalRank === 1
            ? 'bg-amber-400 text-[#111]'
            : fighter.globalRank === 2
              ? 'bg-slate-300 text-[#111]'
              : fighter.globalRank === 3
                ? 'bg-orange-500 text-white'
                : 'bg-white/10 text-white/80',
        )}
      >
        {fighter.globalRank}
      </span>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#0b1220]"
        style={{ background: fighter.tierColor }}
      >
        {initials(fighter.name, fighter.rollNumber)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">
          {fighter.name || fighter.rollNumber || 'Unknown'}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-white/50">
          {fighter.tierLabel} · {fighter.branch} · {fighter.year === '—' ? 'Year n/a' : fighter.year}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-bold tabular-nums text-amber-300">{fighter.wins}</span>
        <span className="text-[10px] uppercase tracking-wide text-white/40">wins</span>
      </span>
    </button>
  );
}

export function DsaContestTournamentDashboard({
  onOpenContestAnalytics,
}: {
  onOpenContestAnalytics?: (contestId: string, title: string) => void;
}) {
  const [payload, setPayload] = useState<TournamentPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<DetailKey>(null);
  const [mounted, setMounted] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const downloadExcelReport = async () => {
    setExportBusy(true);
    setExportError(null);
    try {
      const q = new URLSearchParams();
      if (yearFilter !== 'all') q.set('year', yearFilter);
      if (branchFilter !== 'all') q.set('branch', branchFilter);
      const qs = q.toString();
      const res = await fetch(
        `/api/admin/dsa/contests?view=export${qs ? `&${qs}` : ''}`,
        { credentials: 'include', cache: 'no-store' },
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? 'Export failed');
      }
      await downloadXlsxWorkbook(json);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportBusy(false);
    }
  };

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch('/api/admin/dsa/contests?view=tournament', {
          credentials: 'include',
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Failed to load tournament');
        if (!cancelled) {
          setPayload(json as TournamentPayload);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load tournament');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredStandings = useMemo(() => {
    if (!payload) return [];
    const q = search.trim().toLowerCase();
    return payload.standings.filter((s) => {
      if (yearFilter !== 'all' && s.year !== yearFilter) return false;
      if (branchFilter !== 'all' && s.branch !== branchFilter) return false;
      if (!q) return true;
      return (
        (s.name ?? '').toLowerCase().includes(q) ||
        (s.rollNumber ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q) ||
        s.branch.toLowerCase().includes(q)
      );
    });
  }, [payload, yearFilter, branchFilter, search]);

  const selectedFighter = useMemo(() => {
    if (!selectedId) return filteredStandings[0] ?? null;
    return filteredStandings.find((s) => s.userId === selectedId) ?? filteredStandings[0] ?? null;
  }, [filteredStandings, selectedId]);

  const filteredSummary = useMemo(() => {
    const fighters = filteredStandings.length;
    const wins = filteredStandings.reduce((s, x) => s + x.wins, 0);
    const solved = filteredStandings.reduce((s, x) => s + x.totalSolved, 0);
    const avg =
      fighters > 0
        ? Math.round(
            (filteredStandings.reduce((s, x) => s + x.avgPercent, 0) / fighters) * 100,
          ) / 100
        : 0;
    return { fighters, wins, solved, avg };
  }, [filteredStandings]);

  const yearChart = useMemo(() => {
    if (!payload) return [];
    const map = new Map<string, { label: string; shortLabel: string; value: number; secondary: number }>();
    for (const s of filteredStandings) {
      const key = s.year;
      const prev = map.get(key) ?? {
        label: key === '—' ? 'Not set' : key,
        shortLabel: key === '—' ? 'N/A' : key.replace(/year/i, 'Y').slice(0, 8),
        value: 0,
        secondary: 0,
      };
      prev.value += 1;
      prev.secondary += s.wins;
      map.set(key, prev);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [payload, filteredStandings]);

  const branchChart = useMemo(() => {
    const map = new Map<string, { label: string; shortLabel: string; value: number; secondary: number }>();
    for (const s of filteredStandings) {
      const key = s.branch;
      const prev = map.get(key) ?? {
        label: key,
        shortLabel: key.length > 10 ? `${key.slice(0, 9)}…` : key,
        value: 0,
        secondary: 0,
      };
      prev.value += 1;
      prev.secondary += s.totalSolved;
      map.set(key, prev);
    }
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filteredStandings]);

  const languageChart = useMemo(() => {
    let java = 0;
    let python = 0;
    for (const s of filteredStandings) {
      java += s.javaSubs;
      python += s.pythonSubs;
    }
    return [
      { name: 'java', label: 'Java', value: java },
      { name: 'python', label: 'Python', value: python },
    ];
  }, [filteredStandings]);

  const tierChart = useMemo(() => {
    const counts = new Map<string, { name: string; label: string; value: number; color: string }>();
    for (const s of filteredStandings) {
      const prev = counts.get(s.tier) ?? {
        name: s.tier,
        label: s.tierLabel,
        value: 0,
        color: s.tierColor,
      };
      prev.value += 1;
      counts.set(s.tier, prev);
    }
    return [...counts.values()];
  }, [filteredStandings]);

  const detailMeta = useMemo(() => {
    switch (detailKey) {
      case 'fighters':
        return {
          title: 'Fighters in arena',
          subtitle: 'Students who entered at least one DSA coding contest',
          heroLabel: 'Fighters',
          heroValue: String(filteredSummary.fighters),
        };
      case 'wins':
        return {
          title: 'Chicken dinners',
          subtitle: 'Contest #1 finishes across filtered standings',
          heroLabel: 'Wins',
          heroValue: String(filteredSummary.wins),
        };
      case 'solved':
        return {
          title: 'Problems conquered',
          subtitle: 'Total problems solved across contest attempts',
          heroLabel: 'Solved',
          heroValue: String(filteredSummary.solved),
        };
      case 'avg':
        return {
          title: 'Combat score',
          subtitle: 'Average attempt percentage across fighters',
          heroLabel: 'Avg %',
          heroValue: `${filteredSummary.avg}%`,
        };
      case 'language':
        return {
          title: 'Weapon loadout',
          subtitle: 'Java vs Python submission volume',
          heroLabel: 'Subs',
          heroValue: String(languageChart.reduce((s, x) => s + x.value, 0)),
        };
      case 'tiers':
        return {
          title: 'Rank tiers',
          subtitle: 'PUBG-style combat tiers from score, wins, and consistency',
          heroLabel: 'Tiers',
          heroValue: String(tierChart.length),
        };
      case 'year':
        return {
          title: 'Year-wise battlefield',
          subtitle: 'Fighters and wins by academic year',
          heroLabel: 'Years',
          heroValue: String(yearChart.length),
        };
      case 'branch':
        return {
          title: 'Branch battlegrounds',
          subtitle: 'Participation and solves by department / branch',
          heroLabel: 'Branches',
          heroValue: String(branchChart.length),
        };
      default:
        return null;
    }
  }, [
    detailKey,
    filteredSummary,
    languageChart,
    tierChart,
    yearChart,
    branchChart,
  ]);

  if (loading) {
    return (
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b1118] p-8 text-center text-white">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-amber-300/80">
          Tournament command centre
        </p>
        <p className="mt-3 animate-pulse text-sm text-white/60">Dropping into the arena…</p>
      </section>
    );
  }

  if (loadError || !payload) {
    return (
      <section className="rounded-2xl border border-rose-400/30 bg-rose-950/40 p-4 text-sm text-rose-100">
        {loadError ?? 'Tournament data unavailable'}
      </section>
    );
  }

  const { summary, battles } = payload;
  const podium = filteredStandings.slice(0, 3);

  const detailModal =
    mounted && detailKey && detailMeta
      ? createPortal(
          <div
            className="fixed inset-0 z-[220] overflow-y-auto overscroll-contain"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dsa-tournament-detail-title"
          >
            <button
              type="button"
              className="fixed inset-0 bg-[#05080c]/80 backdrop-blur-md"
              aria-label="Close detail"
              onClick={() => setDetailKey(null)}
            />
            <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
              <div
                className="relative z-[1] my-auto flex max-h-[min(calc(100dvh-1.5rem),920px)] w-full max-w-5xl flex-col overflow-hidden rounded-[1.5rem] border border-amber-400/25 bg-[#f4f7fb] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="relative shrink-0 overflow-hidden bg-[#0d1520] px-6 py-7 text-white sm:px-8">
                  <div
                    className="pointer-events-none absolute inset-0 opacity-80"
                    style={{
                      background:
                        'radial-gradient(ellipse 70% 60% at 10% 0%, rgba(245,158,11,0.25), transparent 55%), radial-gradient(ellipse 50% 50% at 100% 100%, rgba(34,211,238,0.18), transparent 50%)',
                    }}
                    aria-hidden
                  />
                  <div className="relative flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-200/80">
                        {COLLEGE.rce} · DSA Tournament Intel
                      </p>
                      <h2
                        id="dsa-tournament-detail-title"
                        className="mt-2 text-2xl font-black tracking-tight"
                      >
                        {detailMeta.title}
                      </h2>
                      <p className="mt-1 text-sm text-white/70">{detailMeta.subtitle}</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/90">
                          {detailMeta.heroLabel}
                        </p>
                        <p className="text-3xl font-black tabular-nums">{detailMeta.heroValue}</p>
                      </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={exportBusy}
                      className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
                      onClick={() => void downloadExcelReport()}
                    >
                      <FileSpreadsheet className="h-4 w-4" aria-hidden />
                      Excel
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-white hover:bg-white/10"
                      onClick={() => setDetailKey(null)}
                      aria-label="Close"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
                <div className="relative mt-5 flex flex-wrap gap-2">
                    <select
                      value={yearFilter}
                      onChange={(e) => setYearFilter(e.target.value)}
                      className="h-9 rounded-lg border border-white/20 bg-[#0b1118] px-3 text-sm text-white"
                      aria-label="Filter by year"
                    >
                      {payload.yearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y === 'all' ? 'All years' : y === '—' ? 'Year not set' : y}
                        </option>
                      ))}
                    </select>
                    <select
                      value={branchFilter}
                      onChange={(e) => setBranchFilter(e.target.value)}
                      className="h-9 rounded-lg border border-white/20 bg-[#0b1118] px-3 text-sm text-white"
                      aria-label="Filter by branch"
                    >
                      {payload.branchOptions.map((b) => (
                        <option key={b} value={b}>
                          {b === 'all' ? 'All branches' : b}
                        </option>
                      ))}
                    </select>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
                  <ReportChartGrid>
                    {(detailKey === 'language' || detailKey === 'tiers' || detailKey === 'fighters') && (
                      <ReportDonutCard
                        title={detailKey === 'language' ? 'Language mix' : 'Tier mix'}
                        hint="Click a slice to focus the table"
                        data={detailKey === 'language' ? languageChart : tierChart}
                        colors={
                          detailKey === 'language'
                            ? ['#38bdf8', '#f59e0b']
                            : tierChart.map((t) => t.color)
                        }
                      />
                    )}
                    <ReportBarCard
                      title="By academic year"
                      hint="Fighters (bar) · wins as secondary"
                      data={yearChart}
                      primaryColor="#0f2744"
                      secondaryColor="#f59e0b"
                      stacked={false}
                    />
                    <ReportBarCard
                      title="By branch"
                      hint="Top branches by fighters"
                      data={branchChart}
                      layout="horizontal"
                      primaryColor="#0e7490"
                    />
                  </ReportChartGrid>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="text-sm font-bold text-[#0c2340]">
                        Standings · {filteredStandings.length} fighters
                      </p>
                    </div>
                    <div className="max-h-[320px] overflow-auto">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2">#</th>
                            <th className="px-3 py-2">Fighter</th>
                            <th className="px-3 py-2">Tier</th>
                            <th className="px-3 py-2">Year</th>
                            <th className="px-3 py-2">Branch</th>
                            <th className="px-3 py-2">Wins</th>
                            <th className="px-3 py-2">Solved</th>
                            <th className="px-3 py-2">Avg %</th>
                            <th className="px-3 py-2">Lang</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStandings.map((s) => (
                            <tr key={s.userId} className="border-t border-slate-100">
                              <td className="px-3 py-2 tabular-nums font-semibold">{s.globalRank}</td>
                              <td className="px-3 py-2">
                                <p className="font-medium text-[#0c2340]">
                                  {s.name || s.rollNumber || '—'}
                                </p>
                                <p className="text-xs text-slate-500">{s.rollNumber}</p>
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className="rounded-full px-2 py-0.5 text-[11px] font-bold text-[#0b1220]"
                                  style={{ background: s.tierColor }}
                                >
                                  {s.tierLabel}
                                </span>
                              </td>
                              <td className="px-3 py-2">{s.year}</td>
                              <td className="px-3 py-2">{s.branch}</td>
                              <td className="px-3 py-2 tabular-nums">{s.wins}</td>
                              <td className="px-3 py-2 tabular-nums">{s.totalSolved}</td>
                              <td className="px-3 py-2 tabular-nums">{s.avgPercent}%</td>
                              <td className="px-3 py-2">{s.preferredLanguage}</td>
                            </tr>
                          ))}
                          {filteredStandings.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                                No fighters match these filters.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b1118] text-white shadow-[0_24px_64px_-24px_rgba(0,0,0,0.65)]">
        <div
          className="relative border-b border-white/10 px-5 py-6 sm:px-7"
          style={{
            background:
              'radial-gradient(ellipse 90% 80% at 0% 0%, rgba(245,158,11,0.18), transparent 50%), radial-gradient(ellipse 70% 60% at 100% 0%, rgba(34,211,238,0.14), transparent 45%), linear-gradient(180deg, #101820 0%, #0b1118 100%)',
          }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-amber-300/90">
                <Zap className="h-3.5 w-3.5" aria-hidden />
                DSA Contest Arena
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                Tournament command centre
              </h2>
              <p className="mt-1.5 max-w-xl text-sm text-white/65">
                Live PUBG-style standings from real contest attempts — tiers, year filters, and
                full intel panels. Same fighters as the Contests portal.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="h-9 rounded-lg border border-white/15 bg-[#0b1118]/80 px-3 text-sm"
                aria-label="Year filter"
              >
                {payload.yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y === 'all' ? 'All years' : y === '—' ? 'Year not set' : y}
                  </option>
                ))}
              </select>
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="h-9 rounded-lg border border-white/15 bg-[#0b1118]/80 px-3 text-sm"
                aria-label="Branch filter"
              >
                {payload.branchOptions.map((b) => (
                  <option key={b} value={b}>
                    {b === 'all' ? 'All branches' : b}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find fighter…"
                  className="h-9 w-[11rem] border-white/15 bg-[#0b1118]/80 pl-8 text-white placeholder:text-white/35"
                />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={exportBusy}
                className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
                onClick={() => void downloadExcelReport()}
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                {exportBusy ? 'Exporting…' : 'Download Excel'}
              </Button>
            </div>
          </div>
          {exportError ? (
            <p className="mt-3 text-sm text-rose-300">{exportError}</p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-200">
              {summary.liveContests} live
            </span>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-cyan-100">
              {summary.publishedContests} published
            </span>
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-100">
              {summary.totalContests} total battles
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-white/70">
              {summary.totalSubmissions} submissions
            </span>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4 sm:p-6">
          <RingStat
            label="Fighters"
            value={filteredSummary.fighters}
            hint={`${summary.fighters} in full roster`}
            percent={summary.fighters ? (filteredSummary.fighters / summary.fighters) * 100 : 0}
            accent="#38bdf8"
            onClick={() => setDetailKey('fighters')}
          />
          <RingStat
            label="Chicken dinners"
            value={filteredSummary.wins}
            hint="Contest #1 finishes"
            percent={Math.min(100, filteredSummary.wins * 12)}
            accent="#f59e0b"
            onClick={() => setDetailKey('wins')}
          />
          <RingStat
            label="Problems solved"
            value={filteredSummary.solved}
            hint="Across filtered fighters"
            percent={Math.min(100, filteredSummary.solved * 4)}
            accent="#34d399"
            onClick={() => setDetailKey('solved')}
          />
          <RingStat
            label="Combat score"
            value={`${filteredSummary.avg}%`}
            hint="Average attempt %"
            percent={filteredSummary.avg}
            accent="#fb7185"
            onClick={() => setDetailKey('avg')}
          />
        </div>

        <div className="grid gap-5 border-t border-white/10 px-5 py-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] sm:px-6 sm:pb-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-white/70">
                <Trophy className="h-4 w-4 text-amber-300" aria-hidden />
                Global ranking
              </h3>
              <button
                type="button"
                className="text-xs font-semibold text-cyan-300 hover:underline"
                onClick={() => setDetailKey('year')}
              >
                Year charts
              </button>
            </div>

            {podium.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {[podium[1], podium[0], podium[2]].map((f, idx) => {
                  if (!f) {
                    return <div key={`empty-${idx}`} className="rounded-xl border border-dashed border-white/10 p-3" />;
                  }
                  const place = idx === 1 ? 1 : idx === 0 ? 2 : 3;
                  return (
                    <button
                      key={f.userId}
                      type="button"
                      onClick={() => setSelectedId(f.userId)}
                      className={cn(
                        'rounded-xl border px-2 py-3 text-center transition',
                        place === 1
                          ? 'border-amber-400/40 bg-amber-400/10 pt-5'
                          : 'border-white/10 bg-white/[0.03]',
                      )}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                        #{place}
                      </p>
                      <p
                        className="mx-auto mt-2 flex h-10 w-10 items-center justify-center rounded-full text-xs font-black text-[#0b1220]"
                        style={{ background: f.tierColor }}
                      >
                        {initials(f.name, f.rollNumber)}
                      </p>
                      <p className="mt-2 truncate text-xs font-semibold text-white">
                        {f.name || f.rollNumber}
                      </p>
                      <p className="text-[10px] text-amber-200/90">{f.tierLabel}</p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-white/50">
                No contest fighters yet. Publish a contest and wait for submissions.
              </p>
            )}

            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
              {filteredStandings.slice(0, 12).map((f) => (
                <FighterCard
                  key={f.userId}
                  fighter={f}
                  selected={selectedFighter?.userId === f.userId}
                  onSelect={() => setSelectedId(f.userId)}
                />
              ))}
            </div>
            {filteredStandings.length > 12 ? (
              <button
                type="button"
                onClick={() => setDetailKey('fighters')}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-sm font-semibold text-cyan-200 hover:bg-white/[0.07]"
              >
                View all {filteredStandings.length} fighters →
              </button>
            ) : null}
          </div>

          <div className="space-y-4">
            {selectedFighter ? (
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#151d27] to-[#0f151c]">
                <div className="border-b border-white/10 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-black text-[#0b1220]"
                      style={{ background: selectedFighter.tierColor }}
                    >
                      {initials(selectedFighter.name, selectedFighter.rollNumber)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-bold text-white">
                        {selectedFighter.name || selectedFighter.rollNumber || 'Fighter'}
                      </p>
                      <p className="truncate text-xs text-white/50">
                        {selectedFighter.email || selectedFighter.rollNumber}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span
                          className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-[#0b1220]"
                          style={{ background: selectedFighter.tierColor }}
                        >
                          {selectedFighter.tierLabel}
                        </span>
                        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] text-white/70">
                          Global #{selectedFighter.globalRank}
                        </span>
                        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] text-white/70">
                          Best #{selectedFighter.bestRank ?? '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-[11px] text-white/50">
                      <span>Level progress</span>
                      <span>{selectedFighter.levelProgress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${selectedFighter.levelProgress}%`,
                          background: selectedFighter.tierColor,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 text-sm">
                  {[
                    ['Contests', selectedFighter.contestsEntered],
                    ['Completed', selectedFighter.contestsCompleted],
                    ['Wins', selectedFighter.wins],
                    ['Win rate', `${selectedFighter.winRate}%`],
                    ['Solved', selectedFighter.totalSolved],
                    ['Avg score', `${selectedFighter.avgPercent}%`],
                    ['Language', selectedFighter.preferredLanguage],
                    ['Year', selectedFighter.year],
                    ['Branch', selectedFighter.branch],
                    ['Roll', selectedFighter.rollNumber || '—'],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="rounded-xl bg-white/[0.04] px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                        {k}
                      </p>
                      <p className="mt-0.5 truncate font-semibold text-white">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-amber-400 text-[#111] hover:bg-amber-300"
                    onClick={() => setDetailKey('tiers')}
                  >
                    Tier charts
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-white/20 bg-transparent text-white hover:bg-white/10"
                    onClick={() => setDetailKey('language')}
                  >
                    Language intel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-white/20 bg-transparent text-white hover:bg-white/10"
                    onClick={() => setDetailKey('branch')}
                  >
                    Branch intel
                  </Button>
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-white/70">
                  Battles
                </h3>
                <span className="text-[11px] text-white/40">{battles.length} contests</span>
              </div>
              <div className="max-h-[220px] space-y-2 overflow-y-auto">
                {battles.slice(0, 8).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onOpenContestAnalytics?.(b.id, b.title)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-left transition hover:border-cyan-400/30 hover:bg-white/[0.06]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">
                        {b.title}
                      </span>
                      <span className="text-[11px] text-white/45">
                        {b.fighters} fighters · {b.submissions} subs · {b.problemCount} problems
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                        b.isLive
                          ? 'bg-rose-500/20 text-rose-200'
                          : b.isPublished
                            ? 'bg-emerald-500/15 text-emerald-200'
                            : 'bg-white/10 text-white/50',
                      )}
                    >
                      {b.isLive ? 'Live' : b.isPublished ? b.status : 'Draft'}
                    </span>
                  </button>
                ))}
                {battles.length === 0 ? (
                  <p className="text-sm text-white/45">No contests created yet.</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>
      {detailModal}
    </>
  );
}
