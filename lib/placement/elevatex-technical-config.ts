import {
  PLACEMENT_DEPARTMENTS,
  defaultTechnicalFormatForDepartment,
} from '@/lib/placement/config';
import type { PlacementTechnicalFormat } from '@/lib/placement/types';

const TOPIC_PREFIX = 'elevatex_cfg:';

export type ElevateXTechnicalFormatsMap = Record<string, PlacementTechnicalFormat>;

/** Default map — ElevateX uses C language MCQs for all branches. */
export function defaultElevateXTechnicalFormats(): ElevateXTechnicalFormatsMap {
  const out: ElevateXTechnicalFormatsMap = {};
  for (const d of PLACEMENT_DEPARTMENTS) {
    out[d.id] = 'mcq';
  }
  return out;
}

export function serializeElevateXTechnicalConfig(
  formats: ElevateXTechnicalFormatsMap,
): string {
  return `${TOPIC_PREFIX}${JSON.stringify({ technicalFormats: formats })}`;
}

export function parseElevateXTechnicalConfig(
  topic: string | null | undefined,
): ElevateXTechnicalFormatsMap | null {
  const raw = topic?.trim() ?? '';
  if (!raw.startsWith(TOPIC_PREFIX)) return null;
  try {
    const parsed = JSON.parse(raw.slice(TOPIC_PREFIX.length)) as {
      technicalFormats?: ElevateXTechnicalFormatsMap;
    };
    if (!parsed.technicalFormats || typeof parsed.technicalFormats !== 'object') return null;
    return parsed.technicalFormats;
  } catch {
    return null;
  }
}

/** Legacy exams used `both`; map to branch default (coding for CSE/MCA, MCQs for others). */
export function normalizeElevateXTechnicalFormats(
  formats: ElevateXTechnicalFormatsMap,
): ElevateXTechnicalFormatsMap {
  const out = { ...formats };
  for (const d of PLACEMENT_DEPARTMENTS) {
    if (out[d.id] === 'both') {
      out[d.id] = d.defaultTechnicalFormat;
    }
  }
  return out;
}

export function mergeElevateXTechnicalFormats(
  stored: ElevateXTechnicalFormatsMap | null | undefined,
): ElevateXTechnicalFormatsMap {
  return normalizeElevateXTechnicalFormats({
    ...defaultElevateXTechnicalFormats(),
    ...(stored ?? {}),
  });
}

export function resolveTechnicalFormatForDepartment(
  departmentId: string,
  adminFormats: ElevateXTechnicalFormatsMap | null | undefined,
): PlacementTechnicalFormat {
  const merged = mergeElevateXTechnicalFormats(adminFormats);
  const fmt = merged[departmentId];
  if (fmt === 'mcq' || fmt === 'coding' || fmt === 'both') return fmt;
  return defaultTechnicalFormatForDepartment(departmentId);
}
