import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft, Info, X, Maximize2, RotateCw } from 'lucide-react';
import { fetchCardDetail, type CardDetailData } from '@/lib/safetyCardService';
import { CardVisualizer3D } from '@/components/FoldEditor/CardVisualizer3D';
import { InfoSheet, InfoRow } from '@/components/Public/InfoSheet';
import type { Panel } from '@/components/FoldEditor/types';

const PANEL_HEIGHT = 250;
const PANEL_WIDTH_FALLBACK = 180;
const MINIMAL_INTERNAL_SCALE = 1.5;
const HORIZONTAL_MARGIN = 120;
const VERTICAL_MARGIN = 120;

function computeUnfoldedCardWidth(panels: Panel[]): number {
  const frontPanels = panels.filter((p) => p.side === 'front').sort((a, b) => a.panel_index - b.panel_index);
  const backPanels = panels.filter((p) => p.side === 'back').sort((a, b) => a.panel_index - b.panel_index);
  const maxIndex = Math.max(
    ...frontPanels.map((p) => p.panel_index),
    ...backPanels.map((p) => p.panel_index),
    -1
  );
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
    () => (card?.panels?.length ? computeUnfoldedCardWidth(card.panels) : PANEL_WIDTH_FALLBACK * 3),
    [card?.panels]
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

export const PublicCardDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [card, setCard] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxSide, setLightboxSide] = useState<'front' | 'back'>('front');
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
        if (showLightbox) setShowLightbox(false);
        else if (showInfo) setShowInfo(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showInfo, showLightbox]);

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
  const has3D = allCropsComplete && card.creases.length > 0;

  const manufacturers = [...new Set(card.aircraft.map((a) => a.manufacturerName).filter(Boolean))];
  const models = [...new Set(card.aircraft.map((a) => a.modelName).filter(Boolean))];
  const variants = [...new Set(card.aircraft.flatMap((a) => a.variants.map((v) => v.name)).filter(Boolean))];

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 touch-none cursor-crosshair">
      <button
        onClick={() => navigate(-1)}
        className="fixed top-0 left-0 z-50 flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-white hover:bg-gray-50 transition-colors border border-black/20 border-l-0"
        aria-label="Go back"
      >
        <ArrowLeft className="h-6 w-6 sm:h-4 sm:w-4 text-foreground" />
      </button>

      <div
        className="fixed left-0 top-1/2 -translate-y-1/2 z-50 flex items-center justify-center py-3 pl-1 pr-2 bg-white text-foreground text-[10px] font-medium tracking-widest border border-black/20 border-l-0 pointer-events-none overflow-visible [writing-mode:vertical-lr]"
        aria-hidden
      >
        <span className="inline-block [transform:rotate(180deg)]">
          <span className="hidden sm:inline">Click to open, drag to rotate</span>
          <span className="sm:hidden">Tap to open, drag to rotate</span>
        </span>
      </div>

      <div className="fixed top-0 right-0 z-50 flex">
        {!showInfo && (
          <button
            onClick={() => setShowLightbox((v) => !v)}
            className={`flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 transition-colors border border-black/20 border-r-0 ${
              showLightbox
                ? 'bg-black text-white hover:bg-black/90'
                : 'bg-white text-black hover:bg-gray-50'
            }`}
            aria-label="Lightbox"
          >
            {showLightbox
              ? <X className="h-6 w-6 sm:h-4 sm:w-4" />
              : <Maximize2 className="h-6 w-6 sm:h-4 sm:w-4" />}
          </button>
        )}
        <button
          onClick={() => setShowInfo((v) => !v)}
          className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 transition-colors border border-black/20 border-r-0 bg-white text-black hover:bg-gray-50"
          aria-label="Card info"
        >
          {showInfo
            ? <X className="h-6 w-6 sm:h-4 sm:w-4" />
            : <Info className="h-6 w-6 sm:h-4 sm:w-4" />}
        </button>
      </div>

      {has3D ? (
        <div className="w-full h-full" style={{ transform: `scale(${detailScale})`, transformOrigin: 'center center' }}>
          <CardVisualizer3D
            panels={card.panels}
            creases={card.creases}
            cover={card.cover}
            pivotIndex={card.pivotIndex ?? undefined}
            minimal
            hintOnLoad
          />
        </div>
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

      {showLightbox && card.panels.length > 0 && (() => {
        const currentSidePanels = card.panels
          .filter((p) => p.side === lightboxSide)
          .sort((a, b) => a.panel_index - b.panel_index);

        const panelHeights = currentSidePanels.map((p) => p.height_px ?? 0).filter((h) => h > 0);
        const maxPanelHeight = panelHeights.length > 0 ? Math.max(...panelHeights) : 600;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const availableWidth = vw - 80;
        const availableHeight = vh - 32;
        const uniformHeight = Math.min(maxPanelHeight, availableHeight);

        const totalWidth = currentSidePanels.reduce((sum, p) => {
          const w = p.width_px ?? 1;
          const h = p.height_px ?? 1;
          return sum + uniformHeight * (w / h);
        }, 0);

        const scaleX = totalWidth > 0 ? availableWidth / totalWidth : 1;
        const scaleY = uniformHeight > 0 ? availableHeight / uniformHeight : 1;
        const scale = Math.min(1, scaleX, scaleY);

        return (
          <div
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center overflow-hidden"
            onClick={() => setShowLightbox(false)}
          >
            <div className="fixed top-0 right-0 z-[110] flex">
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
              <button
                onClick={() => setShowLightbox(false)}
                className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-black/70 hover:bg-black/90 text-white transition-colors border-b border-l border-white/20"
                aria-label="Close lightbox"
              >
                <X className="h-6 w-6 sm:h-4 sm:w-4" />
              </button>
            </div>
            <div
              className="flex items-center justify-center w-full h-full overflow-hidden px-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex items-stretch gap-0 shrink-0 min-h-0 overflow-hidden"
                style={{
                  height: `${uniformHeight}px`,
                  transform: `scale(${scale})`,
                  transformOrigin: 'center center',
                }}
              >
                {currentSidePanels.map((panel) => {
                  const imageUrl = card.fullUrls[panel.id] || card.displayUrls[panel.id] || panel.thumbnail_url;
                  if (!imageUrl) return null;

                  return (
                    <img
                      key={panel.id}
                      src={imageUrl}
                      alt={`${panel.side} panel ${panel.panel_index + 1}`}
                      className="min-h-0 shrink-0 w-auto object-contain object-left-top"
                      style={{ height: `${uniformHeight}px`, maxHeight: `${uniformHeight}px` }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
