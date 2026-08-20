'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { scanVideoFrame, type FaceScanStatus } from '@/lib/exam-v2/face-detector';
import { PROCTOR_FACE_CHECK_MS, PROCTOR_FACE_ABSENT_SEC } from '@/lib/exam-v2/proctoring-config';

type Options = {
  enabled: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

/**
 * Live camera preview for proctored exams. Stream stays in the browser only —
 * no frames are uploaded, stored, or counted as integrity violations.
 */
export function useCameraProctoring({ enabled, videoRef }: Options) {
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceStatus, setFaceStatus] = useState<FaceScanStatus>('absent');
  /** UI-only: show red “face not visible” hint (not a proctoring flag). */
  const [faceNotVisible, setFaceNotVisible] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const absentSinceRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const playGenRef = useRef(0);

  const stopCamera = useCallback(() => {
    playGenRef.current += 1;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
      video.removeAttribute('src');
      video.srcObject = null;
      try {
        video.load();
      } catch {
        /* ignore */
      }
    }
    setCameraReady(false);
    setFaceStatus('absent');
    setFaceNotVisible(false);
  }, [videoRef]);

  const attachStreamToVideo = useCallback(async (): Promise<boolean> => {
    const stream = streamRef.current;
    const video = videoRef.current;
    if (!stream || !video) return false;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
    }

    const gen = ++playGenRef.current;
    try {
      if (video.paused) {
        // Never leave an unhandled rejection if pause() interrupts play().
        await video.play().catch((err: unknown) => {
          const interrupted =
            err instanceof DOMException &&
            (err.name === 'AbortError' || /interrupted/i.test(err.message));
          if (!interrupted) throw err;
        });
      }
      if (gen !== playGenRef.current) return false;
      setCameraReady(true);
      setCameraError(null);
      return true;
    } catch {
      if (gen !== playGenRef.current) return false;
      // Stream is attached even if autoplay was interrupted.
      setCameraReady(Boolean(video.srcObject));
      return Boolean(video.srcObject);
    }
  }, [videoRef]);

  const startCamera = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is not supported in this browser.');
      setCameraReady(false);
      return false;
    }

    try {
      if (streamRef.current) {
        return attachStreamToVideo();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640, max: 640 },
          height: { ideal: 480, max: 480 },
          frameRate: { ideal: 15, max: 15 },
        },
        audio: false,
      });
      streamRef.current = stream;

      if (await attachStreamToVideo()) return true;

      setCameraError(null);
      return true;
    } catch {
      setCameraError(
        'Camera access is required for proctored exams. Allow camera permission and retry.',
      );
      setCameraReady(false);
      return false;
    }
  }, [attachStreamToVideo]);

  useEffect(() => {
    if (!enabled) {
      stopCamera();
      return;
    }
    void startCamera();
    return () => {
      stopCamera();
    };
  }, [enabled, startCamera, stopCamera]);

  useEffect(() => {
    if (!enabled || !streamRef.current) return;

    let cancelled = false;
    let tries = 0;
    const maxTries = 40;

    const attemptBind = async () => {
      if (cancelled) return;
      tries += 1;
      const ok = await attachStreamToVideo();
      if (ok || cancelled || tries >= maxTries) return;
      window.setTimeout(() => void attemptBind(), 150);
    };

    void attemptBind();
    return () => {
      cancelled = true;
    };
  }, [enabled, attachStreamToVideo]);

  // Local face check for on-screen hint only — never sent to the server.
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled || scanningRef.current) return;
      const video = videoRef.current;
      if (!video || !streamRef.current || video.readyState < 2) return;

      scanningRef.current = true;
      try {
        const result = await scanVideoFrame(video);
        setFaceStatus(result.status);

        const now = Date.now();
        if (result.status === 'present') {
          absentSinceRef.current = null;
          setFaceNotVisible(false);
        } else {
          if (absentSinceRef.current == null) absentSinceRef.current = now;
          const absentMs = now - absentSinceRef.current;
          setFaceNotVisible(absentMs >= PROCTOR_FACE_ABSENT_SEC * 1000);
        }
      } finally {
        scanningRef.current = false;
      }
    };

    const id = window.setInterval(() => void tick(), PROCTOR_FACE_CHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, videoRef]);

  return {
    cameraReady,
    cameraError,
    faceStatus,
    faceNotVisible,
    startCamera,
    stopCamera,
  };
}
