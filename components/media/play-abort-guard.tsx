'use client';

import { useEffect } from 'react';
import { ensurePlayAbortGuard } from '@/lib/media/safe-video-play';

/** Installs the global media play/pause AbortError guard for the whole app. */
export function PlayAbortGuard() {
  useEffect(() => {
    ensurePlayAbortGuard();
  }, []);
  return null;
}
