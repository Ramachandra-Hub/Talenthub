'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusAlert } from '@/components/ui/status-alert';
import {
  PLACEMENT_SECTIONS,
  computePlacementExamTotals,
  defaultEnabledPlacementSectionIds,
  getActivePlacementSections,
} from '@/lib/placement/config';
import type { PlacementSectionId } from '@/lib/placement/types';
import { cn } from '@/lib/utils';

type Props = {
  requestId: string | null;
  initialEnabled: PlacementSectionId[];
  programmingProblemCount: number;
  onChange?: (enabled: PlacementSectionId[]) => void;
  onSaved?: () => void;
};

export function ElevateXSectionsPanel({
  requestId,
  initialEnabled,
  programmingProblemCount,
  onChange,
  onSaved,
}: Props) {
  const [enabled, setEnabled] = useState<PlacementSectionId[]>(() =>
    initialEnabled.length ? initialEnabled : defaultEnabledPlacementSectionIds(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialKey = initialEnabled.join(',');

  useEffect(() => {
    const next = initialEnabled.length ? initialEnabled : defaultEnabledPlacementSectionIds();
    setEnabled((prev) => (prev.join(',') === next.join(',') ? prev : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const notifyChange = (next: PlacementSectionId[]) => {
    onChangeRef.current?.(next);
  };

  const toggle = (id: PlacementSectionId) => {
    setEnabled((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        if (!next.length) return prev;
        notifyChange(next);
        return next;
      }
      const next = PLACEMENT_SECTIONS.filter((s) => [...prev, id].includes(s.id)).map((s) => s.id);
      notifyChange(next);
      return next;
    });
  };

  const totals = computePlacementExamTotals(getActivePlacementSections(enabled));

  const save = async () => {
    if (!requestId) {
      setError('Publish ElevateX first, then configure sections.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/admin/elevatex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_exam_config',
          requestId,
          enabledSections: enabled,
        }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setSuccess(json.message ?? 'Sections saved.');
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/30 p-4 space-y-4">
      <div>
        <h4 className="font-semibold text-[#0c2340]">ElevateX sections / modules</h4>
        <p className="text-sm text-slate-600 mt-1">
          Choose which sections appear in the student paper. Uncheck Aptitude (or any module) to
          exclude it from this ElevateX exam.
        </p>
        <p className="text-xs text-emerald-900 mt-2 font-medium">
          Selected: {enabled.length} section(s) · {totals.totalMarks} marks ·{' '}
          {Math.round(totals.totalSec / 60)} min
        </p>
      </div>

      {error ? <StatusAlert variant="error">{error}</StatusAlert> : null}
      {success ? <StatusAlert variant="success">{success}</StatusAlert> : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {PLACEMENT_SECTIONS.map((section) => {
          const active = enabled.includes(section.id);
          const programmingBlocked =
            section.id === 'programming' && programmingProblemCount === 0;
          return (
            <label
              key={section.id}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 cursor-pointer',
                active ? 'border-emerald-400 bg-white' : 'border-slate-200 bg-white/80',
                programmingBlocked && 'opacity-60 cursor-not-allowed',
              )}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={active}
                disabled={programmingBlocked}
                onChange={() => toggle(section.id)}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {section.icon} {section.short}
                </p>
                <p className="text-xs text-slate-600">
                  {section.marks} marks · {Math.round(section.durationSec / 60)} min
                </p>
                {programmingBlocked ? (
                  <p className="text-[11px] text-amber-800 mt-1">Upload C/Python problems below first.</p>
                ) : null}
              </div>
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const next = defaultEnabledPlacementSectionIds();
            setEnabled(next);
            notifyChange(next);
          }}
        >
          Classic 6 sections
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const next = PLACEMENT_SECTIONS.map((s) => s.id);
            setEnabled(next);
            notifyChange(next);
          }}
        >
          Select all
        </Button>
      </div>

      <Button type="button" variant="outline" disabled={saving || !requestId} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Save section selection'}
      </Button>
    </div>
  );
}
