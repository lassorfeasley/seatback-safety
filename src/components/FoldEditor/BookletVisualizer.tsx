import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RotateCw, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Panel, CoverDesignation } from './types';

interface BookletVisualizerProps {
  panels: Panel[];
  cover?: CoverDesignation;
  minimal?: boolean;
  hintOnLoad?: boolean;
}

interface Spread {
  index: number;
  frontPanel: Panel | undefined;
  backPanel: Panel | undefined;
}

const PANEL_HEIGHT = 250;
const PANEL_WIDTH_FALLBACK = 180;
const PAPER_THICKNESS = 0.8;
const FLIP_DURATION = 600;

// currentPage ranges from 0 to spreads.length:
//   0              → all pages unflipped → front cover visible
//   1..length-1    → interior spreads
//   spreads.length → all pages flipped → back cover visible

export const BookletVisualizer: React.FC<BookletVisualizerProps> = ({
  panels, cover: _cover, minimal, hintOnLoad,
}) => {
  const frontPanels = useMemo(
    () => panels.filter((p) => p.side === 'front').sort((a, b) => a.panel_index - b.panel_index),
    [panels]
  );
  const backPanels = useMemo(
    () => panels.filter((p) => p.side === 'back').sort((a, b) => a.panel_index - b.panel_index),
    [panels]
  );

  const spreads: Spread[] = useMemo(() => {
    const maxIndex = Math.max(
      ...frontPanels.map((p) => p.panel_index),
      ...backPanels.map((p) => p.panel_index),
      -1
    );
    const result: Spread[] = [];
    for (let i = 0; i <= maxIndex; i++) {
      result.push({
        index: i,
        frontPanel: frontPanels.find((p) => p.panel_index === i),
        backPanel: backPanels.find((p) => p.panel_index === i),
      });
    }
    return result;
  }, [frontPanels, backPanels]);

  const totalStates = spreads.length + 1;
  const [currentPage, setCurrentPage] = useState(0);
  const [rotation, setRotation] = useState({ x: 5, y: -15 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const rotationStart = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  const spreadWidths = useMemo(() => {
    return spreads.map((spread) => {
      const front = spread.frontPanel;
      const back = spread.backPanel;
      const w = front?.width_px ?? back?.width_px;
      const h = front?.height_px ?? back?.height_px;
      if (w && h) return PANEL_HEIGHT * (w / h);
      return PANEL_WIDTH_FALLBACK;
    });
  }, [spreads]);

  const maxWidth = Math.max(...spreadWidths, PANEL_WIDTH_FALLBACK);

  const goNext = useCallback(() => {
    setCurrentPage((p) => Math.min(p + 1, totalStates - 1));
  }, [totalStates]);

  const goPrev = useCallback(() => {
    setCurrentPage((p) => Math.max(p - 1, 0));
  }, []);

  const startDrag = useCallback(
    (x: number, y: number) => {
      setIsDragging(true);
      dragStart.current = { x, y };
      rotationStart.current = { ...rotation };
    },
    [rotation]
  );

  const moveDrag = useCallback(
    (x: number, y: number) => {
      if (!isDragging) return;
      setRotation({
        x: rotationStart.current.x - (y - dragStart.current.y) * 0.5,
        y: rotationStart.current.y + (x - dragStart.current.x) * 0.5,
      });
    },
    [isDragging]
  );

  const endDrag = useCallback(() => setIsDragging(false), []);

  // Track drag distance to distinguish clicks from drags
  const dragDistance = useRef(0);
  const lastDragPos = useRef({ x: 0, y: 0 });
  const lastTouchEnd = useRef(0);

  const startDragTracked = useCallback(
    (x: number, y: number) => {
      dragDistance.current = 0;
      lastDragPos.current = { x, y };
      startDrag(x, y);
    },
    [startDrag]
  );

  const moveDragTracked = useCallback(
    (x: number, y: number) => {
      if (!isDragging) return;
      dragDistance.current += Math.abs(x - lastDragPos.current.x) + Math.abs(y - lastDragPos.current.y);
      lastDragPos.current = { x, y };
      moveDrag(x, y);
    },
    [isDragging, moveDrag]
  );

  // Click to flip one page (minimal mode only)
  const handleCanvasClick = useCallback(() => {
    if (!minimal || dragDistance.current > 5) return;
    setCurrentPage((p) => {
      if (p >= totalStates - 1) return 0;
      return p + 1;
    });
  }, [minimal, totalStates]);

  // Hint animation: flip through all pages then close
  const animationTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    return () => { animationTimeouts.current.forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    if (!hintOnLoad || spreads.length === 0) return;

    const n = spreads.length + 1;
    const flipDelay = FLIP_DURATION - 100;

    // Flip forward through all pages
    for (let i = 1; i <= n; i++) {
      const t = setTimeout(() => setCurrentPage(i), 600 + i * flipDelay);
      animationTimeouts.current.push(t);
    }

    // Pause, then flip back to front cover
    const forwardDone = 600 + n * flipDelay + 800;
    for (let i = n - 1; i >= 0; i--) {
      const t = setTimeout(
        () => setCurrentPage(i),
        forwardDone + (n - 1 - i) * flipDelay
      );
      animationTimeouts.current.push(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', handleTouchMove);
  }, [moveDrag]);

  const renderFace = (panel: Panel | undefined, spreadIndex: number, side: 'front' | 'back', w: number) => {
    const hasImage = panel && panel.thumbnail_url;
    const label = side === 'front' ? `F-P${spreadIndex + 1}` : `B-P${spreadIndex + 1}`;

    if (hasImage) {
      return (
        <img
          src={panel.thumbnail_url}
          alt={label}
          className="object-contain pointer-events-none"
          style={{ width: w, height: PANEL_HEIGHT }}
          draggable={false}
        />
      );
    }

    const colorClass = side === 'front'
      ? 'text-indigo-400 bg-indigo-500/10 border-indigo-300/20'
      : 'text-violet-400 bg-violet-500/10 border-violet-300/20';

    return (
      <div
        className={`flex items-center justify-center text-xs border rounded-sm ${colorClass}`}
        style={{ width: w, height: PANEL_HEIGHT }}
      >
        {label}
      </div>
    );
  };

  const pageLabel = useMemo(() => {
    if (currentPage === 0) return 'Cover';
    if (currentPage >= spreads.length) return 'Back Cover';
    return `Spread ${currentPage}`;
  }, [currentPage, spreads.length]);

  if (spreads.length === 0) return null;

  // Spine position: place it so the visible content is centered horizontally.
  // Front cover: content is [spine, spine+page] → spine at 50% - halfPage
  // Open spread: content is [spine-page, spine+page] → spine at 50%
  // Back cover: content is [spine-page, spine] → spine at 50% + halfPage
  const isClosed = currentPage === 0;
  const isBackCover = currentPage >= spreads.length;
  const halfPage = maxWidth / 2;
  const spineLeftOffset = isClosed ? -halfPage : isBackCover ? halfPage : 0;

  const canvasEl = (
    <div
      ref={canvasRef}
      className={cn(
        minimal
          ? 'relative w-full h-full select-none'
          : 'rounded-b-lg bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 relative min-h-[350px] h-full select-none overflow-hidden',
        isDragging ? 'cursor-grabbing' : (minimal ? 'cursor-crosshair' : 'cursor-grab')
      )}
      style={{ perspective: '1200px', perspectiveOrigin: '50% 50%' }}
      onMouseDown={(e) => { e.preventDefault(); startDragTracked(e.clientX, e.clientY); }}
      onMouseMove={(e) => moveDragTracked(e.clientX, e.clientY)}
      onMouseUp={() => { handleCanvasClick(); endDrag(); }}
      onMouseLeave={() => { if (isDragging) endDrag(); }}
      onTouchStart={(e) => { if (e.touches.length === 1) startDragTracked(e.touches[0].clientX, e.touches[0].clientY); }}
      onTouchEnd={() => { lastTouchEnd.current = Date.now(); handleCanvasClick(); endDrag(); }}
    >
      <div
        style={{
          position: 'absolute',
          left: `calc(50% + ${spineLeftOffset}px)`,
          top: `calc(50% - ${PANEL_HEIGHT / 2}px)`,
          transition: isDragging ? 'none' : `left ${FLIP_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        }}
      >
        <div
          style={{
            transformStyle: 'preserve-3d',
            transformOrigin: `0px ${PANEL_HEIGHT / 2}px`,
            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
            transition: isDragging ? 'none' : 'transform 300ms ease-out',
          }}
        >
        <div
          style={{
            position: 'relative',
            width: maxWidth,
            height: PANEL_HEIGHT,
            transformStyle: 'preserve-3d',
          }}
        >
          {spreads.map((spread, idx) => {
            const isFlipped = idx < currentPage;
            const isCurrent = idx === currentPage || (currentPage >= spreads.length && idx === spreads.length - 1);
            const w = spreadWidths[idx];

            const flipAngle = isFlipped ? -180 : 0;
            const maxIdx = spreads.length - 1;
            // Unflipped: spread 0 (front cover) has highest Z = closest to viewer
            // Flipped: highest index (most recently flipped) has highest Z = on top of left pile
            // When viewed from behind (Flip button), the lowest-Z unflipped page is closest,
            // which is spread N-1 (back cover's back face).
            const zOffset = isFlipped
              ? idx * PAPER_THICKNESS
              : (maxIdx - idx) * PAPER_THICKNESS;

            return (
              <div
                key={spread.index}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: w,
                  height: PANEL_HEIGHT,
                  transformStyle: 'preserve-3d',
                  transformOrigin: 'left center',
                  transform: `translateZ(${zOffset}px) rotateY(${flipAngle}deg)`,
                  transition: `transform ${FLIP_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                  zIndex: isCurrent ? spreads.length : isFlipped ? idx : spreads.length - idx,
                }}
              >
                {/* Front face */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backfaceVisibility: 'hidden',
                    transform: `translateZ(${PAPER_THICKNESS / 2}px)`,
                  }}
                >
                  {renderFace(spread.frontPanel, spread.index, 'front', w)}
                </div>

                {/* Back face */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backfaceVisibility: 'hidden',
                    transform: `translateZ(${-PAPER_THICKNESS / 2}px) rotateY(180deg)`,
                  }}
                >
                  {renderFace(spread.backPanel, spread.index, 'back', w)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );

  if (minimal) {
    return canvasEl;
  }

  return (
    <Card className="w-full flex flex-col">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Booklet Preview</CardTitle>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => { setRotation({ x: 5, y: -15 }); setCurrentPage(0); }} className="h-7 px-2 text-xs">
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRotation((r) => ({ ...r, y: r.y + 180 }))} className="h-7 px-2 text-xs">
              <RotateCw className="h-3 w-3 mr-1" />
              Flip
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            disabled={currentPage === 0}
            className="h-7 px-2"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="text-xs text-muted-foreground flex-1 text-center">
            {pageLabel}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={currentPage >= totalStates - 1}
            className="h-7 px-2"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">Drag to rotate</p>
      </CardHeader>
      <CardContent className="p-0 flex-1">
        {canvasEl}
      </CardContent>
    </Card>
  );
};
