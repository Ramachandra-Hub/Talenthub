import { COLLEGE } from '@/lib/college-brand';
import { rollNumberFromUser } from '@/lib/admin/roll-number';
import { PLACEMENT_DEPARTMENTS, PLACEMENT_EXAM_NAME } from '@/lib/placement/config';
import { buildCandidate } from '@/lib/placement/scoring';
import type { PlacementCandidate, PlacementTechnicalFormat } from '@/lib/placement/types';

/** Map college profile branch name to ElevateX placement department id. */
export function placementDepartmentIdFromBranch(branch: string | null | undefined): string {
  const raw = (branch ?? '').trim();
  if (!raw) return 'cse';

  const exact = PLACEMENT_DEPARTMENTS.find(
    (d) => d.name.toLowerCase() === raw.toLowerCase(),
  );
  if (exact) return exact.id;

  const lower = raw.toLowerCase();
  if (lower.includes('cyber')) return 'cse-cyber';
  if (lower.includes('iot')) return 'cse-iot';
  if (lower.includes('artificial') && lower.includes('machine')) return 'aiml';
  if (lower.includes('data science') || lower.includes('aids')) return 'aids';
  if (lower.includes('computer') || lower.includes('cse')) return 'cse';
  if (lower.includes('electronics') || lower.includes('ece')) return 'ece';
  if (lower.includes('mechanical') || lower.includes('mech')) return 'mech';
  if (lower.includes('civil')) return 'civil';
  if (lower.includes('electrical') || lower.includes('eee')) return 'eee';
  if (lower.includes('business') || lower.includes('bba')) return 'bba';

  return 'cse';
}

export type StudentElevateXProfile = {
  fullName: string;
  hallTicket: string;
  departmentId: string;
  departmentName: string;
  collegeName: string | null;
};

export function studentElevateXProfileFromAuth(
  email: string,
  metadata: Record<string, unknown> | null | undefined,
  profile?: {
    full_name?: string | null;
    branch?: string | null;
    college?: string | null;
  } | null,
): StudentElevateXProfile {
  const meta = metadata ?? {};
  const departmentId = placementDepartmentIdFromBranch(profile?.branch ?? null);
  const departmentName =
    PLACEMENT_DEPARTMENTS.find((d) => d.id === departmentId)?.name ?? 'Computer Science Engineering';

  return {
    fullName:
      profile?.full_name?.trim() ||
      String(meta.full_name ?? meta.name ?? '').trim() ||
      'Student',
    hallTicket: rollNumberFromUser(email, meta),
    departmentId,
    departmentName,
    collegeName: profile?.college?.trim() || COLLEGE.shortName,
  };
}

/** technicalFormat must come from admin config (API), not from student UI. */
export function buildElevateXCandidateFromStudent(
  profile: StudentElevateXProfile,
  options: { technicalFormat: PlacementTechnicalFormat },
): PlacementCandidate {
  return buildCandidate({
    fullName: profile.fullName,
    hallTicket: profile.hallTicket,
    departmentId: profile.departmentId,
    collegeName: profile.collegeName,
    examName: PLACEMENT_EXAM_NAME,
    technicalFormat: options.technicalFormat,
  });
}
