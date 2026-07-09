'use client';

import { useCallback, useEffect, useState } from 'react';
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
  const defaults = defaultElevateXExamConfig();
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

  useEffect(() => {
    if (!state) return;
    setEnabledSections(state.enabledSections ?? defaults.enabledSections);
    setProgrammingProblems(state.programmingProblems ?? []);
    setProgrammingDefaultLanguage(
      state.programmingDefaultLanguage ?? defaults.programmingDefaultLanguage,
    );
  }, [state, defaults.enabledSections, defaults.programmingDefaultLanguage]);

  const emit = useCallback(
    (
      patch: Partial<{
        enabledSections: PlacementSectionId[];
        programmingProblems: ProgrammingProblem[];
        programmingDefaultLanguage: ElevateXExamConfig['programmingDefaultLanguage'];
        technicalFormats: ElevateXTechnicalFormatsMap;
      }> = {},
    ) => {
      const next = {
        enabledSections: patch.enabledSections ?? enabledSections,
        programmingProblems: patch.programmingProblems ?? programmingProblems,
        programmingDefaultLanguage:
          patch.programmingDefaultLanguage ?? programmingDefaultLanguage,
      };
      onExamConfigChange?.(next);
    },
    [enabledSections, programmingProblems, programmingDefaultLanguage, onExamConfigChange],
  );

  return (
    <div className="space-y-4">
      <ElevateXSectionsPanel
        requestId={state?.requestId ?? null}
        initialEnabled={enabledSections}
        programmingProblemCount={programmingProblems.length}
        onChange={(next) => {
          setEnabledSections(next);
          emit({ enabledSections: next });
        }}
      />
      <ElevateXProgrammingUploadPanel
        requestId={state?.requestId ?? null}
        initialProblems={programmingProblems}
        initialDefaultLanguage={programmingDefaultLanguage}
        onProblemsChange={(next) => {
          setProgrammingProblems(next);
          emit({ programmingProblems: next });
        }}
        onDefaultLanguageChange={(lang) => {
          setProgrammingDefaultLanguage(lang);
          emit({ programmingDefaultLanguage: lang });
        }}
      />
      <ElevateXTechnicalFormatSection
        state={
          state
            ? { requestId: state.requestId, technicalFormats: state.technicalFormats }
            : null
        }
        groupDepartmentNames={groupDepartmentNames}
        groupLabel={groupLabel}
        onFormatsChange={(formats) => emit({ technicalFormats: formats })}
      />
    </div>
  );
}
