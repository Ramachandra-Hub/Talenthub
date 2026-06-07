'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TestSectionConfig } from '@/lib/exam-v2/section-timer';
import { sectionDurationSeconds } from '@/lib/exam-v2/section-timer';

type SectionExamPersist = {
  sectionIndex: number;
  sectionEndsAtMs: number;
};

type Options = {
  sections: TestSectionConfig[];
  enabled: boolean;
  testId?: string;
  onSectionTimeout: () => void;
  onAllSectionsComplete: () => void;
};

function storageKey(testId: string): string {
  return `sectionExam:${testId}`;
}

function loadPersisted(testId: string | undefined): SectionExamPersist | null {
  if (!testId || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(testId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SectionExamPersist;
    if (
      typeof parsed.sectionIndex !== 'number' ||
      typeof parsed.sectionEndsAtMs !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function savePersisted(testId: string | undefined, payload: SectionExamPersist): void {
  if (!testId || typeof window === 'undefined') return;
  window.sessionStorage.setItem(storageKey(testId), JSON.stringify(payload));
}

export function useSectionExam({
  sections,
  enabled,
  testId,
  onSectionTimeout,
  onAllSectionsComplete,
}: Options) {
  const persisted = loadPersisted(testId);
  const [sectionIndex, setSectionIndex] = useState(persisted?.sectionIndex ?? 0);
  const [sectionTimeLeft, setSectionTimeLeft] = useState(0);
  const callbacksRef = useRef({ onSectionTimeout, onAllSectionsComplete });

  useEffect(() => {
    callbacksRef.current = { onSectionTimeout, onAllSectionsComplete };
  }, [onSectionTimeout, onAllSectionsComplete]);

  const currentSection = sections[sectionIndex] ?? null;

  useEffect(() => {
    if (!enabled || !currentSection) return;

    const duration = sectionDurationSeconds(currentSection);
    const now = Date.now();
    const persistedNow = loadPersisted(testId);
    let end =
      persistedNow &&
      persistedNow.sectionIndex === sectionIndex &&
      persistedNow.sectionEndsAtMs > now
        ? persistedNow.sectionEndsAtMs
        : now + duration * 1000;

    if (end <= now) {
      end = now + duration * 1000;
    }
    savePersisted(testId, { sectionIndex, sectionEndsAtMs: end });
    let timeoutId = 0;

    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setSectionTimeLeft(left);
      if (left <= 0) {
        if (sectionIndex < sections.length - 1) {
          setSectionIndex((i) => i + 1);
          callbacksRef.current.onSectionTimeout();
        } else {
          callbacksRef.current.onAllSectionsComplete();
        }
        return;
      }
      timeoutId = window.setTimeout(tick, 1000);
    };
    tick();

    return () => clearTimeout(timeoutId);
  }, [enabled, sectionIndex, currentSection, sections.length, testId]);

  const goToSection = useCallback(
    (index: number) => {
      if (index < 0 || index >= sections.length) return;
      setSectionIndex(index);
    },
    [sections.length],
  );

  return {
    sectionIndex,
    currentSection,
    sectionTimeLeft,
    goToSection,
    isLastSection: sectionIndex >= sections.length - 1,
  };
}
