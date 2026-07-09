import type { ProgrammingProblem } from '@/lib/coding/sample-problems';
import type { CodingLanguageId } from '@/lib/coding/languages';
import {
  PLACEMENT_SECTIONS,
  computePlacementExamTotals,
  defaultElevateXEnabledSectionIds,
  getActivePlacementSections,
} from '@/lib/placement/config';
import type { PlacementSectionId } from '@/lib/placement/types';
import {
  defaultElevateXTechnicalFormats,
  mergeElevateXTechnicalFormats,
  normalizeElevateXTechnicalFormats,
  resolveTechnicalFormatForDepartment,
  type ElevateXTechnicalFormatsMap,
} from '@/lib/placement/elevatex-technical-config';
import type { PlacementTechnicalFormat } from '@/lib/placement/types';

export const TOPIC_PREFIX = 'elevatex_cfg:';
export const PROGRAMMING_SECTION_PROBLEM_COUNT = 3;

export type ElevateXProgrammingLanguage = Extract<CodingLanguageId, 'c' | 'python'>;

export type ElevateXExamConfig = {
  technicalFormats: ElevateXTechnicalFormatsMap;
  enabledSections: PlacementSectionId[];
  programmingProblems: ProgrammingProblem[];
  programmingDefaultLanguage: ElevateXProgrammingLanguage;
};

export function defaultElevateXExamConfig(): ElevateXExamConfig {
  return {
    technicalFormats: defaultElevateXTechnicalFormats(),
    enabledSections: defaultElevateXEnabledSectionIds(),
    programmingProblems: [],
    programmingDefaultLanguage: 'c',
  };
}

export function serializeElevateXExamConfig(config: ElevateXExamConfig): string {
  return `${TOPIC_PREFIX}${JSON.stringify({
    technicalFormats: config.technicalFormats,
    enabledSections: config.enabledSections,
    programmingProblems: config.programmingProblems,
    programmingDefaultLanguage: config.programmingDefaultLanguage,
  })}`;
}

/** @deprecated Use serializeElevateXExamConfig */
export function serializeElevateXTechnicalConfig(
  formats: ElevateXTechnicalFormatsMap,
): string {
  return serializeElevateXExamConfig({
    ...defaultElevateXExamConfig(),
    technicalFormats: formats,
  });
}

export function parseElevateXExamConfig(
  topic: string | null | undefined,
): ElevateXExamConfig | null {
  const raw = topic?.trim() ?? '';
  if (!raw.startsWith(TOPIC_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(TOPIC_PREFIX.length)) as Partial<ElevateXExamConfig> & {
      technicalFormats?: ElevateXTechnicalFormatsMap;
    };
    if (!parsed.technicalFormats || typeof parsed.technicalFormats !== 'object') return null;
    return mergeElevateXExamConfig({
      technicalFormats: parsed.technicalFormats,
      enabledSections: Array.isArray(parsed.enabledSections)
        ? (parsed.enabledSections as PlacementSectionId[])
        : undefined,
      programmingProblems: Array.isArray(parsed.programmingProblems)
        ? (parsed.programmingProblems as ProgrammingProblem[])
        : undefined,
      programmingDefaultLanguage:
        parsed.programmingDefaultLanguage === 'python' ? 'python' : 'c',
    });
  } catch {
    return null;
  }
}

/** @deprecated Use parseElevateXExamConfig */
export function parseElevateXTechnicalConfig(
  topic: string | null | undefined,
): ElevateXTechnicalFormatsMap | null {
  return parseElevateXExamConfig(topic)?.technicalFormats ?? null;
}

export function mergeElevateXExamConfig(
  stored: Partial<ElevateXExamConfig> | null | undefined,
): ElevateXExamConfig {
  const defaults = defaultElevateXExamConfig();
  const enabledRaw = stored?.enabledSections ?? defaults.enabledSections;
  const enabledSet = new Set(
    enabledRaw.filter((id) => PLACEMENT_SECTIONS.some((s) => s.id === id)),
  );
  const enabledSections =
    enabledSet.size > 0
      ? PLACEMENT_SECTIONS.filter((s) => enabledSet.has(s.id)).map((s) => s.id)
      : defaults.enabledSections;

  if (enabledSections.includes('programming') && !(stored?.programmingProblems?.length ?? 0)) {
    const withoutProgramming = enabledSections.filter((id) => id !== 'programming');
    return mergeElevateXExamConfig({
      ...stored,
      enabledSections: withoutProgramming.length ? withoutProgramming : defaults.enabledSections,
    });
  }

  return {
    technicalFormats: mergeElevateXTechnicalFormats(stored?.technicalFormats),
    enabledSections,
    programmingProblems: stored?.programmingProblems ?? [],
    programmingDefaultLanguage:
      stored?.programmingDefaultLanguage === 'python' ? 'python' : 'c',
  };
}

export function resolveElevateXExamConfigForStudent(
  departmentId: string,
  topic: string | null | undefined,
): {
  technicalFormat: PlacementTechnicalFormat;
  enabledSections: PlacementSectionId[];
  activeSections: ReturnType<typeof getActivePlacementSections>;
  examTotalMarks: number;
  examDurationSec: number;
  programmingProblems: ProgrammingProblem[];
  programmingDefaultLanguage: ElevateXProgrammingLanguage;
} {
  const config = mergeElevateXExamConfig(parseElevateXExamConfig(topic));
  const activeSections = getActivePlacementSections(config.enabledSections);
  const totals = computePlacementExamTotals(activeSections);
  return {
    technicalFormat: resolveTechnicalFormatForDepartment(
      departmentId,
      config.technicalFormats,
    ),
    enabledSections: config.enabledSections,
    activeSections,
    examTotalMarks: totals.totalMarks,
    examDurationSec: totals.totalSec,
    programmingProblems: config.programmingProblems,
    programmingDefaultLanguage: config.programmingDefaultLanguage,
  };
}

export { normalizeElevateXTechnicalFormats, mergeElevateXTechnicalFormats };
