import { NextRequest, NextResponse } from 'next/server';
import { getDbService } from '@/lib/db/get-db-service';
import { requireAuth } from '@/lib/server-auth';
import { isValidAcademicYear } from '@/lib/roles';
import { ACADEMIC_YEARS } from '@/lib/college-brand';
import {
  fetchElevateXAdminState,
  publishElevateXFromAdmin,
  saveElevateXSlot,
  goLiveElevateXSlot,
  reprovisionElevateXRoster,
  saveElevateXTechnicalFormats,
  saveElevateXExamConfig,
} from '@/lib/elevatex-admin';
import type { ElevateXExamConfig } from '@/lib/placement/elevatex-exam-config';
import type { ElevateXTechnicalFormatsMap } from '@/lib/placement/elevatex-technical-config';
import type { PlacementSectionId } from '@/lib/placement/types';
import { parseScheduleSlotsJson } from '@/lib/exam-schedule-slots';
import { ELEVATEX_EXAM_NAME } from '@/lib/elevatex';

export async function GET() {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  const state = await fetchElevateXAdminState(admin);
  return NextResponse.json(state);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['admin']);
  if ('response' in auth) return auth.response;

  const admin = getDbService();
  if (!admin) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = String(body.action ?? 'publish');
  const scheduleSlots = parseScheduleSlotsJson(body.scheduleSlots);
  const targetYears = (
    Array.isArray(body.targetYears) ? body.targetYears : [...ACADEMIC_YEARS]
  ).filter((y) => isValidAcademicYear(String(y)));

  if (!targetYears.length) {
    return NextResponse.json({ error: 'Select at least one target year' }, { status: 400 });
  }

  try {
    if (action === 'save_slot') {
      const requestId = String(body.requestId ?? '');
      const slotNumber = Math.floor(Number(body.slotNumber));
      const slot = scheduleSlots.find((s) => s.slot_number === slotNumber);
      if (!requestId || !slot) {
        return NextResponse.json({ error: 'requestId and slot data required' }, { status: 400 });
      }
      const result = await saveElevateXSlot(admin, {
        requestId,
        slot,
        adminUserId: auth.ctx.user.id,
        goLiveNow: Boolean(body.goLiveNow),
      });
      return NextResponse.json(result);
    }

    if (action === 'provision_logins') {
      const requestId = String(body.requestId ?? '');
      if (!requestId) {
        return NextResponse.json({ error: 'requestId required' }, { status: 400 });
      }
      const result = await reprovisionElevateXRoster(admin, requestId);
      return NextResponse.json(result);
    }

    if (action === 'save_exam_config') {
      const requestId = String(body.requestId ?? '');
      if (!requestId) {
        return NextResponse.json({ error: 'requestId required' }, { status: 400 });
      }
      const patch: Partial<ElevateXExamConfig> = {};
      if (Array.isArray(body.enabledSections)) {
        patch.enabledSections = (body.enabledSections as PlacementSectionId[]).filter(Boolean);
      }
      if (Array.isArray(body.programmingProblems)) {
        patch.programmingProblems = body.programmingProblems as ElevateXExamConfig['programmingProblems'];
      }
      if (body.programmingDefaultLanguage === 'python' || body.programmingDefaultLanguage === 'c') {
        patch.programmingDefaultLanguage = body.programmingDefaultLanguage;
      }
      if (body.technicalFormats && typeof body.technicalFormats === 'object') {
        patch.technicalFormats = body.technicalFormats as ElevateXTechnicalFormatsMap;
      }
      const result = await saveElevateXExamConfig(admin, requestId, patch);
      return NextResponse.json(result);
    }

    if (action === 'save_exam_config') {
      const requestId = String(body.requestId ?? '');
      if (!requestId) {
        return NextResponse.json({ error: 'requestId required' }, { status: 400 });
      }
      const patch: Partial<ElevateXExamConfig> = {};
      if (Array.isArray(body.enabledSections)) {
        patch.enabledSections = (body.enabledSections as PlacementSectionId[]).filter(Boolean);
      }
      if (Array.isArray(body.programmingProblems)) {
        patch.programmingProblems = body.programmingProblems as ElevateXExamConfig['programmingProblems'];
      }
      if (body.programmingDefaultLanguage === 'python' || body.programmingDefaultLanguage === 'c') {
        patch.programmingDefaultLanguage = body.programmingDefaultLanguage;
      }
      if (body.technicalFormats && typeof body.technicalFormats === 'object') {
        patch.technicalFormats = body.technicalFormats as ElevateXTechnicalFormatsMap;
      }
      const result = await saveElevateXExamConfig(admin, requestId, patch);
      return NextResponse.json(result);
    }

    if (action === 'save_technical_formats') {
      const requestId = String(body.requestId ?? '');
      const raw = body.technicalFormats;
      if (!requestId || !raw || typeof raw !== 'object') {
        return NextResponse.json({ error: 'requestId and technicalFormats required' }, { status: 400 });
      }
      const formats = raw as ElevateXTechnicalFormatsMap;
      for (const v of Object.values(formats)) {
        if (v !== 'mcq' && v !== 'coding' && v !== 'both') {
          return NextResponse.json({ error: 'Invalid technical format value' }, { status: 400 });
        }
      }
      const result = await saveElevateXTechnicalFormats(admin, requestId, formats);
      return NextResponse.json(result);
    }

    if (action === 'go_live') {
      const scheduleId = String(body.scheduleId ?? '');
      if (!scheduleId) {
        return NextResponse.json({ error: 'scheduleId required' }, { status: 400 });
      }
      await goLiveElevateXSlot(admin, scheduleId, auth.ctx.user.id);
      return NextResponse.json({ message: 'Slot is now live.' });
    }

    const result = await publishElevateXFromAdmin(admin, {
      creatorUserId: auth.ctx.user.id,
      title: typeof body.title === 'string' ? body.title : ELEVATEX_EXAM_NAME,
      description: typeof body.description === 'string' ? body.description : undefined,
      targetYears,
      scheduleSlots,
      openSlot1Now: body.openSlot1Now !== false,
      notice: typeof body.notice === 'string' ? body.notice : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Request failed' },
      { status: 400 },
    );
  }
}
