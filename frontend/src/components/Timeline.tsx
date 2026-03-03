import { useRef, useCallback, useState, useEffect } from 'react';

interface Props {
  totalFrames: number;
  currentFrame: number;
  improvement: number[];
  isHumanInput: number[];
  onSeek: (frame: number) => void;
  selectionStart: number | null;
  selectionEnd: number | null;
  onSelectionChange: (start: number | null, end: number | null) => void;
}

const DRAG_THRESHOLD = 3; // pixels before a click becomes a drag

export default function Timeline({
  totalFrames,
  currentFrame,
  improvement,
  isHumanInput,
  onSeek,
  selectionStart,
  selectionEnd,
  onSelectionChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const humanCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartFrame = useRef(0);
  const didDrag = useRef(false);
  const activeCanvasRect = useRef<DOMRect | null>(null);

  const frameFromClientX = useCallback(
    (clientX: number) => {
      const rect = activeCanvasRect.current;
      if (!rect || totalFrames <= 0) return 0;
      const x = clientX - rect.left;
      const frac = Math.max(0, Math.min(1, x / rect.width));
      return Math.round(frac * (totalFrames - 1));
    },
    [totalFrames],
  );

  // Draw the timeline canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    if (totalFrames > 0 && improvement.length > 0) {
      const segW = w / totalFrames;
      for (let i = 0; i < totalFrames; i++) {
        const val = i < improvement.length ? improvement[i] : 0;
        ctx.fillStyle = val === 1 ? '#4caf50' : '#424242';
        ctx.fillRect(i * segW, 0, Math.max(segW, 1), h);
      }
    }

    // Draw selection range
    if (selectionStart !== null && selectionEnd !== null) {
      const s = Math.min(selectionStart, selectionEnd);
      const e = Math.max(selectionStart, selectionEnd);
      const segW = w / totalFrames;
      ctx.fillStyle = 'rgba(33, 150, 243, 0.35)';
      ctx.fillRect(s * segW, 0, (e - s + 1) * segW, h);
      ctx.strokeStyle = '#2196f3';
      ctx.lineWidth = 2;
      ctx.strokeRect(s * segW, 0, (e - s + 1) * segW, h);
    }

    // Draw playhead
    const px = (currentFrame / Math.max(totalFrames - 1, 1)) * w;
    ctx.fillStyle = '#fff';
    ctx.fillRect(px - 1, 0, 2, h);
    ctx.beginPath();
    ctx.moveTo(px - 5, 0);
    ctx.lineTo(px + 5, 0);
    ctx.lineTo(px, 6);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
  }, [totalFrames, currentFrame, improvement, selectionStart, selectionEnd]);

  // Draw the is_human_input canvas
  useEffect(() => {
    const canvas = humanCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    if (totalFrames > 0 && isHumanInput.length > 0) {
      const segW = w / totalFrames;
      for (let i = 0; i < totalFrames; i++) {
        const val = i < isHumanInput.length ? isHumanInput[i] : 0;
        ctx.fillStyle = val === 1 ? '#ff9800' : '#424242';
        ctx.fillRect(i * segW, 0, Math.max(segW, 1), h);
      }
    }

    // Draw playhead
    const px = (currentFrame / Math.max(totalFrames - 1, 1)) * w;
    ctx.fillStyle = '#fff';
    ctx.fillRect(px - 1, 0, 2, h);
    ctx.beginPath();
    ctx.moveTo(px - 5, 0);
    ctx.lineTo(px + 5, 0);
    ctx.lineTo(px, 6);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
  }, [totalFrames, currentFrame, isHumanInput]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const canvas = e.currentTarget as HTMLCanvasElement;
      activeCanvasRect.current = canvas.getBoundingClientRect();
      dragStartX.current = e.clientX;
      dragStartFrame.current = frameFromClientX(e.clientX);
      didDrag.current = false;
      setIsDragging(true);
    },
    [frameFromClientX],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - dragStartX.current);
      if (dx >= DRAG_THRESHOLD) {
        didDrag.current = true;
      }
      if (didDrag.current) {
        const frame = frameFromClientX(e.clientX);
        onSelectionChange(dragStartFrame.current, frame);
      }
    };

    const handleUp = (e: MouseEvent) => {
      if (!didDrag.current) {
        const frame = frameFromClientX(e.clientX);
        onSeek(frame);
      }
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, frameFromClientX, onSeek, onSelectionChange]);

  return (
    <div className="timeline">
      <div className="timeline-row">
        <span className="timeline-label">improvement</span>
        <canvas
          ref={canvasRef}
          className="timeline-canvas"
          onMouseDown={handleMouseDown}
        />
      </div>
      {isHumanInput.length > 0 && (
        <div className="timeline-row">
          <span className="timeline-label">is_human_input</span>
          <canvas
            ref={humanCanvasRef}
            className="timeline-canvas timeline-canvas-secondary"
            onMouseDown={handleMouseDown}
          />
        </div>
      )}
      <div className="timeline-hint">
        Click to seek &middot; Drag to select range
      </div>
    </div>
  );
}
