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

type PlayPatchedMedia = HTMLMediaElement & { __thPlayPatched?: boolean };

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
  // Prefer explicit play() — autoPlay attribute races remounts and throws AbortError.
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
    const playPromise = video.play();
    if (playPromise && typeof (playPromise as Promise<void>).then === 'function') {
      // Attach catch immediately so remount/srcObject clear cannot become uncaught.
      void playPromise.catch(() => {
        /* expected when element detaches or srcObject is cleared mid-play */
      });
      await playPromise.catch(() => undefined);
    }
    return video.isConnected && Boolean(video.srcObject) && !video.paused;
  } catch (err) {
    if (isPlayInterruptedError(err)) return false;
    return false;
  }
}

/**
 * Suppress Chrome play/pause AbortError globally:
 * - unhandledrejection listener
 * - patch HTMLMediaElement.play so every call has a rejection handler
 */
export function installPlayAbortGuard(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onRejection = (event: PromiseRejectionEvent) => {
    if (isPlayInterruptedError(event.reason)) {
      event.preventDefault();
      event.stopPropagation?.();
    }
  };
  window.addEventListener('unhandledrejection', onRejection);

  const proto = HTMLMediaElement.prototype as PlayPatchedMedia;
  let restorePlay: (() => void) | null = null;
  if (!proto.__thPlayPatched) {
    const originalPlay = proto.play;
    proto.play = function patchedPlay(this: HTMLMediaElement, ...args: Parameters<HTMLMediaElement['play']>) {
      try {
        const result = originalPlay.apply(this, args);
        if (result && typeof (result as Promise<void>).then === 'function') {
          const promise = result as Promise<void>;
          void promise.catch(() => {
            /* swallow AbortError from autoplay / remount races */
          });
          return promise;
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
    restorePlay = () => {
      proto.play = originalPlay;
      delete proto.__thPlayPatched;
    };
  }

  return () => {
    window.removeEventListener('unhandledrejection', onRejection);
    restorePlay?.();
  };
}

/** Clear camera stream without calling pause() (avoids play/pause AbortError). */
export function clearVideoStream(video: HTMLVideoElement | null | undefined): void {
  if (!video) return;
  try {
    video.autoplay = false;
    video.removeAttribute('autoplay');
    if (video.srcObject) {
      video.srcObject = null;
    }
    video.removeAttribute('src');
  } catch {
    /* ignore */
  }
}
