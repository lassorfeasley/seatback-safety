import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCards, fetchCardDetail } from '@/lib/safetyCardService';
import { computeLayerOrder } from '@/components/FoldEditor';
import type { Panel, Crease, CoverDesignation } from '@/components/FoldEditor/types';

const CARD_HEIGHT = 220;
const CARD_WIDTH_FALLBACK = 210;
const SCALE_MAX = 1.0;
const PAPER_THICKNESS = 0.5;
const STACK_GAP = 4;
const MIN_COS = 0.25;
const BG_COLOR = '#ebeaef';
const MAX_CARDS = 12;

const SLIDE_IN_DURATION = 800;
const PRESENT_DURATION = 5400;
const SLIDE_OUT_DURATION = 800;

type Phase = 'sliding-in' | 'presenting' | 'sliding-out';

const PHASE_DURATIONS: Record<Phase, number> = {
  'sliding-in': SLIDE_IN_DURATION,
  'presenting': PRESENT_DURATION,
  'sliding-out': SLIDE_OUT_DURATION,
};

const PHASE_ORDER: Phase[] = ['sliding-in', 'presenting', 'sliding-out'];

interface AnimState {
  cardIdx: number;
  phase: Phase;
  phaseElapsed: number;
}

interface CarouselCardData {
  id: string;
  title: string | null;
  panels: Panel[];
  creases: Crease[];
  cover: CoverDesignation;
  pivotIndex: number | null;
}

function defaultPivot(coverIdx: number, panelCount: number): number {
  if (panelCount <= 1) return 0;
  if (coverIdx <= 0) return 1;
  if (coverIdx >= panelCount - 1) return panelCount - 2;
  return coverIdx - 1;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface CardRenderInfo {
  key: string;
  cardIdx: number;
  x: number;
  foldProgress: number;
  tilt: number;
  scale: number;
  zIndex: number;
}

const QUEUE_GAP = 280;
const QUEUE_SCALE = 0.7;

const UNFOLD_MS = 800;
const TILT_UP_MS = 400;
const HOLD_MS = 3000;
const TILT_DOWN_MS = 400;
const REFOLD_MS = 800;

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

function easeInQuart(t: number): number {
  return t * t * t * t;
}

function presentingProps(elapsed: number): { foldProgress: number; tilt: number } {
  let remaining = elapsed;

  if (remaining < UNFOLD_MS) {
    const t = easeOutQuart(remaining / UNFOLD_MS);
    return { foldProgress: 1 - t, tilt: 0 };
  }
  remaining -= UNFOLD_MS;

  if (remaining < TILT_UP_MS) {
    const t = easeOutQuart(remaining / TILT_UP_MS);
    return { foldProgress: 0, tilt: t };
  }
  remaining -= TILT_UP_MS;

  if (remaining < HOLD_MS) {
    return { foldProgress: 0, tilt: 1 };
  }
  remaining -= HOLD_MS;

  if (remaining < TILT_DOWN_MS) {
    const t = easeInQuart(remaining / TILT_DOWN_MS);
    return { foldProgress: 0, tilt: 1 - t };
  }
  remaining -= TILT_DOWN_MS;

  const t = easeInQuart(clamp(remaining / REFOLD_MS, 0, 1));
  return { foldProgress: t, tilt: 0 };
}

function deriveCardProps(
  phase: Phase,
  rawProgress: number,
  containerWidth: number,
  cardWidth: number,
): { x: number; foldProgress: number; tilt: number; scale: number } {
  const t = easeInOutCubic(clamp(rawProgress, 0, 1));
  const centerTarget = (containerWidth - cardWidth) / 2;
  const rightSlot1 = centerTarget + QUEUE_GAP;
  const leftSlot1 = centerTarget - QUEUE_GAP;

  switch (phase) {
    case 'sliding-in':
      return {
        x: lerp(rightSlot1, centerTarget, t),
        foldProgress: 1,
        tilt: 0,
        scale: lerp(QUEUE_SCALE, SCALE_MAX, t),
      };
    case 'presenting': {
      const elapsed = clamp(rawProgress, 0, 1) * PRESENT_DURATION;
      const { foldProgress, tilt } = presentingProps(elapsed);
      return {
        x: centerTarget,
        foldProgress,
        tilt,
        scale: SCALE_MAX,
      };
    }
    case 'sliding-out':
      return {
        x: lerp(centerTarget, leftSlot1, t),
        foldProgress: 1,
        tilt: 0,
        scale: lerp(SCALE_MAX, QUEUE_SCALE, t),
      };
  }
}

function queueCardX(
  slotOffset: number,
  containerWidth: number,
  cardWidth: number,
): number {
  const centerTarget = (containerWidth - cardWidth) / 2;
  return centerTarget + slotOffset * QUEUE_GAP;
}

export const CardCarousel: React.FC = () => {
  const [cards, setCards] = useState<CarouselCardData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const animRef = useRef<AnimState>({ cardIdx: 0, phase: 'sliding-in', phaseElapsed: 0 });
  const [, forceRender] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const summaries = await fetchCards();
      const eligible = summaries.filter((c) => (c.panel_count ?? 0) >= 2);
      for (let i = eligible.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
      }
      const selected = eligible.slice(0, MAX_CARDS);
      const details = await Promise.all(selected.map((c) => fetchCardDetail(c.id)));
      if (cancelled) return;
      const valid: CarouselCardData[] = [];
      for (const d of details) {
        if (!d || d.panels.length < 2 || d.creases.length === 0) continue;
        valid.push({
          id: d.id,
          title: d.title,
          panels: d.panels,
          creases: d.creases,
          cover: d.cover,
          pivotIndex: d.pivotIndex,
        });
      }
      setCards(valid);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const cardWidths = useMemo(() => {
    return cards.map((card) => {
      const frontPanels = card.panels.filter((p) => p.side === 'front');
      if (frontPanels.length === 0) return CARD_WIDTH_FALLBACK;
      const first = frontPanels[0];
      if (first.width_px && first.height_px) {
        return CARD_HEIGHT * (first.width_px / first.height_px);
      }
      return CARD_WIDTH_FALLBACK;
    });
  }, [cards]);

  useEffect(() => {
    if (!loaded || cards.length === 0) return;

    const tick = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;

      const anim = animRef.current;
      anim.phaseElapsed += dt;

      const duration = PHASE_DURATIONS[anim.phase];

      let phaseChanged = false;
      if (anim.phaseElapsed >= duration) {
        phaseChanged = true;
        const overflow = anim.phaseElapsed - duration;
        const idx = PHASE_ORDER.indexOf(anim.phase);
        if (idx < PHASE_ORDER.length - 1) {
          anim.phase = PHASE_ORDER[idx + 1];
        } else {
          anim.cardIdx = (anim.cardIdx + 1) % cards.length;
          anim.phase = 'presenting';
        }
        anim.phaseElapsed = overflow;
      }

      const elapsed = anim.phaseElapsed;
      const isHolding = anim.phase === 'presenting'
        && elapsed > UNFOLD_MS + TILT_UP_MS
        && elapsed < UNFOLD_MS + TILT_UP_MS + HOLD_MS;

      if (!isHolding || phaseChanged) {
        forceRender((n) => n + 1);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loaded, cards.length]);

  if (!loaded || cards.length === 0) return null;

  const containerWidth = containerRef.current?.offsetWidth ?? window.innerWidth;
  const anim = animRef.current;

  const halfWidth = containerWidth / 2;
  const queueSlots = Math.max(1, Math.ceil(halfWidth / QUEUE_GAP));

  const duration = PHASE_DURATIONS[anim.phase];
  const rawProgress = clamp(anim.phaseElapsed / duration, 0, 1);
  const easedProgress = easeInOutCubic(rawProgress);

  const visibleCards: CardRenderInfo[] = [];

  const currentWidth = cardWidths[anim.cardIdx] ?? CARD_WIDTH_FALLBACK;
  const currentProps = deriveCardProps(anim.phase, rawProgress, containerWidth, currentWidth);
  visibleCards.push({
    key: 'active',
    cardIdx: anim.cardIdx,
    zIndex: 10,
    ...currentProps,
  });

  const wrap = (idx: number) => ((idx % cards.length) + cards.length) % cards.length;

  for (let slot = 1; slot <= queueSlots; slot++) {
    const rightIdx = wrap(anim.cardIdx + slot);
    const rightWidth = cardWidths[rightIdx] ?? CARD_WIDTH_FALLBACK;
    const centerTarget = (containerWidth - rightWidth) / 2;

    let rightX: number;
    let rightFold: number;
    let rightScale: number;
    let rightZ: number;

    if (anim.phase === 'sliding-in') {
      rightX = queueCardX(slot + 1 - easedProgress, containerWidth, rightWidth);
      rightFold = 1;
      rightScale = QUEUE_SCALE;
      rightZ = 1;
    } else if (anim.phase === 'sliding-out' && slot === 1) {
      rightX = lerp(queueCardX(1, containerWidth, rightWidth), centerTarget, easedProgress);
      rightFold = 1;
      rightScale = lerp(QUEUE_SCALE, SCALE_MAX, easedProgress);
      rightZ = 10;
    } else if (anim.phase === 'sliding-out') {
      rightX = queueCardX(slot - easedProgress, containerWidth, rightWidth);
      rightFold = 1;
      rightScale = QUEUE_SCALE;
      rightZ = 1;
    } else {
      rightX = queueCardX(slot, containerWidth, rightWidth);
      rightFold = 1;
      rightScale = QUEUE_SCALE;
      rightZ = 1;
    }

    visibleCards.push({
      key: `queue-right-${slot}`,
      cardIdx: rightIdx,
      x: rightX,
      foldProgress: rightFold,
      tilt: 0,
      scale: rightScale,
      zIndex: rightZ,
    });

    const leftIdx = wrap(anim.cardIdx - slot);
    const leftWidth = cardWidths[leftIdx] ?? CARD_WIDTH_FALLBACK;

    let leftSlot: number;
    if (anim.phase === 'sliding-out') {
      leftSlot = -slot - easedProgress;
    } else {
      leftSlot = -slot;
    }

    visibleCards.push({
      key: `queue-left-${slot}`,
      cardIdx: leftIdx,
      x: queueCardX(leftSlot, containerWidth, leftWidth),
      foldProgress: 1,
      tilt: 0,
      scale: QUEUE_SCALE,
      zIndex: 1,
    });
  }

  if (anim.phase === 'sliding-out') {
    const farRightIdx = wrap(anim.cardIdx + queueSlots + 1);
    const farRightWidth = cardWidths[farRightIdx] ?? CARD_WIDTH_FALLBACK;
    const farRightSlot = queueSlots + 1 - easedProgress;

    visibleCards.push({
      key: 'queue-right-incoming',
      cardIdx: farRightIdx,
      x: queueCardX(farRightSlot, containerWidth, farRightWidth),
      foldProgress: 1,
      tilt: 0,
      scale: QUEUE_SCALE,
      zIndex: 1,
    });
  }

  return (
    <section className="max-w-6xl mx-auto px-6 pt-5 pb-12">
      <div
        ref={containerRef}
        className="w-full overflow-hidden relative"
        style={{ height: 400, backgroundColor: BG_COLOR }}
      >
        <div className="absolute inset-0">
          {visibleCards.map((item) => (
            <CarouselCard
              key={item.key}
              card={cards[item.cardIdx]}
              x={item.x}
              foldProgress={item.foldProgress}
              tilt={item.tilt}
              scale={item.scale}
              height={CARD_HEIGHT}
              zIndex={item.zIndex}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── Individual carousel card ── */

interface CarouselCardProps {
  card: CarouselCardData;
  x: number;
  foldProgress: number; // 0 = flat, 1 = folded
  tilt: number; // 0 = flat, 1 = tilted up
  scale: number;
  height: number;
  zIndex: number;
}

interface Spread {
  index: number;
  frontPanel: Panel | undefined;
  backPanel: Panel | undefined;
}

const CarouselCard: React.FC<CarouselCardProps> = ({ card, x, foldProgress, tilt, scale, height, zIndex }) => {
  const navigate = useNavigate();
  const tiltX = tilt * 30;

  const frontPanels = useMemo(
    () => card.panels.filter((p) => p.side === 'front').sort((a, b) => a.panel_index - b.panel_index),
    [card.panels]
  );
  const backPanels = useMemo(
    () => card.panels.filter((p) => p.side === 'back').sort((a, b) => a.panel_index - b.panel_index),
    [card.panels]
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

  const pivot = card.pivotIndex ?? defaultPivot(card.cover.spreadIndex, spreads.length);

  const frontCreases = useMemo(
    () => card.creases.filter((c) => c.side === 'front').sort((a, b) => a.between_panel - b.between_panel),
    [card.creases]
  );

  const creasesByUnfoldOrder = useMemo(() => {
    return [...frontCreases].sort(
      (a, b) => (a.unfold_sequence ?? a.between_panel) - (b.unfold_sequence ?? b.between_panel)
    );
  }, [frontCreases]);

  // Convert single foldProgress (0-1) to per-crease fold values
  // Min fold of 15/180 keeps creases slightly visible even when fully open
  const MIN_FOLD = 15 / 180;
  const creaseFolds = useMemo(() => {
    const n = creasesByUnfoldOrder.length;
    if (n === 0) return {};
    const folds: Record<number, number> = {};
    creasesByUnfoldOrder.forEach((crease, i) => {
      const lo = (n - i - 1) / n;
      const hi = (n - i) / n;
      let raw: number;
      if (foldProgress >= hi) raw = 1;
      else if (foldProgress <= lo) raw = 0;
      else raw = (foldProgress - lo) / (hi - lo);
      folds[crease.between_panel] = MIN_FOLD + raw * (1 - MIN_FOLD);
    });
    return folds;
  }, [foldProgress, creasesByUnfoldOrder]);

  const spreadWidths = useMemo(() => {
    return spreads.map((spread) => {
      const front = spread.frontPanel;
      const back = spread.backPanel;
      const w = front?.width_px ?? back?.width_px;
      const h = front?.height_px ?? back?.height_px;
      if (w && h) return height * (w / h);
      return CARD_WIDTH_FALLBACK;
    });
  }, [spreads, height]);

  const layerOrder = useMemo(
    () => computeLayerOrder(spreads.length, frontCreases),
    [spreads.length, frontCreases]
  );

  const pivotWidth = spreadWidths[pivot] ?? CARD_WIDTH_FALLBACK;
  const staticFlipY = card.cover.side === 'front' ? 180 : 0;

  const coverLayer = layerOrder[card.cover.spreadIndex] ?? 0;
  const pivotLayer = layerOrder[pivot] ?? 0;
  const zSign = (staticFlipY === 180 ? 1 : -1) * (coverLayer <= pivotLayer ? 1 : -1);

  const overallFoldProgress = useMemo(() => {
    const values = Object.values(creaseFolds);
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }, [creaseFolds]);

  const totalWidth = spreadWidths.reduce((sum, w) => sum + w, 0);
  const widthBeforePivot = spreadWidths.slice(0, pivot).reduce((sum, w) => sum + w, 0);
  const flatCenterFromPivot = totalWidth / 2 - widthBeforePivot;
  const foldedCenterFromPivot = pivotWidth / 2;
  const centerXLocal = foldedCenterFromPivot + (flatCenterFromPivot - foldedCenterFromPivot) * (1 - overallFoldProgress);
  const centerYLocal = height / 2;

  const renderPanelFaces = useCallback((spread: Spread) => {
    const sw = spreadWidths[spread.index] ?? CARD_WIDTH_FALLBACK;
    const hasFront = spread.frontPanel?.thumbnail_url;
    const hasBack = spread.backPanel?.thumbnail_url;

    return (
      <>
        {hasFront ? (
          <img
            src={spread.frontPanel!.thumbnail_url}
            alt=""
            className="pointer-events-none"
            style={{
              width: sw, height,
              objectFit: 'contain',
              backfaceVisibility: 'hidden',
              transform: `translateZ(${PAPER_THICKNESS / 2}px)`,
            }}
            draggable={false}
          />
        ) : (
          <div style={{
            width: sw, height,
            backfaceVisibility: 'hidden',
            transform: `translateZ(${PAPER_THICKNESS / 2}px)`,
            background: '#e0dfe5',
          }} />
        )}
        {hasBack ? (
          <img
            src={spread.backPanel!.thumbnail_url}
            alt=""
            className="absolute inset-0 pointer-events-none"
            style={{
              width: sw, height,
              objectFit: 'contain',
              backfaceVisibility: 'hidden',
              transform: `translateZ(${-PAPER_THICKNESS / 2}px) rotateY(180deg)`,
            }}
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0" style={{
            width: sw, height,
            backfaceVisibility: 'hidden',
            transform: `translateZ(${-PAPER_THICKNESS / 2}px) rotateY(180deg)`,
            background: '#e0dfe5',
          }} />
        )}
      </>
    );
  }, [spreadWidths, height]);

  const buildRightChain = useCallback((index: number, parentCumAngle: number): React.ReactNode => {
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

    const parentW = spreadWidths[index - 1] ?? CARD_WIDTH_FALLBACK;
    const selfW = spreadWidths[index] ?? CARD_WIDTH_FALLBACK;

    return (
      <div
        key={`r-${index}`}
        style={{
          position: 'absolute', left: parentW, top: 0,
          width: selfW, height,
          transformStyle: 'preserve-3d',
          transformOrigin: 'left center',
          transform: `translateZ(${localZ}px) rotateY(${angle}deg)`,
        }}
      >
        <div className="relative" style={{ transformStyle: 'preserve-3d' }}>
          {renderPanelFaces(spreads[index])}
        </div>
        {buildRightChain(index + 1, parentCumAngle + angle)}
      </div>
    );
  }, [spreads, frontCreases, creaseFolds, layerOrder, zSign, spreadWidths, height, renderPanelFaces]);

  const buildLeftChain = useCallback((index: number, parentCumAngle: number): React.ReactNode => {
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

    const selfW = spreadWidths[index] ?? CARD_WIDTH_FALLBACK;

    return (
      <div
        key={`l-${index}`}
        style={{
          position: 'absolute', left: -selfW, top: 0,
          width: selfW, height,
          transformStyle: 'preserve-3d',
          transformOrigin: 'right center',
          transform: `translateZ(${localZ}px) rotateY(${angle}deg)`,
        }}
      >
        <div className="relative" style={{ transformStyle: 'preserve-3d', marginLeft: 'auto', width: 'fit-content' }}>
          {renderPanelFaces(spreads[index])}
        </div>
        {buildLeftChain(index - 1, parentCumAngle + angle)}
      </div>
    );
  }, [spreads, frontCreases, creaseFolds, layerOrder, zSign, spreadWidths, height, renderPanelFaces]);

  const [hovered, setHovered] = useState(false);

  if (spreads.length === 0) return null;

  return (
    <div
      className="absolute"
      style={{
        left: x,
        top: '50%',
        transform: `translateY(-50%) scale(${scale})`,
        width: pivotWidth,
        height,
        zIndex,
        willChange: 'transform, left',
      }}
    >
      <div
        className="cursor-pointer"
        style={{
          transform: `scale(${hovered ? 1.15 : 1})`,
          transformOrigin: 'center center',
          transition: 'transform 200ms ease-out',
          width: pivotWidth,
          height,
          perspective: '900px',
          perspectiveOrigin: '50% 50%',
        }}
        onClick={() => navigate(`/cards/${card.id}`)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
      <div
        style={{
          position: 'absolute',
          left: `calc(50% - ${centerXLocal}px)`,
          top: `calc(50% - ${centerYLocal}px)`,
          transformStyle: 'preserve-3d',
          transformOrigin: `${centerXLocal}px ${centerYLocal}px`,
          transform: `rotateX(${tiltX}deg) rotateY(${staticFlipY}deg)`,
        }}
      >
        <div
          style={{
            display: 'inline-block',
            position: 'relative',
            width: pivotWidth,
            height,
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
    </div>
  );
};
