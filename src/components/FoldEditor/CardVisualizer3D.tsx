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
  pivotIndex?: number;
}

interface Spread {
  index: number;
  frontPanel: Panel | undefined;
  backPanel: Panel | undefined;
}

const FOLD_DURATION = 600;
const FOLD_STAGGER = 100;
const PAPER_THICKNESS = 0.6;
const PANEL_HEIGHT = 250;
const PANEL_WIDTH_FALLBACK = 180;

function defaultPivot(coverIdx: number, panelCount: number): number {
  if (panelCount <= 1) return 0;
  if (coverIdx <= 0) return 1;
  if (coverIdx >= panelCount - 1) return panelCount - 2;
  return coverIdx - 1;
}

export const CardVisualizer3D: React.FC<CardVisualizer3DProps> = ({
  panels, creases, cover, pivotIndex,
}) => {
  const [targetFoldState, setTargetFoldState] = useState<0 | 1>(1);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isSliderActive, setIsSliderActive] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const rotationStart = useRef({ x: 0, y: 0 });
  const animationTimeouts = useRef<NodeJS.Timeout[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [settled, setSettled] = useState(false);

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

  const pivot = pivotIndex ?? defaultPivot(coverDesignation.spreadIndex, spreads.length);

  const frontCreases = useMemo(
    () => creases.filter((c) => c.side === 'front').sort((a, b) => a.between_panel - b.between_panel),
    [creases]
  );

  const creasesByUnfoldOrder = useMemo(() => {
    return [...frontCreases].sort(
      (a, b) => (a.unfold_sequence ?? a.between_panel) - (b.unfold_sequence ?? b.between_panel)
    );
  }, [frontCreases]);

  const [creaseFolds, setCreaseFolds] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {};
    creases.filter((c) => c.side === 'front').forEach((c) => {
      initial[c.between_panel] = 1;
    });
    return initial;
  });

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

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.scrollWidth;
      if (w > 0) {
        setMeasuredWidth(w);
        if (!settled) setSettled(true);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, [settled]);

  const overallFoldProgress = useMemo(() => {
    const values = Object.values(creaseFolds);
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }, [creaseFolds]);

  // ─── Controls ──────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    animationTimeouts.current.forEach(clearTimeout);
    animationTimeouts.current = [];
    setRotation({ x: 0, y: 0 });
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

  // ─── Layout math ──────────────────────────────────────────────

  const totalWidth = measuredWidth || spreads.length * PANEL_WIDTH_FALLBACK;
  const singlePanelWidth = spreads.length > 0 ? totalWidth / spreads.length : PANEL_WIDTH_FALLBACK;
  const pivotCenterFlat = (pivot + 0.5) * singlePanelWidth;
  const pivotCenterFolded = singlePanelWidth / 2;
  const centerX = pivotCenterFolded + (pivotCenterFlat - pivotCenterFolded) * (1 - overallFoldProgress);
  const centerY = PANEL_HEIGHT / 2;
  const staticFlipY = coverDesignation.side === 'back' ? 180 : 0;
  const foldTransition = isSliderActive
    ? 'none'
    : `transform ${FOLD_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`;

  // ─── Panel face rendering (shared by both chains) ─────────────

  const renderPanelFaces = (spread: Spread) => {
    const hasFront = spread.frontPanel && spread.frontPanel.thumbnail_url;
    const hasBack = spread.backPanel && spread.backPanel.thumbnail_url;

    return (
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
    );
  };

  // Z-stacking: cover chain pushes toward viewer, other chain behind.
  const coverOnRight = coverDesignation.spreadIndex > pivot;
  const rightZSign = coverOnRight ? 1 : -1;
  const leftZSign = coverOnRight ? -1 : 1;

  // ─── Right chain: pivot+1 → last, hinges on LEFT edge ────────

  const renderRightChain = (idx: number): React.ReactNode => {
    if (idx >= spreads.length) return null;
    const spread = spreads[idx];
    if (!spread) return null;

    const creaseIdx = idx - 1;
    const crease = frontCreases.find((c) => c.between_panel === creaseIdx);
    const amount = creaseFolds[creaseIdx] ?? 0;
    const angle = crease
      ? (crease.fold_direction === 'forward' ? -1 : 1) * amount * 180
      : 0;
    const dist = Math.abs(idx - pivot);
    const zShift = rightZSign * (PAPER_THICKNESS + dist * 0.5) * amount;

    return (
      <div
        key={`right-hinge-${creaseIdx}`}
        style={{
          transformStyle: 'preserve-3d',
          transformOrigin: 'left center',
          transition: foldTransition,
          transform: `rotateY(${angle}deg)`,
        }}
      >
        <div style={{ transformStyle: 'preserve-3d', transform: `translateZ(${zShift}px)`, transition: foldTransition }}>
          <div className="flex" style={{ transformStyle: 'preserve-3d' }}>
            {renderPanelFaces(spread)}
            {idx < spreads.length - 1 && renderRightChain(idx + 1)}
          </div>
        </div>
      </div>
    );
  };

  // ─── Left chain: pivot-1 → 0, hinges on RIGHT edge ───────────

  const renderLeftChain = (idx: number): React.ReactNode => {
    if (idx < 0) return null;
    const spread = spreads[idx];
    if (!spread) return null;

    const creaseIdx = idx;
    const crease = frontCreases.find((c) => c.between_panel === creaseIdx);
    const amount = creaseFolds[creaseIdx] ?? 0;
    const angle = crease
      ? (crease.fold_direction === 'forward' ? 1 : -1) * amount * 180
      : 0;
    const dist = Math.abs(idx - pivot);
    const zShift = leftZSign * (PAPER_THICKNESS + dist * 0.5) * amount;

    return (
      <div
        key={`left-hinge-${creaseIdx}`}
        style={{
          transformStyle: 'preserve-3d',
          transformOrigin: 'right center',
          transition: foldTransition,
          transform: `rotateY(${angle}deg)`,
        }}
      >
        <div style={{ transformStyle: 'preserve-3d', transform: `translateZ(${zShift}px)`, transition: foldTransition }}>
          <div className="flex" style={{ transformStyle: 'preserve-3d' }}>
            {idx > 0 && renderLeftChain(idx - 1)}
            {renderPanelFaces(spread)}
          </div>
        </div>
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
          <div
            style={{
              position: 'absolute',
              left: `calc(50% - ${centerX}px)`,
              top: `calc(50% - ${centerY}px)`,
              transformStyle: 'preserve-3d',
              transformOrigin: `${centerX}px ${centerY}px`,
              transition: !settled ? 'none' : (
                isDragging ? 'none' : 'transform 300ms ease-out'
              ),
              transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y + staticFlipY}deg)`,
            }}
          >
            <div ref={cardRef} className="inline-flex" style={{ transformStyle: 'preserve-3d' }}>
              {/* Left chain: panels left of pivot */}
              {pivot > 0 && renderLeftChain(pivot - 1)}
              {/* Pivot panel: stationary spine */}
              {spreads[pivot] && renderPanelFaces(spreads[pivot])}
              {/* Right chain: panels right of pivot */}
              {pivot < spreads.length - 1 && renderRightChain(pivot + 1)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
