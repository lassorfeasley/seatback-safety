import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCards, fetchCardDetail } from '@/lib/safetyCardService';
import { computeLayerOrder } from '@/components/FoldEditor';
import type { Panel, Crease, CoverDesignation } from '@/components/FoldEditor/types';

const CARD_HEIGHT = 310;
const CARD_WIDTH_FALLBACK = 210;
const CARD_GAP = 350; // spacing between card pivot points
const SCROLL_SPEED = 40; // px per second
const UNFOLD_RADIUS = 350; // distance from center where unfolding starts
const SCALE_MIN = 0.7; // scale at edges
const SCALE_MAX = 1.15; // scale at center
const PAPER_THICKNESS = 0.5;
const STACK_GAP = 4;
const MIN_COS = 0.25;
const BG_COLOR = '#ebeaef';
const MAX_CARDS = 12;

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

export const CardCarousel: React.FC = () => {
  const [cards, setCards] = useState<CarouselCardData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const pausedRef = useRef(false);
  const [, forceRender] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const summaries = await fetchCards();
      const eligible = summaries.filter((c) => (c.panel_count ?? 0) >= 2).slice(0, MAX_CARDS);
      const details = await Promise.all(eligible.map((c) => fetchCardDetail(c.id)));
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

  const totalStripWidth = useMemo(() => {
    return cardWidths.reduce((sum, w) => sum + w + CARD_GAP, 0);
  }, [cardWidths]);

  // Animation loop
  useEffect(() => {
    if (!loaded || cards.length === 0) return;

    const tick = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      if (!pausedRef.current && totalStripWidth > 0) {
        offsetRef.current += SCROLL_SPEED * dt;
        if (offsetRef.current >= totalStripWidth) {
          offsetRef.current -= totalStripWidth;
        }
      }

      forceRender((n) => n + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loaded, cards.length, totalStripWidth]);

  if (!loaded || cards.length === 0) return null;

  const containerWidth = containerRef.current?.offsetWidth ?? window.innerWidth;
  const centerX = containerWidth / 2;
  const scaleRadius = containerWidth / 2 - 80; // grow/shrink across nearly the full width

  // Compute positions for each card (doubled for seamless wrap)
  const items: { cardIdx: number; x: number }[] = [];
  for (let copy = 0; copy < 2; copy++) {
    let x = -offsetRef.current + copy * totalStripWidth;
    for (let i = 0; i < cards.length; i++) {
      items.push({ cardIdx: i, x });
      x += cardWidths[i] + CARD_GAP;
    }
  }

  const visible = items.filter(
    (item) => item.x + cardWidths[item.cardIdx] > -100 && item.x < containerWidth + 100
  );

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden relative"
      style={{ height: CARD_HEIGHT * 2 + 60, backgroundColor: BG_COLOR }}
    >
      <div ref={stripRef} className="absolute inset-0" style={{ willChange: 'contents' }}>
        {visible.map((item, idx) => {
          const cardCenter = item.x + cardWidths[item.cardIdx] / 2;
          const dist = Math.abs(cardCenter - centerX);
          const linearProgress = clamp(dist / UNFOLD_RADIUS, 0, 1);
          // Ease-in-out for a more natural fold/unfold feel
          const foldProgress = linearProgress < 0.5
            ? 2 * linearProgress * linearProgress
            : 1 - Math.pow(-2 * linearProgress + 2, 2) / 2;

          const scale = SCALE_MAX - (SCALE_MAX - SCALE_MIN) * clamp(dist / scaleRadius, 0, 1);

          return (
            <CarouselCard
              key={`${item.cardIdx}-${idx}`}
              card={cards[item.cardIdx]}
              x={item.x}
              foldProgress={foldProgress}
              scale={scale}
              height={CARD_HEIGHT}
            />
          );
        })}
      </div>
    </div>
  );
};

/* ── Individual carousel card ── */

interface CarouselCardProps {
  card: CarouselCardData;
  x: number;
  foldProgress: number; // 0 = flat, 1 = folded
  scale: number;
  height: number;
}

interface Spread {
  index: number;
  frontPanel: Panel | undefined;
  backPanel: Panel | undefined;
}

const CarouselCard: React.FC<CarouselCardProps> = ({ card, x, foldProgress, scale, height }) => {
  const navigate = useNavigate();
  const tiltX = (1 - foldProgress) * 30; // tilt up as card unfolds

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
