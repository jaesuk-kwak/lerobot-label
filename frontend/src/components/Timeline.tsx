import { useRef, useCallback, useState, useEffect } from 'react';

interface Props {
  totalFrames: number;
  currentFrame: number;
  improvement: number[];
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
  onSeek,
  selectionStart,
  selectionEnd,
  onSelectionChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartFrame = useRef(0);
  const didDrag = useRef(false);

  const frameFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || totalFrames <= 0) return 0;
      const x = e.clientX - rect.left;
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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragStartX.current = e.clientX;
      dragStartFrame.current = frameFromEvent(e);
      didDrag.current = false;
      setIsDragging(true);
    },
    [frameFromEvent],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - dragStartX.current);
      if (dx >= DRAG_THRESHOLD) {
        didDrag.current = true;
      }
      if (didDrag.current) {
        const frame = frameFromEvent(e as unknown as React.MouseEvent);
        onSelectionChange(dragStartFrame.current, frame);
      }
    };

    const handleUp = (e: MouseEvent) => {
      if (!didDrag.current) {
        // Short click without drag = seek
        const frame = frameFromEvent(e as unknown as React.MouseEvent);
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
  }, [isDragging, frameFromEvent, onSeek, onSelectionChange]);

  return (
    <div className="timeline" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="timeline-canvas"
        onMouseDown={handleMouseDown}
      />
      <div className="timeline-hint">
        Click to seek &middot; Drag to select range
      </div>
    </div>
  );
}
