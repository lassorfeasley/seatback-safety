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
  minimal?: boolean;
  hintOnLoad?: boolean;
}

interface Spread {
  index: number;
  frontPanel: Panel | undefined;
  backPanel: Panel | undefined;
}

const FOLD_DURATION = 600;
const FOLD_STAGGER = 100;
const PAPER_THICKNESS = 0.6;
const STACK_GAP = 6;
const MIN_COS = 0.25;
const PANEL_HEIGHT = 250;
const PANEL_WIDTH_FALLBACK = 180;

function defaultPivot(coverIdx: number, panelCount: number): number {
  if (panelCount <= 1) return 0;
  if (coverIdx <= 0) return 1;
  if (coverIdx >= panelCount - 1) return panelCount - 2;
  return coverIdx - 1;
}

/**
 * Simulate folding a 1D strip to determine the exact layer (Z-stack) order.
 *
 * The simulation maintains an ordered list of "columns" where each column is a
 * bottom-to-top stack of spread indices.  Folds are applied in fold-order
 * (reverse of unfold_sequence).  Each fold locates the two spreads adjacent to
 * the crease, reflects the far side onto the near side, and merges the stacks.
 *
 * Returns a map: spreadIndex → layerIndex  (0 = bottom of stack, higher =
 * closer to the viewer).
 */
export function computeLayerOrder(
  spreadCount: number,
  frontCreases: Crease[],
): Record<number, number> {
  if (spreadCount <= 1) return { 0: 0 };

  let columns: number[][] = [];
  for (let i = 0; i < spreadCount; i++) columns.push([i]);

  const foldOrder = [...frontCreases].sort(
    (a, b) =>
      (b.unfold_sequence ?? b.between_panel) -
      (a.unfold_sequence ?? a.between_panel),
  );

  for (const crease of foldOrder) {
    const cp = crease.between_panel;

    let colC = -1;
    let colC1 = -1;
    for (let i = 0; i < columns.length; i++) {
      if (columns[i].includes(cp)) colC = i;
      if (columns[i].includes(cp + 1)) colC1 = i;
    }
    if (colC === -1 || colC1 === -1 || colC === colC1) continue;

    const isNormal = colC < colC1;
    const splitIdx = Math.min(colC, colC1);

    const stayPart = columns.slice(0, splitIdx + 1);
    const movePart = columns.slice(splitIdx + 1);
    const refLen = movePart.length;

    const reflected: number[][] = [];
    for (let i = movePart.length - 1; i >= 0; i--) {
      reflected.push([...movePart[i]].reverse());
    }

    const reflectedOnTop = isNormal
      ? crease.fold_direction === 'forward'
      : crease.fold_direction !== 'forward';

    const leftmost = Math.min(0, splitIdx - refLen + 1);
    const merged: number[][] = [];
    for (let pos = leftmost; pos <= splitIdx; pos++) {
      const si = pos;
      const ri = pos - (splitIdx - refLen + 1);
      const s = si >= 0 && si < stayPart.length ? stayPart[si] : [];
      const r = ri >= 0 && ri < refLen ? reflected[ri] : [];
      merged.push(reflectedOnTop ? [...s, ...r] : [...r, ...s]);
    }

    columns = merged;
  }

  const result: Record<number, number> = {};
  let layer = 0;
  for (const col of columns) {
    for (const spreadIdx of col) {
      result[spreadIdx] = layer++;
    }
  }
  return result;
}

export const CardVisualizer3D: React.FC<CardVisualizer3DProps> = ({
  panels, creases, cover, pivotIndex, minimal, hintOnLoad,
}) => {
  const [targetFoldState, setTargetFoldState] = useState<0 | 1>(1);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isSliderActive, setIsSliderActive] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const rotationStart = useRef({ x: 0, y: 0 });
  const animationTimeouts = useRef<NodeJS.Timeout[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [settled, setSettled] = useState(false);
  const cursorTilt = useRef({ x: 0, y: 0 });
  const cursorTiltTarget = useRef({ x: 0, y: 0 });
  const cursorTiltRaf = useRef(0);

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
      const w = el.offsetWidth;
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

  const dragDistance = useRef(0);
  const lastTouchEnd = useRef(0);

  const startDrag = useCallback(
    (x: number, y: number) => {
      setIsDragging(true);
      dragStart.current = { x, y };
      rotationStart.current = { ...rotation };
      dragDistance.current = 0;
    },
    [rotation]
  );

  const moveDrag = useCallback(
    (x: number, y: number) => {
      if (!isDragging) return;
      dragDistance.current += Math.abs(x - dragStart.current.x) + Math.abs(y - dragStart.current.y);
      setRotation({
        x: rotationStart.current.x - (y - dragStart.current.y) * 0.5,
        y: rotationStart.current.y + (x - dragStart.current.x) * 0.5,
      });
    },
    [isDragging]
  );

  const endDrag = useCallback(() => setIsDragging(false), []);

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

  const handleCanvasClick = useCallback(() => {
    if (!minimal || dragDistance.current > 5) return;
    if (targetFoldState === 1) {
      handleUnfold();
    } else {
      handleFold();
    }
  }, [minimal, targetFoldState, handleUnfold, handleFold]);

  // Cursor-follow tilt for minimal mode
  useEffect(() => {
    if (!minimal) return;
    const TILT_MAX = 24;
    const LERP = 0.08;

    const onMove = (e: MouseEvent) => {
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      cursorTiltTarget.current = { x: ny * TILT_MAX, y: nx * TILT_MAX };
    };

    const onLeave = () => {
      cursorTiltTarget.current = { x: 0, y: 0 };
    };

    const tick = () => {
      const c = cursorTilt.current;
      const t = cursorTiltTarget.current;
      c.x += (t.x - c.x) * LERP;
      c.y += (t.y - c.y) * LERP;

      const el = canvasRef.current?.querySelector<HTMLElement>('[data-card-root]');
      if (el) {
        const base = el.getAttribute('data-base-transform') || '';
        el.style.transform = `${base} rotateX(${c.x}deg) rotateY(${c.y}deg)`;
      }
      cursorTiltRaf.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    cursorTiltRaf.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(cursorTiltRaf.current);
    };
  }, [minimal]);

  useEffect(() => {
    if (isDragging) {
      cursorTiltTarget.current = { x: 0, y: 0 };
    }
  }, [isDragging]);

  // Hint animation: quickly unfold then refold on load
  useEffect(() => {
    if (!hintOnLoad || creasesByUnfoldOrder.length === 0) return;

    const n = creasesByUnfoldOrder.length;
    const unfoldTime = n * (FOLD_DURATION - FOLD_STAGGER);

    creasesByUnfoldOrder.forEach((crease, i) => {
      const delay = 600 + i * (FOLD_DURATION - FOLD_STAGGER);
      const t = setTimeout(() => {
        setCreaseFolds((prev) => ({ ...prev, [crease.between_panel]: 0 }));
      }, delay);
      animationTimeouts.current.push(t);
    });

    const refoldStart = 600 + unfoldTime + 800;
    const foldOrder = [...creasesByUnfoldOrder].reverse();
    foldOrder.forEach((crease, i) => {
      const delay = refoldStart + i * (FOLD_DURATION - FOLD_STAGGER);
      const t = setTimeout(() => {
        setCreaseFolds((prev) => ({ ...prev, [crease.between_panel]: 1 }));
      }, delay);
      animationTimeouts.current.push(t);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Layout math ──────────────────────────────────────────────

  const fallbackWidth = measuredWidth || PANEL_WIDTH_FALLBACK;

  const spreadWidths = useMemo(() => {
    return spreads.map((spread) => {
      const front = spread.frontPanel;
      const back = spread.backPanel;
      const w = front?.width_px ?? back?.width_px;
      const h = front?.height_px ?? back?.height_px;
      if (w && h) return PANEL_HEIGHT * (w / h);
      return fallbackWidth;
    });
  }, [spreads, fallbackWidth]);

  const totalWidth = spreadWidths.reduce((sum, w) => sum + w, 0);
  const widthBeforePivot = spreadWidths.slice(0, pivot).reduce((sum, w) => sum + w, 0);
  const pivotWidth = spreadWidths[pivot] ?? fallbackWidth;
  const flatCenterFromPivot = totalWidth / 2 - widthBeforePivot;
  const foldedCenterFromPivot = pivotWidth / 2;
  const centerX = foldedCenterFromPivot + (flatCenterFromPivot - foldedCenterFromPivot) * (1 - overallFoldProgress);
  const centerY = PANEL_HEIGHT / 2;
  const staticFlipY = coverDesignation.side === 'front' ? 180 : 0;
  const foldTransition = isSliderActive
    ? 'none'
    : `transform ${FOLD_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`;

  // ─── Layer-order simulation ──────────────────────────────────
  // Simulate the physical fold sequence to determine the exact
  // stacking position of each spread in the folded card.

  const layerOrder = useMemo(
    () => computeLayerOrder(spreads.length, frontCreases),
    [spreads.length, frontCreases],
  );

  // Z-sign: maps layer differences to the correct local-Z direction so that
  // the cover spread always ends up closest to the viewer.
  //   flipSign:  with a 180° Y flip, "deeper into the stack" = +Z local
  //              (becomes −Z world = farther from viewer).  Without flip, −Z.
  //   layerSign: if the cover sits at a lower layer than the pivot, higher
  //              layers are deeper (+1).  If cover is higher, the reverse.
  const coverLayer = layerOrder[coverDesignation.spreadIndex] ?? 0;
  const pivotLayer = layerOrder[pivot] ?? 0;
  const zSign = (staticFlipY === 180 ? 1 : -1) * (coverLayer <= pivotLayer ? 1 : -1);

  // ─── Nested panel chain builders ────────────────────────────
  // Each panel is nested inside the previous one so CSS preserve-3d
  // cascading keeps panels connected at their crease edges.
  //
  // Z-stacking uses the simulation-derived layer order.  Each
  // crease's Z contribution is the layer difference between the two
  // adjacent spreads, compensated for nested rotations via cos().

  const buildRightChain = (index: number, parentCumAngle: number): React.ReactNode => {
    if (index >= spreads.length) return null;
    const creaseIdx = index - 1;
    const crease = frontCreases.find((c) => c.between_panel === creaseIdx);
    const amount = creaseFolds[creaseIdx] ?? 0;
    const sign = crease?.fold_direction === 'backward' ? -1 : 1;
    const angle = sign * amount * 180;

    const layerDiff = (layerOrder[index] ?? 0) - (layerOrder[index - 1] ?? 0);
    const cosP = Math.cos((parentCumAngle * Math.PI) / 180);
    const zAmount = amount > 0 ? Math.max(amount, 0.35) : 0;
    const desiredDelta = layerDiff * STACK_GAP * zSign * zAmount;
    const safeCos = Math.abs(cosP) < MIN_COS ? MIN_COS * Math.sign(cosP || 1) : cosP;
    const localZ = desiredDelta !== 0 ? desiredDelta / safeCos : 0;

    const parentW = spreadWidths[index - 1] ?? fallbackWidth;
    const selfW = spreadWidths[index] ?? fallbackWidth;

    return (
      <div
        key={`r-${index}`}
        style={{
          position: 'absolute',
          left: parentW,
          top: 0,
          width: selfW,
          height: PANEL_HEIGHT,
          transformStyle: 'preserve-3d',
          transformOrigin: 'left center',
          transform: `translateZ(${localZ}px) rotateY(${angle}deg)`,
          transition: foldTransition,
        }}
      >
        <div className="relative" style={{ transformStyle: 'preserve-3d' }}>
          {renderPanelFaces(spreads[index])}
        </div>
        {buildRightChain(index + 1, parentCumAngle + angle)}
      </div>
    );
  };

  const buildLeftChain = (index: number, parentCumAngle: number): React.ReactNode => {
    if (index < 0) return null;
    const creaseIdx = index;
    const crease = frontCreases.find((c) => c.between_panel === creaseIdx);
    const amount = creaseFolds[creaseIdx] ?? 0;
    const sign = crease?.fold_direction === 'backward' ? 1 : -1;
    const angle = sign * amount * 180;

    const layerDiff = (layerOrder[index] ?? 0) - (layerOrder[index + 1] ?? 0);
    const cosP = Math.cos((parentCumAngle * Math.PI) / 180);
    const zAmount = amount > 0 ? Math.max(amount, 0.35) : 0;
    const desiredDelta = layerDiff * STACK_GAP * zSign * zAmount;
    const safeCos = Math.abs(cosP) < MIN_COS ? MIN_COS * Math.sign(cosP || 1) : cosP;
    const localZ = desiredDelta !== 0 ? desiredDelta / safeCos : 0;

    const selfW = spreadWidths[index] ?? fallbackWidth;

    return (
      <div
        key={`l-${index}`}
        style={{
          position: 'absolute',
          left: -selfW,
          top: 0,
          width: selfW,
          height: PANEL_HEIGHT,
          transformStyle: 'preserve-3d',
          transformOrigin: 'right center',
          transform: `translateZ(${localZ}px) rotateY(${angle}deg)`,
          transition: foldTransition,
        }}
      >
        <div className="relative" style={{
          transformStyle: 'preserve-3d',
          marginLeft: 'auto',
          width: 'fit-content',
        }}>
          {renderPanelFaces(spreads[index])}
        </div>
        {buildLeftChain(index - 1, parentCumAngle + angle)}
      </div>
    );
  };

  // ─── Panel face rendering ─────────────────────────────────────

  const renderPanelFaces = (spread: Spread) => {
    const hasFront = spread.frontPanel && spread.frontPanel.thumbnail_url;
    const hasBack = spread.backPanel && spread.backPanel.thumbnail_url;
    const sw = spreadWidths[spread.index] ?? fallbackWidth;

    return (
      <>
        {hasFront ? (
          <img
            src={spread.frontPanel!.thumbnail_url}
            alt={`Front ${spread.index + 1}`}
            className="object-contain pointer-events-none"
            style={{
              width: sw,
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
              width: sw,
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
            className="absolute inset-0 object-contain pointer-events-none"
            style={{
              width: sw,
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
              width: sw,
              backfaceVisibility: 'hidden',
              transform: `translateZ(${-PAPER_THICKNESS / 2}px) rotateY(180deg)`,
            }}
          >
            B-S{spread.index + 1}
          </div>
        )}
      </>
    );
  };

  if (spreads.length === 0) return null;

  const canvasEl = (
        <div
          className={cn(
            minimal
              ? 'relative w-full h-full select-none'
              : 'rounded-b-lg bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 relative min-h-[350px] h-full select-none overflow-hidden',
            isDragging ? 'cursor-grabbing' : (minimal ? 'cursor-crosshair' : 'cursor-grab')
          )}
          style={{ perspective: '1200px', perspectiveOrigin: '50% 50%' }}
          ref={canvasRef}
          onMouseDown={(e) => { if (Date.now() - lastTouchEnd.current < 500) return; e.preventDefault(); startDrag(e.clientX, e.clientY); }}
          onMouseMove={(e) => { if (Date.now() - lastTouchEnd.current < 500) return; moveDrag(e.clientX, e.clientY); }}
          onMouseUp={() => { if (Date.now() - lastTouchEnd.current < 500) return; handleCanvasClick(); endDrag(); }}
          onMouseLeave={() => { if (isDragging) endDrag(); }}
          onTouchStart={(e) => { if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY); }}
          onTouchEnd={() => { lastTouchEnd.current = Date.now(); handleCanvasClick(); endDrag(); }}
        >
          {/* Outer container: user rotation + staticFlipY */}
          <div
            data-card-root=""
            data-base-transform={[
              minimal ? 'scale(1.5)' : '',
              `rotateX(${rotation.x}deg)`,
              `rotateY(${rotation.y + staticFlipY}deg)`,
            ].filter(Boolean).join(' ')}
            style={{
              position: 'absolute',
              left: `calc(50% - ${centerX}px)`,
              top: `calc(50% - ${centerY}px)`,
              transformStyle: 'preserve-3d',
              transformOrigin: `${centerX}px ${centerY}px`,
              transition: !settled ? 'none' : (
                isDragging || isSliderActive ? 'none' : `transform 300ms ease-out, left ${FOLD_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`
              ),
              transform: [
                minimal ? 'scale(1.5)' : '',
                `rotateX(${rotation.x}deg)`,
                `rotateY(${rotation.y + staticFlipY}deg)`,
              ].filter(Boolean).join(' '),
            }}
          >
            {/* Nested panel structure: pivot at center,
                left/right chains nested outward so CSS preserve-3d
                cascading keeps panels connected at crease edges. */}
            <div
              ref={cardRef}
              style={{
                display: 'inline-block',
                position: 'relative',
                width: pivotWidth,
                height: PANEL_HEIGHT,
                transformStyle: 'preserve-3d',
              }}
            >
              <div className="relative" style={{ transformStyle: 'preserve-3d' }}>
                {renderPanelFaces(spreads[pivot])}
              </div>
              {buildRightChain(pivot + 1, 0)}
              {buildLeftChain(pivot - 1, 0)}
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
        {canvasEl}
      </CardContent>
    </Card>
  );
};
