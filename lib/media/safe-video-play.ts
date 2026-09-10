/** Chrome rejects play() with AbortError when pause()/srcObject clear runs before play() settles. */
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

type PlayPatchedMedia = typeof HTMLMediaElement.prototype & {
  __thPlayPatched?: boolean;
};

const pendingPlays = new WeakMap<HTMLMediaElement, Promise<void>>();

let guardInstalled = false;

/**
 * Install once for the whole app (never tear down).
 * Older cleanup un-patched play() while another camera remounted → AbortError.
 */
export function ensurePlayAbortGuard(): void {
  if (typeof window === 'undefined' || guardInstalled) return;
  guardInstalled = true;

  window.addEventListener('unhandledrejection', (event) => {
    if (isPlayInterruptedError(event.reason)) {
      event.preventDefault();
    }
  });

  const proto = HTMLMediaElement.prototype as PlayPatchedMedia;
  if (proto.__thPlayPatched) return;

  const originalPlay = proto.play;
  proto.play = function patchedPlay(
    this: HTMLMediaElement,
    ...args: Parameters<HTMLMediaElement['play']>
  ) {
    try {
      const result = originalPlay.apply(this, args);
      if (result && typeof (result as Promise<void>).then === 'function') {
        const promise = result as Promise<void>;
        // Resolve a handled promise in the same turn so Chrome never logs
        // "Uncaught (in promise) AbortError" when pause()/srcObject races play().
        const handled = promise.then(
          () => undefined,
          (err) => {
            if (!isPlayInterruptedError(err)) {
              /* ignore non-abort media errors at the global layer */
            }
          },
        );
        pendingPlays.set(this, handled);
        return handled;
      }
      return result;
    } catch (err) {
      if (isPlayInterruptedError(err)) {
        return Promise.resolve();
      }
      return Promise.reject(err);
    }
  };
  proto.__thPlayPatched = true;
}

/** @deprecated Prefer ensurePlayAbortGuard — kept for call-site compatibility. */
export function installPlayAbortGuard(): () => void {
  ensurePlayAbortGuard();
  return () => undefined;
}

/**
 * Start muted inline video playback without surfacing AbortError to the console.
 * Returns true when playback started; false if interrupted, detached, or blocked.
 */
export async function safeVideoPlay(video: HTMLVideoElement): Promise<boolean> {
  ensurePlayAbortGuard();

  if (typeof document !== 'undefined' && document.hidden) return false;
  if (!video.isConnected) return false;
  if (!video.paused && !video.ended && video.readyState >= 2) return true;

  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', 'true');
  video.setAttribute('muted', '');
  video.autoplay = false;
  video.removeAttribute('autoplay');

  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });

  if (!video.isConnected || !video.srcObject) return false;

  try {
    await video.play();
    return video.isConnected && Boolean(video.srcObject) && !video.paused;
  } catch (err) {
    if (isPlayInterruptedError(err)) return false;
    return false;
  }
}

/** Clear camera stream after any in-flight play() settles (avoids play/pause AbortError). */
export function clearVideoStream(video: HTMLVideoElement | null | undefined): void {
  if (!video) return;
  ensurePlayAbortGuard();
  try {
    video.autoplay = false;
    video.removeAttribute('autoplay');
    const pending = pendingPlays.get(video);
    const clear = () => {
      try {
        if (video.srcObject) video.srcObject = null;
        video.removeAttribute('src');
      } catch {
        /* ignore */
      }
    };
    if (pending) {
      void pending.finally(clear);
    } else {
      clear();
    }
  } catch {
    /* ignore */
  }
}
