/** Chrome rejects play() with AbortError when pause() runs before play() settles. */
export function isPlayInterruptedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? String((err as { name?: unknown }).name) : '';
  const message = 'message' in err ? String((err as { message?: unknown }).message) : '';
  return name === 'AbortError' || /interrupted|abort/i.test(message);
}

/**
 * Start muted inline video playback without surfacing AbortError to the console.
 * Returns true when playback started; false if interrupted, detached, or blocked.
 */
export async function safeVideoPlay(video: HTMLVideoElement): Promise<boolean> {
  if (!video.isConnected) return false;
  if (!video.paused && !video.ended) return true;

  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', 'true');
  video.setAttribute('muted', '');

  let playPromise: Promise<void>;
  try {
    playPromise = video.play();
  } catch (err) {
    if (isPlayInterruptedError(err)) return false;
    return false;
  }

  // Attach catch immediately so a concurrent pause()/detach cannot become uncaught.
  void playPromise.catch(() => {
    /* expected when srcObject is cleared or the element unmounts mid-play */
  });

  try {
    await playPromise;
    return video.isConnected && !video.paused;
  } catch (err) {
    if (isPlayInterruptedError(err)) return false;
    return false;
  }
}
