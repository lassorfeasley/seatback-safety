import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft, Info, X, ZoomIn, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchCardDetail, type CardDetailData } from '@/lib/safetyCardService';
import { CardVisualizer3D } from '@/components/FoldEditor/CardVisualizer3D';
import { BookletVisualizer } from '@/components/FoldEditor/BookletVisualizer';
import { InfoSheet, InfoRow } from '@/components/Public/InfoSheet';
import type { Panel } from '@/components/FoldEditor/types';

const PANEL_HEIGHT = 250;
const PANEL_WIDTH_FALLBACK = 180;
const MINIMAL_INTERNAL_SCALE = 1.5;
const HORIZONTAL_MARGIN = 120;
const VERTICAL_MARGIN = 120;

function computeUnfoldedCardWidth(panels: Panel[], isBooklet?: boolean): number {
  const frontPanels = panels.filter((p) => p.side === 'front').sort((a, b) => a.panel_index - b.panel_index);
  const backPanels = panels.filter((p) => p.side === 'back').sort((a, b) => a.panel_index - b.panel_index);
  const maxIndex = Math.max(
    ...frontPanels.map((p) => p.panel_index),
    ...backPanels.map((p) => p.panel_index),
    -1
  );

  if (isBooklet) {
    // Widest state is a two-page spread
    let maxPageWidth = PANEL_WIDTH_FALLBACK;
    for (let i = 0; i <= maxIndex; i++) {
      const front = frontPanels.find((p) => p.panel_index === i);
      const back = backPanels.find((p) => p.panel_index === i);
      const w = front?.width_px ?? back?.width_px;
      const h = front?.height_px ?? back?.height_px;
      const pw = w && h ? PANEL_HEIGHT * (w / h) : PANEL_WIDTH_FALLBACK;
      if (pw > maxPageWidth) maxPageWidth = pw;
    }
    return maxPageWidth * 2;
  }

  let total = 0;
  for (let i = 0; i <= maxIndex; i++) {
    const front = frontPanels.find((p) => p.panel_index === i);
    const back = backPanels.find((p) => p.panel_index === i);
    const w = front?.width_px ?? back?.width_px;
    const h = front?.height_px ?? back?.height_px;
    total += w && h ? PANEL_HEIGHT * (w / h) : PANEL_WIDTH_FALLBACK;
  }
  return total;
}

function useCardDetailScale(card: CardDetailData | null) {
  const totalWidth = useMemo(
    () => (card?.panels?.length ? computeUnfoldedCardWidth(card.panels, card.is_booklet) : PANEL_WIDTH_FALLBACK * 3),
    [card?.panels, card?.is_booklet]
  );

  const getScale = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxWidth = vw - HORIZONTAL_MARGIN * 2;
    const maxHeight = vh - VERTICAL_MARGIN * 2;
    const scaleByWidth = maxWidth / (totalWidth * MINIMAL_INTERNAL_SCALE);
    const scaleByHeight = maxHeight / (PANEL_HEIGHT * MINIMAL_INTERNAL_SCALE);
    const scale = Math.min(scaleByWidth, scaleByHeight);
    return Math.max(0.4, Math.min(1.2, scale));
  }, [totalWidth]);

  const [scale, setScale] = useState(getScale);

  useEffect(() => {
    setScale(getScale());
    const onResize = () => setScale(getScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [getScale]);

  return scale;
}

const LB_MAX_ZOOM = 100;

export const PublicCardDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [card, setCard] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxSide, setLightboxSide] = useState<'front' | 'back'>('front');
  const [lightboxPage, setLightboxPage] = useState(0);
  const [lbView, setLbView] = useState({ zoom: 1, panX: 0, panY: 0 });
  const lbViewRef = useRef(lbView);
  lbViewRef.current = lbView;
  const lbContentRef = useRef<HTMLDivElement>(null);
  const lbDrag = useRef({ active: false, startX: 0, startY: 0, panX0: 0, panY0: 0, moved: false });
  const lbTouch = useRef({ active: false, startDist: 0, startZoom: 1, startPanX: 0, startPanY: 0, startMidX: 0, startMidY: 0, lastMidX: 0, lastMidY: 0 });
  const detailScale = useCardDetailScale(card);

  useEffect(() => {
    if (!id) return;
    fetchCardDetail(id)
      .then((data) => {
        if (!data) setError(true);
        setCard(data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!card) return;
    const prev = document.title;
    document.title = card.title
      ? `${card.title} — Seatback Safety`
      : 'Seatback Safety Card';
    return () => { document.title = prev; };
  }, [card]);

  // Set default lightbox side to cover side when card loads
  useEffect(() => {
    if (card?.cover) {
      setLightboxSide(card.cover.side);
    }
    if (card?.card_mode === 'unstructured' && card.scans.length > 0) {
      setShowLightbox(true);
    }
    if (card?.is_irregular && card.panels.length > 0) {
      setShowLightbox(true);
    }
  }, [card]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLightbox) {
          if (lbViewRef.current.zoom > 1) {
            setLbView({ zoom: 1, panX: 0, panY: 0 });
          } else {
            setShowLightbox(false);
          }
        } else if (showInfo) setShowInfo(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showInfo, showLightbox]);

  useEffect(() => {
    setLbView({ zoom: 1, panX: 0, panY: 0 });
    if (!showLightbox) setLightboxPage(0);
  }, [lightboxSide, showLightbox, lightboxPage]);

  useEffect(() => {
    if (showLightbox && lbView.zoom <= 0.5) {
      setShowLightbox(false);
    }
  }, [showLightbox, lbView.zoom]);

  useEffect(() => {
    const el = lbContentRef.current;
    if (!el || !showLightbox) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;
      setLbView(prev => {
        const z = Math.max(0.3, Math.min(LB_MAX_ZOOM, prev.zoom * factor));
        if (z < 1) return { zoom: z, panX: 0, panY: 0 };
        const r = z / prev.zoom;
        return { zoom: z, panX: mx - r * (mx - prev.panX), panY: my - r * (my - prev.panY) };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [showLightbox]);

  useEffect(() => {
    if (!showLightbox) return;
    const onMove = (e: MouseEvent) => {
      const d = lbDrag.current;
      if (!d.active) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
      if (lbViewRef.current.zoom > 1) {
        setLbView(prev => ({ zoom: prev.zoom, panX: d.panX0 + dx, panY: d.panY0 + dy }));
      }
    };
    const onUp = () => { lbDrag.current.active = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [showLightbox]);

  useEffect(() => {
    const el = lbContentRef.current;
    if (!el || !showLightbox) return;

    const dist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const mid = (a: Touch, b: Touch) => ({
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    });

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const t = lbTouch.current;
        const d = dist(e.touches[0], e.touches[1]);
        const m = mid(e.touches[0], e.touches[1]);
        const rect = el.getBoundingClientRect();
        t.active = true;
        t.startDist = d;
        t.startZoom = lbViewRef.current.zoom;
        t.startPanX = lbViewRef.current.panX;
        t.startPanY = lbViewRef.current.panY;
        t.startMidX = m.x - rect.left - rect.width / 2;
        t.startMidY = m.y - rect.top - rect.height / 2;
        t.lastMidX = t.startMidX;
        t.lastMidY = t.startMidY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lbTouch.current.active) {
        e.preventDefault();
        const t = lbTouch.current;
        const d = dist(e.touches[0], e.touches[1]);
        const m = mid(e.touches[0], e.touches[1]);
        const rect = el.getBoundingClientRect();
        const mx = m.x - rect.left - rect.width / 2;
        const my = m.y - rect.top - rect.height / 2;
        const rawZoom = t.startZoom * (d / t.startDist);
        const z = Math.max(0.3, Math.min(LB_MAX_ZOOM, rawZoom));

        if (z < 1) {
          setLbView({ zoom: z, panX: 0, panY: 0 });
        } else {
          const r = z / t.startZoom;
          const panX = t.startMidX - r * (t.startMidX - t.startPanX) + (mx - t.startMidX);
          const panY = t.startMidY - r * (t.startMidY - t.startPanY) + (my - t.startMidY);
          setLbView({ zoom: z, panX, panY });
        }
        t.lastMidX = mx;
        t.lastMidY = my;
      } else if (e.touches.length === 1 && !lbTouch.current.active && lbViewRef.current.zoom > 1) {
        e.preventDefault();
        const touch = e.touches[0];
        const d = lbDrag.current;
        if (!d.active) return;
        const dx = touch.clientX - d.startX;
        const dy = touch.clientY - d.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
        setLbView(prev => ({ zoom: prev.zoom, panX: d.panX0 + dx, panY: d.panY0 + dy }));
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lbTouch.current.active = false;
      }
      if (e.touches.length === 0) {
        lbDrag.current.active = false;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [showLightbox]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Card not found</p>
      </div>
    );
  }

  const panelCount = card.panel_count ?? 0;
  const hasPanels = card.panels.filter((p) => p.side === 'front').length > 0 || card.panels.filter((p) => p.side === 'back').length > 0;
  const allCropsComplete = hasPanels && card.panels.length >= panelCount * 2;
  const isUnstructured = card.card_mode === 'unstructured';
  const isIrregular = card.is_irregular === true;
  const has3D = allCropsComplete && !isUnstructured && !isIrregular;
  const hasGalleryScans = isUnstructured && card.scans.length > 0;

  const manufacturers = [...new Set(card.aircraft.map((a) => a.manufacturerName).filter(Boolean))];
  const models = [...new Set(card.aircraft.map((a) => a.modelName).filter(Boolean))];
  const variants = [...new Set(card.aircraft.flatMap((a) => a.variants.map((v) => v.name)).filter(Boolean))];

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 touch-none cursor-crosshair">
      <button
        onClick={() => navigate(-1)}
        className="fixed top-0 left-0 z-50 flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-white hover:bg-gray-50 transition-colors border border-black/20 border-t-0 border-l-0"
        aria-label="Go back"
      >
        <ArrowLeft className="h-6 w-6 sm:h-4 sm:w-4 text-foreground" />
      </button>

      {!isUnstructured && !isIrregular && (
      <div
        className="fixed left-0 top-1/2 -translate-y-1/2 z-50 flex items-center justify-center py-3 pl-1 pr-2 bg-white text-foreground text-[10px] font-medium tracking-widest border border-black/20 border-l-0 pointer-events-none overflow-visible [writing-mode:vertical-lr]"
        aria-hidden
      >
        <span className="inline-block [transform:rotate(180deg)]">
          <span className="hidden sm:inline">Click to open, drag to rotate</span>
          <span className="sm:hidden">Tap to open, drag to rotate</span>
        </span>
      </div>
      )}

      <div className="fixed top-0 right-0 z-50 flex">
        {!showInfo && (
          <button
            onClick={() => setShowLightbox((v) => !v)}
            className={`flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 transition-colors border border-black/20 border-t-0 border-r-0 ${
              showLightbox
                ? 'bg-black text-white hover:bg-black/90'
                : 'bg-white text-black hover:bg-gray-50'
            }`}
            aria-label="Lightbox"
          >
            {showLightbox
              ? <X className="h-6 w-6 sm:h-4 sm:w-4" />
              : <ZoomIn className="h-6 w-6 sm:h-4 sm:w-4" />}
          </button>
        )}
        <button
          onClick={() => setShowInfo((v) => !v)}
          className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 transition-colors border border-black/20 border-t-0 border-r-0 bg-white text-black hover:bg-gray-50"
          aria-label="Card info"
        >
          {showInfo
            ? <X className="h-6 w-6 sm:h-4 sm:w-4" />
            : <Info className="h-6 w-6 sm:h-4 sm:w-4" />}
        </button>
      </div>

      {has3D ? (
        <div className="w-full h-full" style={{ transform: `scale(${detailScale})`, transformOrigin: 'center center' }}>
          {card.is_booklet ? (
          <BookletVisualizer
            panels={card.panels}
            cover={card.cover}
            minimal
            hintOnLoad
          />
          ) : (
          <CardVisualizer3D
            panels={card.panels}
            creases={card.creases}
            cover={card.cover}
            pivotIndex={card.pivotIndex ?? undefined}
            minimal
            hintOnLoad
            onZoomLightbox={() => setShowLightbox(true)}
          />
          )}
        </div>
      ) : (isIrregular && allCropsComplete) ? (
        !showLightbox && (
        <div className="flex items-center justify-center h-full">
          <button
            onClick={() => setShowLightbox(true)}
            className="flex flex-col items-center gap-3 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ZoomIn className="h-8 w-8" />
            <span className="text-sm font-medium">View card</span>
          </button>
        </div>
        )
      ) : hasGalleryScans ? (
        !showLightbox && (
        <div className="flex items-center justify-center h-full">
          <button
            onClick={() => setShowLightbox(true)}
            className="flex flex-col items-center gap-3 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ZoomIn className="h-8 w-8" />
            <span className="text-sm font-medium">View scans</span>
          </button>
        </div>
        )
      ) : (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground text-sm">No 3D visualizer available for this card.</p>
        </div>
      )}

      <InfoSheet open={showInfo} title="Card info">
        {card.title && (
          <h2 className="text-base font-semibold text-foreground leading-snug mb-4">{card.title}</h2>
        )}
        {card.og_url || card.thumbnail_url ? (
          <div className="mb-5 aspect-square w-full max-w-[192px] overflow-hidden rounded-sm bg-[#ebeaef]">
            <img
              src={card.og_url || card.thumbnail_url || ''}
              alt=""
              className="h-full w-full object-contain"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          {card.airline_name && (
            <InfoRow label="Airline">{card.airline_name}</InfoRow>
          )}

          {(card.aircraft_label || manufacturers.length > 0 || models.length > 0 || variants.length > 0) && (
            <InfoRow label="Aircraft">
              {card.aircraft_label || [...manufacturers, ...models, ...variants].filter(Boolean).join(' · ')}
            </InfoRow>
          )}

          {card.published_year && (
            <InfoRow label="Year">{card.published_year}</InfoRow>
          )}

          {card.revision && (
            <InfoRow label="Revision">{card.revision}</InfoRow>
          )}

          {card.languages.length > 0 && (
            <InfoRow label={card.languages.length === 1 ? 'Language' : 'Languages'}>
              {card.languages.join(', ')}
            </InfoRow>
          )}

          {card.notes && (
            <InfoRow label="Notes">
              <span className="text-xs text-muted-foreground leading-relaxed">{card.notes}</span>
            </InfoRow>
          )}
        </div>
      </InfoSheet>

      {showLightbox && (isUnstructured ? card.scans.length > 0 : card.panels.length > 0) && (() => {
        // ── Unstructured: show scans as gallery pages ──
        if (isUnstructured) {
          const scanImages = card.scans
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((s, idx) => ({
              id: s.id,
              url: s.url || s.thumbnailUrl || '',
              alt: s.original_filename || `Scan ${idx + 1}`,
              width_px: s.width_px,
              height_px: s.height_px,
            }))
            .filter((s) => s.url);

          const totalNavStates = scanImages.length;
          const currentImage = scanImages[lightboxPage] ?? scanImages[0];
          if (!currentImage) return null;

          const currentImages = [currentImage];
          const navLabel = `${Math.min(lightboxPage + 1, totalNavStates)} / ${totalNavStates}`;

          const vh = window.innerHeight;
          const vw = window.innerWidth;
          const availableWidth = vw - 80;
          const availableHeight = vh - 32;
          const uniformHeight = Math.min(currentImage.height_px, availableHeight);
          const imgW = uniformHeight * (currentImage.width_px / currentImage.height_px);
          const scaleX = availableWidth / imgW;
          const scaleY = availableHeight / uniformHeight;
          const scale = Math.min(1, scaleX, scaleY);

          return (
            <div
              className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center overflow-hidden"
              onClick={() => setShowLightbox(false)}
            >
              <div className="fixed top-0 left-1/2 -translate-x-1/2 z-[110] flex border border-t-0 border-white/20 rounded-b-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {totalNavStates > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setLightboxPage((p) => Math.max(0, p - 1)); }}
                      disabled={lightboxPage === 0}
                      className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-black/70 hover:bg-black/90 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      aria-label="Previous"
                    >
                      <ChevronLeft className="h-6 w-6 sm:h-4 sm:w-4" />
                    </button>
                    <div className="flex items-center justify-center h-11 sm:h-8 px-3 bg-black/70 text-white/80 text-xs sm:text-[11px] font-medium border-l border-r border-white/20 min-w-[100px] text-center select-none">
                      {navLabel}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setLightboxPage((p) => Math.min(totalNavStates - 1, p + 1)); }}
                      disabled={lightboxPage >= totalNavStates - 1}
                      className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-black/70 hover:bg-black/90 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      aria-label="Next"
                    >
                      <ChevronRight className="h-6 w-6 sm:h-4 sm:w-4" />
                    </button>
                  </>
                )}
              </div>
              <div className="fixed top-0 right-0 z-[110]">
                <button
                  onClick={() => setShowLightbox(false)}
                  className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-black/70 hover:bg-black/90 text-white transition-colors border-b border-l border-white/20"
                  aria-label="Close lightbox"
                >
                  <X className="h-6 w-6 sm:h-4 sm:w-4" />
                </button>
              </div>
              <div
                ref={lbContentRef}
                className="flex items-center justify-center w-full h-full overflow-hidden px-10 touch-none"
                style={{ cursor: lbView.zoom >= LB_MAX_ZOOM ? 'grab' : 'zoom-in', userSelect: 'none' }}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  const d = lbDrag.current;
                  d.active = true;
                  d.moved = false;
                  d.startX = e.clientX;
                  d.startY = e.clientY;
                  d.panX0 = lbViewRef.current.panX;
                  d.panY0 = lbViewRef.current.panY;
                }}
                onTouchStart={(e) => {
                  if (e.touches.length === 1) {
                    const touch = e.touches[0];
                    const d = lbDrag.current;
                    d.active = true;
                    d.moved = false;
                    d.startX = touch.clientX;
                    d.startY = touch.clientY;
                    d.panX0 = lbViewRef.current.panX;
                    d.panY0 = lbViewRef.current.panY;
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (lbDrag.current.moved) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mx = e.clientX - rect.left - rect.width / 2;
                  const my = e.clientY - rect.top - rect.height / 2;
                  setLbView(prev => {
                    const z = Math.min(LB_MAX_ZOOM, prev.zoom * 2);
                    if (z === prev.zoom) return prev;
                    const r = z / prev.zoom;
                    return { zoom: z, panX: mx - r * (mx - prev.panX), panY: my - r * (my - prev.panY) };
                  });
                }}
              >
                <div
                  className="flex items-stretch gap-0 shrink-0 min-h-0"
                  style={{
                    height: `${uniformHeight}px`,
                    transform: `translate(${lbView.panX}px, ${lbView.panY}px) scale(${scale * lbView.zoom})`,
                    transformOrigin: 'center center',
                  }}
                >
                  {currentImages.map((img) => (
                    <img
                      key={img.id}
                      src={img.url}
                      alt={img.alt}
                      className="min-h-0 shrink-0 w-auto object-contain object-left-top"
                      style={{ height: `${uniformHeight}px`, maxHeight: `${uniformHeight}px` }}
                      draggable={false}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        }

        // ── Structured: existing panel-based lightbox ──
        const isBooklet = card.is_booklet;
        const allFront = card.panels.filter((p) => p.side === 'front').sort((a, b) => a.panel_index - b.panel_index);
        const allBack = card.panels.filter((p) => p.side === 'back').sort((a, b) => a.panel_index - b.panel_index);
        const pageCount = Math.max(allFront.length, allBack.length);

        // Build the list of images to display for the current view
        let currentImages: { id: string; url: string; alt: string; width_px: number; height_px: number }[] = [];
        let navLabel = '';
        let totalNavStates = 0;

        if (isBooklet) {
          // Booklet: front cover, interior spreads, back cover
          // lightboxPage 0 = front cover (page 0 front)
          // lightboxPage 1..pageCount-1 = interior spreads (page N-1 back + page N front)
          // lightboxPage pageCount = back cover (last page back)
          totalNavStates = pageCount + 1;

          if (lightboxPage === 0) {
            navLabel = 'Cover';
            const p = allFront[0];
            if (p) {
              const url = card.fullUrls[p.id] || card.displayUrls[p.id] || p.thumbnail_url;
              if (url) currentImages.push({ id: p.id, url, alt: 'Cover', width_px: p.width_px ?? 600, height_px: p.height_px ?? 800 });
            }
          } else if (lightboxPage >= pageCount) {
            navLabel = 'Back Cover';
            const p = allBack[pageCount - 1];
            if (p) {
              const url = card.fullUrls[p.id] || card.displayUrls[p.id] || p.thumbnail_url;
              if (url) currentImages.push({ id: p.id, url, alt: 'Back Cover', width_px: p.width_px ?? 600, height_px: p.height_px ?? 800 });
            }
          } else {
            const leftIdx = lightboxPage - 1;
            const rightIdx = lightboxPage;
            navLabel = `Spread ${lightboxPage}`;
            const leftPanel = allBack[leftIdx];
            const rightPanel = allFront[rightIdx];
            if (leftPanel) {
              const url = card.fullUrls[leftPanel.id] || card.displayUrls[leftPanel.id] || leftPanel.thumbnail_url;
              if (url) currentImages.push({ id: leftPanel.id, url, alt: `Page ${leftIdx + 1} back`, width_px: leftPanel.width_px ?? 600, height_px: leftPanel.height_px ?? 800 });
            }
            if (rightPanel) {
              const url = card.fullUrls[rightPanel.id] || card.displayUrls[rightPanel.id] || rightPanel.thumbnail_url;
              if (url) currentImages.push({ id: rightPanel.id, url, alt: `Page ${rightIdx + 1} front`, width_px: rightPanel.width_px ?? 600, height_px: rightPanel.height_px ?? 800 });
            }
          }
        } else {
          // Folding card: front/back side toggle
          totalNavStates = 2;
          const currentSidePanels = lightboxSide === 'front' ? allFront : allBack;
          navLabel = lightboxSide === 'front' ? 'Front Side' : 'Back Side';
          currentImages = currentSidePanels.map((p) => {
            const url = card.fullUrls[p.id] || card.displayUrls[p.id] || p.thumbnail_url;
            return { id: p.id, url: url || '', alt: `${p.side} panel ${p.panel_index + 1}`, width_px: p.width_px ?? 600, height_px: p.height_px ?? 800 };
          }).filter((img) => img.url);
        }

        const heights = currentImages.map((img) => img.height_px).filter((h) => h > 0);
        const maxPanelHeight = heights.length > 0 ? Math.max(...heights) : 600;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const availableWidth = vw - 80;
        const availableHeight = vh - 32;
        const uniformHeight = Math.min(maxPanelHeight, availableHeight);

        const totalWidth = currentImages.reduce((sum, img) => {
          return sum + uniformHeight * (img.width_px / img.height_px);
        }, 0);

        const scaleX = totalWidth > 0 ? availableWidth / totalWidth : 1;
        const scaleY = uniformHeight > 0 ? availableHeight / uniformHeight : 1;
        const scale = Math.min(1, scaleX, scaleY);

        return (
          <div
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center overflow-hidden"
            onClick={() => setShowLightbox(false)}
          >
            {(isBooklet || isIrregular) && (
            <div className="fixed top-0 left-1/2 -translate-x-1/2 z-[110] flex border border-t-0 border-white/20 rounded-b-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {(isBooklet || totalNavStates > 1) && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isBooklet) setLightboxPage((p) => Math.max(0, p - 1));
                      else setLightboxSide((s) => s === 'back' ? 'front' : 'back');
                    }}
                    disabled={isBooklet ? lightboxPage === 0 : lightboxSide === 'front'}
                    className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-black/70 hover:bg-black/90 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="h-6 w-6 sm:h-4 sm:w-4" />
                  </button>
                  <div className="flex items-center justify-center h-11 sm:h-8 px-3 bg-black/70 text-white/80 text-xs sm:text-[11px] font-medium border-l border-r border-white/20 min-w-[100px] text-center select-none">
                    {navLabel}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isBooklet) setLightboxPage((p) => Math.min(totalNavStates - 1, p + 1));
                      else setLightboxSide((s) => s === 'front' ? 'back' : 'front');
                    }}
                    disabled={isBooklet ? lightboxPage >= totalNavStates - 1 : lightboxSide === 'back'}
                    className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-black/70 hover:bg-black/90 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Next"
                  >
                    <ChevronRight className="h-6 w-6 sm:h-4 sm:w-4" />
                  </button>
                </>
              )}
            </div>
            )}
            <div className="fixed top-0 right-0 z-[110] flex">
              {!isBooklet && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxSide((s) => s === 'front' ? 'back' : 'front');
                  }}
                  className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-black/70 hover:bg-black/90 text-white transition-colors border-b border-l border-white/20"
                  aria-label="Flip to other side"
                >
                  <RotateCw className="h-6 w-6 sm:h-4 sm:w-4" />
                </button>
              )}
              <button
                onClick={() => setShowLightbox(false)}
                className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-black/70 hover:bg-black/90 text-white transition-colors border-b border-l border-white/20"
                aria-label="Close lightbox"
              >
                <X className="h-6 w-6 sm:h-4 sm:w-4" />
              </button>
            </div>

            <div
              ref={lbContentRef}
              className="flex items-center justify-center w-full h-full overflow-hidden px-10 touch-none"
              style={{ cursor: lbView.zoom >= LB_MAX_ZOOM ? 'grab' : 'zoom-in', userSelect: 'none' }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                const d = lbDrag.current;
                d.active = true;
                d.moved = false;
                d.startX = e.clientX;
                d.startY = e.clientY;
                d.panX0 = lbViewRef.current.panX;
                d.panY0 = lbViewRef.current.panY;
              }}
              onTouchStart={(e) => {
                if (e.touches.length === 1) {
                  const touch = e.touches[0];
                  const d = lbDrag.current;
                  d.active = true;
                  d.moved = false;
                  d.startX = touch.clientX;
                  d.startY = touch.clientY;
                  d.panX0 = lbViewRef.current.panX;
                  d.panY0 = lbViewRef.current.panY;
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (lbDrag.current.moved) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const mx = e.clientX - rect.left - rect.width / 2;
                const my = e.clientY - rect.top - rect.height / 2;
                setLbView(prev => {
                  const z = Math.min(LB_MAX_ZOOM, prev.zoom * 2);
                  if (z === prev.zoom) return prev;
                  const r = z / prev.zoom;
                  return { zoom: z, panX: mx - r * (mx - prev.panX), panY: my - r * (my - prev.panY) };
                });
              }}
            >
              <div
                className="flex items-stretch gap-0 shrink-0 min-h-0"
                style={{
                  height: `${uniformHeight}px`,
                  transform: `translate(${lbView.panX}px, ${lbView.panY}px) scale(${scale * lbView.zoom})`,
                  transformOrigin: 'center center',
                }}
              >
                {currentImages.map((img) => (
                  <img
                    key={img.id}
                    src={img.url}
                    alt={img.alt}
                    className="min-h-0 shrink-0 w-auto object-contain object-left-top"
                    style={{ height: `${uniformHeight}px`, maxHeight: `${uniformHeight}px` }}
                    draggable={false}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
