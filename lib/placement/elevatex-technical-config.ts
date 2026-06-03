import {
  PLACEMENT_DEPARTMENTS,
  defaultTechnicalFormatForDepartment,
} from '@/lib/placement/config';
import type { PlacementTechnicalFormat } from '@/lib/placement/types';

const TOPIC_PREFIX = 'elevatex_cfg:';

export type ElevateXTechnicalFormatsMap = Record<string, PlacementTechnicalFormat>;

/** Default map — one entry per placement department. */
export function defaultElevateXTechnicalFormats(): ElevateXTechnicalFormatsMap {
  const out: ElevateXTechnicalFormatsMap = {};
  for (const d of PLACEMENT_DEPARTMENTS) {
    out[d.id] = d.defaultTechnicalFormat;
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

export function mergeElevateXTechnicalFormats(
  stored: ElevateXTechnicalFormatsMap | null | undefined,
): ElevateXTechnicalFormatsMap {
  return { ...defaultElevateXTechnicalFormats(), ...(stored ?? {}) };
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
