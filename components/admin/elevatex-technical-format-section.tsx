'use client';

import { useCallback, useEffect, useState } from 'react';
import { ElevateXTechnicalFormatPanel } from '@/components/admin/elevatex-technical-format-panel';
import type { ElevateXAdminState } from '@/lib/elevatex-admin';
import {
  defaultElevateXTechnicalFormats,
  type ElevateXTechnicalFormatsMap,
} from '@/lib/placement/elevatex-technical-config';

type Props = {
  /** When parent already loaded ElevateX admin state, pass it to skip a duplicate fetch. */
  state?: Pick<ElevateXAdminState, 'requestId' | 'technicalFormats'> | null;
  groupDepartmentNames?: string[];
  groupLabel?: string | null;
  onFormatsSaved?: () => void;
  onFormatsChange?: (formats: ElevateXTechnicalFormatsMap) => void;
};

export function ElevateXTechnicalFormatSection({
  state,
  groupDepartmentNames,
  groupLabel,
  onFormatsSaved,
  onFormatsChange,
}: Props) {
  const [requestId, setRequestId] = useState<string | null>(state?.requestId ?? null);
  const [formats, setFormats] = useState<ElevateXTechnicalFormatsMap>(
    state?.technicalFormats ?? defaultElevateXTechnicalFormats(),
  );
  const [loading, setLoading] = useState(!state);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/elevatex');
    if (res.ok) {
      const json = (await res.json()) as ElevateXAdminState;
      setRequestId(json.requestId ?? null);
      setFormats(json.technicalFormats ?? defaultElevateXTechnicalFormats());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!state) return;
    setRequestId(state.requestId ?? null);
    setFormats(state.technicalFormats ?? defaultElevateXTechnicalFormats());
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.requestId]);

  useEffect(() => {
    if (state) return;
    void load();
  }, [state, load]);

  if (loading) {
    return (
      <p className="text-sm text-slate-500 rounded-xl border border-indigo-200/70 bg-indigo-50/20 p-4">
        Loading technical section settings (MCQs only or coding only per branch)…
      </p>
    );
  }

  return (
    <ElevateXTechnicalFormatPanel
      requestId={requestId}
      initialFormats={formats}
      groupDepartmentNames={groupDepartmentNames}
      groupLabel={groupLabel}
      onSaved={onFormatsSaved}
      onFormatsChange={onFormatsChange}
    />
  );
}
