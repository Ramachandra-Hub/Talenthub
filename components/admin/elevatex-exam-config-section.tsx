'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ElevateXTechnicalFormatSection } from '@/components/admin/elevatex-technical-format-section';
import { ElevateXSectionsPanel } from '@/components/admin/elevatex-sections-panel';
import { ElevateXProgrammingUploadPanel } from '@/components/admin/elevatex-programming-upload-panel';
import type { ElevateXAdminState } from '@/lib/elevatex-admin';
import { defaultElevateXExamConfig, type ElevateXExamConfig } from '@/lib/placement/elevatex-exam-config';
import type { PlacementSectionId } from '@/lib/placement/types';
import type { ProgrammingProblem } from '@/lib/coding/sample-problems';
import type { ElevateXTechnicalFormatsMap } from '@/lib/placement/elevatex-technical-config';

type Props = {
  state?: Pick<
    ElevateXAdminState,
    | 'requestId'
    | 'technicalFormats'
    | 'enabledSections'
    | 'programmingProblems'
    | 'programmingDefaultLanguage'
  > | null;
  groupDepartmentNames?: string[];
  groupLabel?: string | null;
  onExamConfigChange?: (config: {
    enabledSections: PlacementSectionId[];
    programmingProblems: ProgrammingProblem[];
    programmingDefaultLanguage: ElevateXExamConfig['programmingDefaultLanguage'];
    technicalFormats?: ElevateXTechnicalFormatsMap;
  }) => void;
};

export function ElevateXExamConfigSection({
  state,
  groupDepartmentNames,
  groupLabel,
  onExamConfigChange,
}: Props) {
  const defaults = useMemo(() => defaultElevateXExamConfig(), []);
  const [enabledSections, setEnabledSections] = useState<PlacementSectionId[]>(
    state?.enabledSections ?? defaults.enabledSections,
  );
  const [programmingProblems, setProgrammingProblems] = useState<ProgrammingProblem[]>(
    state?.programmingProblems ?? [],
  );
  const [programmingDefaultLanguage, setProgrammingDefaultLanguage] =
    useState<ElevateXExamConfig['programmingDefaultLanguage']>(
      state?.programmingDefaultLanguage ?? defaults.programmingDefaultLanguage,
    );

  const stateRequestId = state?.requestId ?? null;

  useEffect(() => {
    if (!state?.requestId) return;
    setEnabledSections(state.enabledSections ?? defaults.enabledSections);
    setProgrammingProblems(state.programmingProblems ?? []);
    setProgrammingDefaultLanguage(
      state.programmingDefaultLanguage ?? defaults.programmingDefaultLanguage,
    );
    // Sync only when the ElevateX exam request identity changes (server-loaded config).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateRequestId]);

  const emit = useCallback(
    (
      patch: Partial<{
        enabledSections: PlacementSectionId[];
        programmingProblems: ProgrammingProblem[];
        programmingDefaultLanguage: ElevateXExamConfig['programmingDefaultLanguage'];
        technicalFormats: ElevateXTechnicalFormatsMap;
      }> = {},
    ) => {
      onExamConfigChange?.({
        enabledSections: patch.enabledSections ?? enabledSections,
        programmingProblems: patch.programmingProblems ?? programmingProblems,
        programmingDefaultLanguage:
          patch.programmingDefaultLanguage ?? programmingDefaultLanguage,
        technicalFormats: patch.technicalFormats,
      });
    },
    [
      enabledSections,
      programmingProblems,
      programmingDefaultLanguage,
      onExamConfigChange,
    ],
  );

  const handleSectionsChange = useCallback(
    (next: PlacementSectionId[]) => {
      setEnabledSections(next);
      emit({ enabledSections: next });
    },
    [emit],
  );

  const handleProblemsChange = useCallback(
    (next: ProgrammingProblem[]) => {
      setProgrammingProblems(next);
      emit({ programmingProblems: next });
    },
    [emit],
  );

  const handleDefaultLanguageChange = useCallback(
    (lang: ElevateXExamConfig['programmingDefaultLanguage']) => {
      setProgrammingDefaultLanguage(lang);
      emit({ programmingDefaultLanguage: lang });
    },
    [emit],
  );

  const handleFormatsChange = useCallback(
    (formats: ElevateXTechnicalFormatsMap) => {
      emit({ technicalFormats: formats });
    },
    [emit],
  );

  return (
    <div className="space-y-4">
      <ElevateXSectionsPanel
        requestId={state?.requestId ?? null}
        initialEnabled={enabledSections}
        programmingProblemCount={programmingProblems.length}
        onChange={handleSectionsChange}
      />
      <ElevateXProgrammingUploadPanel
        requestId={state?.requestId ?? null}
        initialProblems={programmingProblems}
        initialDefaultLanguage={programmingDefaultLanguage}
        onProblemsChange={handleProblemsChange}
        onDefaultLanguageChange={handleDefaultLanguageChange}
      />
      <ElevateXTechnicalFormatSection
        state={
          state
            ? { requestId: state.requestId, technicalFormats: state.technicalFormats }
            : null
        }
        groupDepartmentNames={groupDepartmentNames}
        groupLabel={groupLabel}
        onFormatsChange={handleFormatsChange}
      />
    </div>
  );
}
