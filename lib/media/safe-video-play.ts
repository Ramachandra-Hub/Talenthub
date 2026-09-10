/** Chrome rejects play() with AbortError when pause() runs before play() settles. */
export function isPlayInterruptedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String((err as { name?: unknown }).name) : '';
  const message = 'message' in err ? String((err as { message?: unknown }).message) : '';
  return (
    name === 'AbortError' ||
    name === 'NotAllowedError' ||
    /interrupted|abort|play\(\) request/i.test(message)
  );
}

/**
 * Start muted inline video playback without surfacing AbortError to the console.
 * Returns true when playback started; false if interrupted, detached, or blocked.
 */
export async function safeVideoPlay(video: HTMLVideoElement): Promise<boolean> {
  if (typeof document !== 'undefined' && document.hidden) return false;
  if (!video.isConnected) return false;
  if (!video.paused && !video.ended && video.readyState >= 2) return true;

  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', 'true');
  video.setAttribute('muted', '');
  video.autoplay = true;

  // Defer one frame so React remount / srcObject attach settles before play().
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });

  if (!video.isConnected || !video.srcObject) return false;

  let playPromise: Promise<void>;
  try {
    playPromise = Promise.resolve(video.play()).then(() => undefined);
  } catch (err) {
    if (isPlayInterruptedError(err)) return false;
    return false;
  }

  // Attach catch immediately so a concurrent detach cannot become uncaught.
  void playPromise.catch(() => {
    /* expected when srcObject is cleared or the element unmounts mid-play */
  });

  try {
    await playPromise;
    return video.isConnected && Boolean(video.srcObject);
  } catch (err) {
    if (isPlayInterruptedError(err)) return false;
    return false;
  }
}

/** Suppress the known Chrome play/pause AbortError so it never surfaces as uncaught. */
export function installPlayAbortGuard(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onRejection = (event: PromiseRejectionEvent) => {
    if (isPlayInterruptedError(event.reason)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  window.addEventListener('unhandledrejection', onRejection);
  return () => window.removeEventListener('unhandledrejection', onRejection);
}
