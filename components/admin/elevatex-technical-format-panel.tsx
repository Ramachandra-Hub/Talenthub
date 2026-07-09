'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusAlert } from '@/components/ui/status-alert';
import {
  PLACEMENT_DEPARTMENTS,
  technicalFormatButtonLabel,
  technicalSectionSummary,
} from '@/lib/placement/config';
import {
  normalizeElevateXTechnicalFormats,
  type ElevateXTechnicalFormatsMap,
} from '@/lib/placement/elevatex-technical-config';
import type { PlacementTechnicalFormat } from '@/lib/placement/types';
import { placementDeptIdsFromCollegeDepartments } from '@/lib/placement/department-group-map';
import { cn } from '@/lib/utils';

/** Admin picks MCQs only or coding only — no hybrid technical section for now. */
const FORMAT_OPTIONS: PlacementTechnicalFormat[] = ['mcq', 'coding'];

type Props = {
  requestId: string | null;
  initialFormats: ElevateXTechnicalFormatsMap;
  /** Department names from the selected exam-builder group (college-brand labels). */
  groupDepartmentNames?: string[];
  groupLabel?: string | null;
  onSaved?: () => void;
  onFormatsChange?: (formats: ElevateXTechnicalFormatsMap) => void;
};

export function ElevateXTechnicalFormatPanel({
  requestId,
  initialFormats,
  groupDepartmentNames = [],
  groupLabel,
  onSaved,
  onFormatsChange,
}: Props) {
  const [formats, setFormats] = useState<ElevateXTechnicalFormatsMap>(() =>
    normalizeElevateXTechnicalFormats(initialFormats),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const onFormatsChangeRef = useRef(onFormatsChange);
  onFormatsChangeRef.current = onFormatsChange;

  const initialFormatsKey = useMemo(
    () => JSON.stringify(normalizeElevateXTechnicalFormats(initialFormats)),
    [initialFormats],
  );

  const notifyFormatsChange = (next: ElevateXTechnicalFormatsMap) => {
    onFormatsChangeRef.current?.(next);
  };

  const groupDeptIds = useMemo(
    () => placementDeptIdsFromCollegeDepartments(groupDepartmentNames),
    [groupDepartmentNames],
  );

  const hasGroupFilter = groupDeptIds.length > 0;

  const visibleDepartments = useMemo(() => {
    if (!hasGroupFilter) return PLACEMENT_DEPARTMENTS;
    const idSet = new Set(groupDeptIds);
    const inGroup = PLACEMENT_DEPARTMENTS.filter((d) => idSet.has(d.id));
    const rest = PLACEMENT_DEPARTMENTS.filter((d) => !idSet.has(d.id));
    return { inGroup, rest };
  }, [hasGroupFilter, groupDeptIds]);

  useEffect(() => {
    setFormats(normalizeElevateXTechnicalFormats(initialFormats));
  }, [initialFormatsKey]);

  const setDeptFormat = (deptId: string, fmt: PlacementTechnicalFormat) => {
    setFormats((prev) => {
      const next = { ...prev, [deptId]: fmt };
      notifyFormatsChange(next);
      return next;
    });
  };

  const applyFormatToDeptIds = (deptIds: string[], fmt: PlacementTechnicalFormat) => {
    if (!deptIds.length) return;
    setFormats((prev) => {
      const next = { ...prev };
      for (const id of deptIds) {
        next[id] = fmt;
      }
      notifyFormatsChange(next);
      return next;
    });
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
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const renderDeptRow = (dept: (typeof PLACEMENT_DEPARTMENTS)[number], inGroup: boolean) => {
    const fmt = formats[dept.id] ?? dept.defaultTechnicalFormat;
    return (
      <div
        key={dept.id}
        className={cn(
          'rounded-lg border bg-white p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2',
          inGroup ? 'border-indigo-300 ring-1 ring-indigo-200/80' : 'border-slate-200',
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{dept.name}</p>
          <p className="text-xs text-slate-600 font-medium">{technicalSectionSummary(fmt)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setDeptFormat(dept.id, opt)}
              className={cn(
                'rounded-md border px-2 py-1 text-[11px] font-semibold',
                fmt === opt
                  ? 'border-[#1e3a5f] bg-[#1e3a5f] text-white'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300',
              )}
            >
              {technicalFormatButtonLabel(opt)}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const list =
    hasGroupFilter && !Array.isArray(visibleDepartments)
      ? visibleDepartments
      : null;

  return (
    <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/30 p-4 space-y-4">
      <div>
        <h4 className="font-semibold text-[#0c2340]">Technical section — admin only</h4>
        <p className="text-sm text-slate-600 mt-1">
          Choose <strong>Coding only</strong> for branches that must not get technical MCQs (3 coding
          problems, no department MCQs). Choose <strong>MCQs only</strong> when there is no coding.
          Students cannot change this — set formats, then click Save.
        </p>
      </div>

      {error ? <StatusAlert variant="error">{error}</StatusAlert> : null}
      {success ? <StatusAlert variant="success">{success}</StatusAlert> : null}

      {hasGroupFilter ? (
        <div className="rounded-lg border border-indigo-300 bg-white p-3 space-y-2">
          <p className="text-sm font-semibold text-indigo-950">
            Selected department group
            {groupLabel ? `: ${groupLabel}` : ''}
          </p>
          <p className="text-xs text-slate-600">
            Apply one format to all branches in this group ({groupDeptIds.length} mapped). Coding only
            = no technical MCQs.
          </p>
          <div className="flex flex-wrap gap-2">
            {FORMAT_OPTIONS.map((opt) => (
              <Button
                key={opt}
                type="button"
                size="sm"
                variant={opt === 'coding' ? 'default' : 'outline'}
                className={opt === 'coding' ? 'bg-[#1e3a5f] hover:bg-[#16304f]' : ''}
                onClick={() => applyFormatToDeptIds(groupDeptIds, opt)}
              >
                Group → {technicalFormatButtonLabel(opt)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        <p className="text-xs text-slate-600">
          {hasGroupFilter
            ? 'Apply the same format to every ElevateX branch (EEE, ECE, Civil, etc.), not only the selected group.'
            : 'Select a department group above to apply MCQ/coding to that group in one click. Or set each branch below.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {FORMAT_OPTIONS.map((opt) => (
            <Button
              key={opt}
              type="button"
              size="sm"
              variant={opt === 'coding' ? 'default' : 'outline'}
              className={opt === 'coding' ? 'bg-[#1e3a5f] hover:bg-[#16304f]' : ''}
              onClick={() =>
                applyFormatToDeptIds(
                  PLACEMENT_DEPARTMENTS.map((d) => d.id),
                  opt,
                )
              }
            >
              All branches → {technicalFormatButtonLabel(opt)}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3 max-h-[min(28rem,55vh)] overflow-y-auto pr-1">
        {list ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
              Branches in selected group
            </p>
            {list.inGroup.length ? (
              list.inGroup.map((dept) => renderDeptRow(dept, true))
            ) : (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No branches in this group match ElevateX placement departments. Add CSE / MCA / ECE
                etc. to the group, or set branches individually below.
              </p>
            )}
            {list.rest.length > 0 ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 pt-2">
                  Other branches
                </p>
                {list.rest.map((dept) => renderDeptRow(dept, false))}
              </>
            ) : null}
          </>
        ) : (
          PLACEMENT_DEPARTMENTS.map((dept) => renderDeptRow(dept, false))
        )}
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
