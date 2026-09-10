'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { scanVideoFrame, type FaceScanStatus } from '@/lib/exam-v2/face-detector';
import { PROCTOR_FACE_CHECK_MS, PROCTOR_FACE_ABSENT_SEC } from '@/lib/exam-v2/proctoring-config';
import { safeVideoPlay } from '@/lib/media/safe-video-play';

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
  const attachInFlightRef = useRef<Promise<boolean> | null>(null);

  const detachVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    // Do not call pause() — it races in-flight play() and surfaces AbortError.
    try {
      video.srcObject = null;
    } catch {
      /* ignore */
    }
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      /* ignore */
    }
  }, [videoRef]);

  const stopCamera = useCallback(() => {
    playGenRef.current += 1;
    attachInFlightRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    detachVideo();

    setCameraReady(false);
    setFaceStatus('absent');
    setFaceNotVisible(false);
  }, [detachVideo]);

  const attachStreamToVideo = useCallback(async (): Promise<boolean> => {
    if (attachInFlightRef.current) {
      return attachInFlightRef.current;
    }

    const run = async (): Promise<boolean> => {
      const stream = streamRef.current;
      const video = videoRef.current;
      if (!stream || !video || !video.isConnected) return false;

      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }

      const gen = playGenRef.current;
      const played = await safeVideoPlay(video);
      if (gen !== playGenRef.current) return false;
      if (!video.isConnected) return false;

      const ready = played || Boolean(video.srcObject);
      if (ready) {
        setCameraReady(true);
        setCameraError(null);
      }
      return ready;
    };

    const pending = run().finally(() => {
      if (attachInFlightRef.current === pending) {
        attachInFlightRef.current = null;
      }
    });
    attachInFlightRef.current = pending;
    return pending;
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

      const genAtRequest = playGenRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640, max: 640 },
          height: { ideal: 480, max: 480 },
          frameRate: { ideal: 15, max: 15 },
        },
        audio: false,
      });

      // Unmounted / disabled while the permission prompt was open.
      if (genAtRequest !== playGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }

      streamRef.current = stream;
      return attachStreamToVideo();
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
    void startCamera().catch(() => {
      /* startCamera handles errors internally */
    });
    return () => {
      stopCamera();
    };
  }, [enabled, startCamera, stopCamera]);

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
