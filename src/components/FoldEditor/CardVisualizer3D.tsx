import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RotateCw, RotateCcw, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Panel, Crease, CoverDesignation } from './types';

interface CardVisualizer3DProps {
  panels: Panel[];
  creases: Crease[];
  cover?: CoverDesignation;
}

interface Spread {
  index: number;
  frontPanel: Panel | undefined;
  backPanel: Panel | undefined;
}

const FOLD_DURATION = 600;
const FOLD_STAGGER = 100;
const PAPER_THICKNESS = 3;
const PANEL_HEIGHT = 250;
const PANEL_WIDTH_FALLBACK = 180;

export const CardVisualizer3D: React.FC<CardVisualizer3DProps> = ({ panels, creases, cover }) => {
  const [targetFoldState, setTargetFoldState] = useState<0 | 1>(1);
  const [rotation, setRotation] = useState({ x: 15, y: -20 });
  const [isDragging, setIsDragging] = useState(false);
  const [isSliderActive, setIsSliderActive] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const rotationStart = useRef({ x: 0, y: 0 });
  const animationTimeouts = useRef<NodeJS.Timeout[]>([]);

  const coverDesignation: CoverDesignation = cover || { spreadIndex: 0, side: 'front' };

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

  const frontCreases = useMemo(
    () => creases.filter((c) => c.side === 'front').sort((a, b) => a.between_panel - b.between_panel),
    [creases]
  );

  const creasesByUnfoldOrder = useMemo(() => {
    return [...frontCreases].sort(
      (a, b) => (a.unfold_sequence ?? a.between_panel) - (b.unfold_sequence ?? b.between_panel)
    );
  }, [frontCreases]);

  const [creaseFolds, setCreaseFolds] = useState<Record<number, number>>({});

  useEffect(() => {
    setCreaseFolds((prev) => {
      const updated: Record<number, number> = {};
      frontCreases.forEach((c) => {
        updated[c.between_panel] = prev[c.between_panel] ?? 1;
      });
      return updated;
    });
  }, [frontCreases]);

  useEffect(() => () => { animationTimeouts.current.forEach(clearTimeout); }, []);

  const overallFoldProgress = useMemo(() => {
    const values = Object.values(creaseFolds);
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }, [creaseFolds]);

  // ─── Controls ──────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    animationTimeouts.current.forEach(clearTimeout);
    animationTimeouts.current = [];
    setRotation({ x: 15, y: -20 });
    setTargetFoldState(1);
    const newFolds: Record<number, number> = {};
    frontCreases.forEach((c) => { newFolds[c.between_panel] = 1; });
    setCreaseFolds(newFolds);
  }, [frontCreases]);

  const handleFlip = useCallback(() => {
    setRotation((prev) => ({ x: prev.x, y: prev.y + 180 }));
  }, []);

  const handleFold = useCallback(() => {
    animationTimeouts.current.forEach(clearTimeout);
    animationTimeouts.current = [];
    setTargetFoldState(1);
    const foldOrder = [...creasesByUnfoldOrder].reverse();
    foldOrder.forEach((crease, i) => {
      const delay = i * (FOLD_DURATION - FOLD_STAGGER);
      const t = setTimeout(() => {
        setCreaseFolds((prev) => ({ ...prev, [crease.between_panel]: 1 }));
      }, delay);
      animationTimeouts.current.push(t);
    });
  }, [creasesByUnfoldOrder]);

  const handleUnfold = useCallback(() => {
    animationTimeouts.current.forEach(clearTimeout);
    animationTimeouts.current = [];
    setTargetFoldState(0);
    creasesByUnfoldOrder.forEach((crease, i) => {
      const delay = i * (FOLD_DURATION - FOLD_STAGGER);
      const t = setTimeout(() => {
        setCreaseFolds((prev) => ({ ...prev, [crease.between_panel]: 0 }));
      }, delay);
      animationTimeouts.current.push(t);
    });
  }, [creasesByUnfoldOrder]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setIsSliderActive(true);
      const v = parseFloat(e.target.value);
      const n = creasesByUnfoldOrder.length;
      if (n === 0) return;
      const newFolds: Record<number, number> = {};
      creasesByUnfoldOrder.forEach((crease, i) => {
        const lo = (n - i - 1) / n;
        const hi = (n - i) / n;
        if (v >= hi) newFolds[crease.between_panel] = 1;
        else if (v <= lo) newFolds[crease.between_panel] = 0;
        else newFolds[crease.between_panel] = (v - lo) / (hi - lo);
      });
      setCreaseFolds(newFolds);
      setTargetFoldState(v > 0.5 ? 1 : 0);
    },
    [creasesByUnfoldOrder]
  );

  const handleSliderRelease = useCallback(() => {
    setTimeout(() => setIsSliderActive(false), 50);
  }, []);

  // ─── Drag-to-rotate ───────────────────────────────────────────

  const startDrag = useCallback(
    (x: number, y: number) => {
      setIsDragging(true);
      dragStart.current = { x, y };
      rotationStart.current = { ...rotation };
    },
    [rotation]
  );

  const moveDrag = useCallback(
    (x: number, _y: number) => {
      if (!isDragging) return;
      setRotation((prev) => ({
        x: prev.x,
        y: rotationStart.current.y + (x - dragStart.current.x) * 0.5,
      }));
    },
    [isDragging]
  );

  const endDrag = useCallback(() => setIsDragging(false), []);

  // ─── Layout math ──────────────────────────────────────────────

  const totalWidth = spreads.length * PANEL_WIDTH_FALLBACK;
  const currentWidth = totalWidth - (totalWidth - PANEL_WIDTH_FALLBACK) * overallFoldProgress;
  const offsetX = -currentWidth / 2;
  const offsetY = -PANEL_HEIGHT / 2;
  const staticFlipY = coverDesignation.side === 'back' ? 180 : 0;
  const foldTransition = isSliderActive
    ? 'none'
    : `transform ${FOLD_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`;

  // ─── Recursive card rendering ─────────────────────────────────

  const renderSpread = (idx: number): React.ReactNode => {
    const spread = spreads[idx];
    if (!spread) return null;

    const isLast = idx === spreads.length - 1;
    const crease = frontCreases.find((c) => c.between_panel === idx);
    const amount = creaseFolds[idx] ?? 0;
    const angle = crease
      ? (crease.fold_direction === 'forward' ? -1 : 1) * amount * 180
      : 0;
    const zShift = crease
      ? (crease.fold_direction === 'forward' ? 1 : -1) * PAPER_THICKNESS * amount
      : 0;

    const hasFront = spread.frontPanel && spread.frontPanel.thumbnail_url;
    const hasBack = spread.backPanel && spread.backPanel.thumbnail_url;

    return (
      <div key={spread.index} className="flex" style={{ transformStyle: 'preserve-3d' }}>
        {/* Panel: a double-sided surface with front and back faces */}
        <div className="relative flex-shrink-0" style={{ transformStyle: 'preserve-3d' }}>
          {hasFront ? (
            <img
              src={spread.frontPanel!.thumbnail_url}
              alt={`Front ${spread.index + 1}`}
              className="w-auto object-contain pointer-events-none"
              style={{
                height: PANEL_HEIGHT,
                backfaceVisibility: 'hidden',
                transform: `translateZ(${PAPER_THICKNESS / 2}px)`,
              }}
              draggable={false}
            />
          ) : (
            <div
              className="flex items-center justify-center text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-300/20 rounded-sm"
              style={{
                height: PANEL_HEIGHT,
                width: PANEL_WIDTH_FALLBACK,
                backfaceVisibility: 'hidden',
                transform: `translateZ(${PAPER_THICKNESS / 2}px)`,
              }}
            >
              F-S{spread.index + 1}
            </div>
          )}

          {hasBack ? (
            <img
              src={spread.backPanel!.thumbnail_url}
              alt={`Back ${spread.index + 1}`}
              className="absolute inset-0 w-auto object-contain pointer-events-none"
              style={{
                height: PANEL_HEIGHT,
                backfaceVisibility: 'hidden',
                transform: `translateZ(${-PAPER_THICKNESS / 2}px) rotateY(180deg)`,
              }}
              draggable={false}
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center text-xs text-violet-400 bg-violet-500/10 border border-violet-300/20 rounded-sm"
              style={{
                height: PANEL_HEIGHT,
                width: PANEL_WIDTH_FALLBACK,
                backfaceVisibility: 'hidden',
                transform: `translateZ(${-PAPER_THICKNESS / 2}px) rotateY(180deg)`,
              }}
            >
              B-S{spread.index + 1}
            </div>
          )}
        </div>

        {/* Hinge to next spread — nested inside current so the rotation cascades */}
        {!isLast && (
          <div
            style={{
              transformStyle: 'preserve-3d',
              transformOrigin: 'left center',
              transition: foldTransition,
              transform: `translateZ(${zShift}px) rotateY(${angle}deg)`,
            }}
          >
            {renderSpread(idx + 1)}
          </div>
        )}
      </div>
    );
  };

  if (spreads.length === 0) return null;

  return (
    <Card className="w-full flex flex-col">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Preview</CardTitle>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={handleReset} className="h-7 px-2 text-xs">
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
            <Button variant="outline" size="sm" onClick={handleFlip} className="h-7 px-2 text-xs">
              <RotateCw className="h-3 w-3 mr-1" />
              Flip
            </Button>
            <Button
              variant={targetFoldState === 0 ? 'default' : 'outline'}
              size="sm"
              onClick={handleUnfold}
              className="h-7 px-2 text-xs"
            >
              <Maximize2 className="h-3 w-3 mr-1" />
              Unfold
            </Button>
            <Button
              variant={targetFoldState === 1 ? 'default' : 'outline'}
              size="sm"
              onClick={handleFold}
              className="h-7 px-2 text-xs"
            >
              <Minimize2 className="h-3 w-3 mr-1" />
              Fold
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground">Flat</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={overallFoldProgress}
            onChange={handleSliderChange}
            onMouseUp={handleSliderRelease}
            onTouchEnd={handleSliderRelease}
            className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-[10px] text-muted-foreground">Folded</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">Drag to rotate</p>
      </CardHeader>
      <CardContent className="p-0 flex-1">
        <div
          className={cn(
            'rounded-b-lg bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900',
            'relative min-h-[350px] h-full select-none overflow-hidden',
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          )}
          style={{ perspective: '1200px', perspectiveOrigin: '50% 50%' }}
          onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
          onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
          onMouseUp={endDrag}
          onMouseLeave={() => { if (isDragging) endDrag(); }}
          onTouchStart={(e) => { if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY); }}
          onTouchMove={(e) => { if (e.touches.length === 1) moveDrag(e.touches[0].clientX, e.touches[0].clientY); }}
          onTouchEnd={endDrag}
        >
          {/*
           * Anchor: positioned at the exact center of the canvas.
           * This zero-size point is where all rotation happens, so drag
           * always rotates around the visual center of the card.
           */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transformStyle: 'preserve-3d',
              transition: isDragging ? 'none' : 'transform 300ms ease-out',
              transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y + staticFlipY}deg)`,
            }}
          >
            {/*
             * Card content: translated so its visual center sits on the
             * rotation anchor. offsetX shifts left by half the current
             * visual width; offsetY shifts up by half the panel height.
             */}
            <div
              style={{
                transformStyle: 'preserve-3d',
                transition: foldTransition,
                transform: `translate(${offsetX}px, ${offsetY}px)`,
              }}
            >
              <div className="inline-flex" style={{ transformStyle: 'preserve-3d' }}>
                {renderSpread(0)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
