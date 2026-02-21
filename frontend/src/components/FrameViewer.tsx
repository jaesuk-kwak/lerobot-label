import { useEffect, useRef, useCallback } from 'react';
import { frameUrl } from '../api';
import type { PlaybackState, PlaybackActions } from '../hooks/usePlayback';
import { SPEEDS } from '../hooks/usePlayback';

interface Props {
  episodeId: number;
  camera: string;
  cameras: string[];
  onCameraChange: (cam: string) => void;
  state: PlaybackState;
  actions: PlaybackActions;
}

const PRELOAD_COUNT = 20;

export default function FrameViewer({
  episodeId,
  camera,
  cameras,
  onCameraChange,
  state,
  actions,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const preloadCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const { currentFrame, isPlaying, speed, totalFrames } = state;

  // Preload upcoming frames into a cache of Image objects.
  // Browser will hold them in its image cache once loaded.
  useEffect(() => {
    const cache = preloadCache.current;
    for (let i = 1; i <= PRELOAD_COUNT; i++) {
      const idx = currentFrame + i;
      if (idx >= totalFrames) break;
      const url = frameUrl(episodeId, idx, camera);
      if (!cache.has(url)) {
        const img = new Image();
        img.src = url;
        cache.set(url, img);
      }
    }
    // Evict stale entries to avoid unbounded growth
    if (cache.size > PRELOAD_COUNT * 3) {
      const currentUrl = frameUrl(episodeId, currentFrame, camera);
      for (const [url] of cache) {
        if (cache.size <= PRELOAD_COUNT * 2) break;
        if (url !== currentUrl) cache.delete(url);
      }
    }
  }, [currentFrame, episodeId, camera, totalFrames]);

  // Clear preload cache when episode or camera changes
  useEffect(() => {
    preloadCache.current.clear();
  }, [episodeId, camera]);

  const handleImageLoad = useCallback(() => {
    actions.onFrameLoaded();
  }, [actions]);

  const src = frameUrl(episodeId, currentFrame, camera);

  return (
    <div className="frame-viewer">
      <div className="frame-display">
        <img
          ref={imgRef}
          src={src}
          alt={`Frame ${currentFrame}`}
          draggable={false}
          onLoad={handleImageLoad}
        />
      </div>

      <div className="playback-controls">
        <button onClick={actions.prevFrame} title="Previous frame (←)">
          ⏮
        </button>
        <button onClick={actions.togglePlay} title="Play/Pause (Space)" className="play-btn">
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button onClick={actions.nextFrame} title="Next frame (→)">
          ⏭
        </button>

        <span className="frame-counter">
          {currentFrame} / {totalFrames - 1}
        </span>

        <select
          value={speed}
          onChange={(e) => actions.setSpeed(Number(e.target.value))}
          className="speed-select"
          title="Playback speed"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>

        <select
          value={camera}
          onChange={(e) => onCameraChange(e.target.value)}
          className="camera-select"
          title="Camera"
        >
          {cameras.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
