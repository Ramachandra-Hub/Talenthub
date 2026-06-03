'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusAlert } from '@/components/ui/status-alert';
import {
  PLACEMENT_DEPARTMENTS,
  technicalSectionSummary,
} from '@/lib/placement/config';
import type { ElevateXTechnicalFormatsMap } from '@/lib/placement/elevatex-technical-config';
import type { PlacementTechnicalFormat } from '@/lib/placement/types';
import { cn } from '@/lib/utils';

const FORMAT_OPTIONS: { id: PlacementTechnicalFormat; label: string }[] = [
  { id: 'mcq', label: 'MCQs only (20)' },
  { id: 'coding', label: 'Coding only (3)' },
  { id: 'both', label: 'Both (20 MCQ + 3 coding)' },
];

type Props = {
  requestId: string | null;
  initialFormats: ElevateXTechnicalFormatsMap;
};

export function ElevateXTechnicalFormatPanel({ requestId, initialFormats }: Props) {
  const [formats, setFormats] = useState<ElevateXTechnicalFormatsMap>(initialFormats);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setFormats(initialFormats);
  }, [initialFormats]);

  const setDeptFormat = (deptId: string, fmt: PlacementTechnicalFormat) => {
    setFormats((prev) => ({ ...prev, [deptId]: fmt }));
  };

  const save = async () => {
    if (!requestId) {
      setError('Publish ElevateX first, then configure technical formats.');
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
          action: 'save_technical_formats',
          requestId,
          technicalFormats: formats,
        }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setSuccess(json.message ?? 'Technical formats saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/30 p-4 space-y-4">
      <div>
        <h4 className="font-semibold text-[#0c2340]">Technical section — admin only</h4>
        <p className="text-sm text-slate-600 mt-1">
          Students cannot change branch or MCQ/coding mode. They only read instructions and submit the
          exam. Set the technical format for each branch below.
        </p>
      </div>

      {error ? <StatusAlert variant="error">{error}</StatusAlert> : null}
      {success ? <StatusAlert variant="success">{success}</StatusAlert> : null}

      <div className="space-y-3 max-h-[min(24rem,50vh)] overflow-y-auto pr-1">
        {PLACEMENT_DEPARTMENTS.map((dept) => {
          const fmt = formats[dept.id] ?? dept.defaultTechnicalFormat;
          return (
            <div
              key={dept.id}
              className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{dept.name}</p>
                <p className="text-xs text-slate-500">{technicalSectionSummary(fmt)}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 shrink-0">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDeptFormat(dept.id, opt.id)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[11px] font-semibold',
                      fmt === opt.id
                        ? 'border-[#1e3a5f] bg-[#1e3a5f] text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={saving || !requestId}
        onClick={() => void save()}
        className="border-indigo-300"
      >
        {saving ? 'Saving…' : 'Save technical formats for all branches'}
      </Button>
    </div>
  );
}
