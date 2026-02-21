import { useState, useRef, useCallback, useEffect } from 'react';

export interface PlaybackState {
  currentFrame: number;
  isPlaying: boolean;
  speed: number;
  totalFrames: number;
  fps: number;
}

export interface PlaybackActions {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  nextFrame: () => void;
  prevFrame: () => void;
  seekTo: (frame: number) => void;
  setSpeed: (speed: number) => void;
  reset: (totalFrames: number) => void;
  /** Called by FrameViewer when a frame image has finished loading */
  onFrameLoaded: () => void;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

/**
 * Frame-load-aware playback hook.
 *
 * Instead of a blind setInterval that advances regardless of image load
 * state, this uses a "schedule next advance after image loads" model:
 *   1. Timer fires → advance frame counter
 *   2. FrameViewer renders new <img> → browser fetches image
 *   3. Image onLoad fires → FrameViewer calls onFrameLoaded()
 *   4. onFrameLoaded schedules the next timer tick
 *
 * This guarantees we never get ahead of what the user can see and
 * naturally adapts to network/decode latency.
 */
export function usePlayback(initialTotal: number, fps: number): [PlaybackState, PlaybackActions] {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [totalFrames, setTotalFrames] = useState(initialTotal);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(false);
  const speedRef = useRef(speed);
  const totalRef = useRef(totalFrames);
  const frameRef = useRef(currentFrame);

  speedRef.current = speed;
  totalRef.current = totalFrames;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleNextFrame = useCallback(() => {
    if (!playingRef.current) return;
    clearTimer();
    const ms = 1000 / (fps * speedRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setCurrentFrame((prev) => {
        const next = prev + 1;
        if (next >= totalRef.current) {
          playingRef.current = false;
          setIsPlaying(false);
          return prev;
        }
        frameRef.current = next;
        return next;
      });
    }, ms);
  }, [fps, clearTimer]);

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  useEffect(() => {
    setTotalFrames(initialTotal);
    setCurrentFrame(0);
    frameRef.current = 0;
    setIsPlaying(false);
    playingRef.current = false;
    clearTimer();
  }, [initialTotal, clearTimer]);

  const play = useCallback(() => {
    playingRef.current = true;
    setIsPlaying(true);
    scheduleNextFrame();
  }, [scheduleNextFrame]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setIsPlaying(false);
    clearTimer();
  }, [clearTimer]);

  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      pause();
    } else {
      setCurrentFrame((f) => {
        const startFrom = f >= totalRef.current - 1 ? 0 : f;
        frameRef.current = startFrom;
        playingRef.current = true;
        setIsPlaying(true);
        scheduleNextFrame();
        return startFrom;
      });
    }
  }, [pause, scheduleNextFrame]);

  const nextFrame = useCallback(() => {
    setCurrentFrame((f) => {
      const n = Math.min(f + 1, totalRef.current - 1);
      frameRef.current = n;
      return n;
    });
  }, []);

  const prevFrame = useCallback(() => {
    setCurrentFrame((f) => {
      const n = Math.max(f - 1, 0);
      frameRef.current = n;
      return n;
    });
  }, []);

  const seekTo = useCallback((frame: number) => {
    const clamped = Math.max(0, Math.min(frame, totalRef.current - 1));
    frameRef.current = clamped;
    setCurrentFrame(clamped);
  }, []);

  const setSpeed = useCallback((s: number) => {
    setSpeedState(s);
    speedRef.current = s;
  }, []);

  const reset = useCallback(
    (newTotal: number) => {
      clearTimer();
      playingRef.current = false;
      setIsPlaying(false);
      setCurrentFrame(0);
      frameRef.current = 0;
      setTotalFrames(newTotal);
    },
    [clearTimer],
  );

  /**
   * Called by FrameViewer when the current frame's image has loaded.
   * Schedules the next frame advance if we're playing.
   */
  const onFrameLoaded = useCallback(() => {
    if (playingRef.current && timerRef.current === null) {
      scheduleNextFrame();
    }
  }, [scheduleNextFrame]);

  return [
    { currentFrame, isPlaying, speed, totalFrames, fps },
    { play, pause, togglePlay, nextFrame, prevFrame, seekTo, setSpeed, reset, onFrameLoaded },
  ];
}

export { SPEEDS };
