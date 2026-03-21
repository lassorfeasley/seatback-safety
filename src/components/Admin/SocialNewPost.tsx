import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Search,
  X,
  Sparkles,
  Check,
  CalendarClock,
  RotateCw,
} from 'lucide-react';
import { fetchCards, fetchCardDetail, type CardSummary, type CardDetailData } from '@/lib/safetyCardService';
import {
  createSocialPostFromManualCrop,
  deleteSocialPost,
  renderSocialPostPreview,
  updateSocialPost,
  type SocialPostWithCard,
} from '@/lib/socialService';
import {
  buildCompositeStrip,
  extractSquareCropToBlob,
  panelIdForCompositeCrop,
  type CompositeStripResult,
} from '@/lib/socialCompositeStrip';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/** Instagram feed square: ~1080px edge is the usual “sharp post” target. */
const INSTAGRAM_SQUARE_MIN_PX = 1080;
const CROPPER_MIN_ZOOM = 0.5;
/** High ceiling so you can zoom in until the crop hits the minimum export size (see onCropComplete clamp). */
const CROPPER_MAX_ZOOM = 50;

/** Same visual language as `InfiniteCardTile` on the public landing page (square, OG bg, no frame). */
function SocialPickTile({
  card,
  onPick,
}: {
  card: CardSummary;
  onPick: () => void;
}) {
  const fallbacks = [card.og_url, card.thumbnail_url].filter(Boolean) as string[];
  const [imgSrc, setImgSrc] = useState<string | null>(fallbacks[0] ?? null);
  const fallbackIdx = useRef(0);

  return (
    <div className="aspect-square min-w-0">
      <button
        type="button"
        onClick={onPick}
        className="block h-full w-full border-0 bg-transparent p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        title={card.title ?? undefined}
      >
        <div className="h-full w-full bg-[#ebeaef] relative overflow-hidden">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              onError={() => {
                fallbackIdx.current += 1;
                if (fallbackIdx.current < fallbacks.length) {
                  setImgSrc(fallbacks[fallbackIdx.current]);
                } else {
                  setImgSrc(null);
                }
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
              No image
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

function defaultScheduleIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export const SocialNewPost: React.FC<{
  onPostCreated?: () => void;
}> = ({ onPostCreated }) => {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [query, setQuery] = useState('');

  const [lightboxCard, setLightboxCard] = useState<CardSummary | null>(null);
  const [cardDetail, setCardDetail] = useState<CardDetailData | null>(null);
  const [lightboxSide, setLightboxSide] = useState<'front' | 'back'>('front');
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [composite, setComposite] = useState<CompositeStripResult | null>(null);
  const [compositeLoading, setCompositeLoading] = useState(false);

  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1200,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const croppedPixelsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  /** Pixel size of the square on the composite (export resolution). */
  const [exportCropPx, setExportCropPx] = useState<{ w: number; h: number } | null>(null);

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const [reviewPost, setReviewPost] = useState<SocialPostWithCard | null>(null);
  const [caption, setCaption] = useState('');
  const [scheduledAt, setScheduledAt] = useState(defaultScheduleIso);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCards().then((c) => {
      setCards(c);
      setLoadingCards(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return cards;
    return cards.filter((c) => {
      const hay = [c.title, c.airline_name, c.aircraft_label, c.published_year != null ? String(c.published_year) : null]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [cards, query]);

  const openLightbox = async (card: CardSummary) => {
    setLightboxCard(card);
    setLoadingDetail(true);
    setGenError(null);
    setReviewPost(null);
    setCardDetail(null);
    setComposite(null);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
    croppedPixelsRef.current = null;
    const detail = await fetchCardDetail(card.id);
    setLoadingDetail(false);
    if (!detail) {
      setGenError('Could not load card panels.');
      return;
    }
    const side = detail.cover?.side ?? 'front';
    setLightboxSide(side);
    setCardDetail(detail);
  };

  const closeLightbox = useCallback(() => {
    setLightboxCard(null);
    setCardDetail(null);
    setComposite(null);
    setReviewPost(null);
  }, []);

  useEffect(() => {
    if (!lightboxCard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxCard, closeLightbox]);

  useEffect(() => {
    if (!lightboxCard) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lightboxCard]);

  const currentSidePanels = useMemo(() => {
    if (!cardDetail) return [];
    return cardDetail.panels
      .filter((p) => p.side === lightboxSide)
      .sort((a, b) => a.panel_index - b.panel_index);
  }, [cardDetail, lightboxSide]);

  /** Viewport-only scale so the high-res composite fits on screen; canvas pixels stay full resolution. */
  /** Largest square that fits on the composite (upper bound for export size). */
  const maxSquareCropPx = useMemo(() => {
    if (!composite) return 0;
    return Math.min(composite.width, composite.height);
  }, [composite]);

  const displayScale = useMemo(() => {
    if (!composite) return 1;
    const vw = viewport.w;
    const vh = viewport.h;
    const stripZone = 0.54;
    const availableWidth = vw - 80;
    const availableHeight = Math.min(Math.floor(vh * stripZone), vh - 40);
    const scaleX = composite.width > 0 ? availableWidth / composite.width : 1;
    const scaleY = composite.height > 0 ? availableHeight / composite.height : 1;
    return Math.min(1, scaleX, scaleY);
  }, [composite, viewport]);

  useEffect(() => {
    if (!cardDetail || currentSidePanels.length === 0) {
      setComposite(null);
      return;
    }
    let cancelled = false;
    setCompositeLoading(true);
    buildCompositeStrip(cardDetail, currentSidePanels)
      .then((r) => {
        if (cancelled) return;
        setComposite(r);
        setCompositeLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setComposite(null);
          setCompositeLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cardDetail, lightboxSide, currentSidePanels]);

  useEffect(() => {
    if (!lightboxCard) return;
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, [lightboxCard]);

  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    croppedPixelsRef.current = null;
    setExportCropPx(null);
  }, [composite?.dataUrl]);

  const onCropComplete = useCallback(
    (
      _area: { x: number; y: number; width: number; height: number },
      croppedAreaPixels: { x: number; y: number; width: number; height: number }
    ) => {
      croppedPixelsRef.current = croppedAreaPixels;
      const w = Math.round(croppedAreaPixels.width);
      const h = Math.round(croppedAreaPixels.height);
      setExportCropPx({ w, h });

      // If the composite can support a 1080px square, don't allow zooming in past the point
      // where the crop would be smaller than Instagram's usual sharp square size.
      if (!composite) return;
      const maxSquare = Math.min(composite.width, composite.height);
      if (maxSquare < INSTAGRAM_SQUARE_MIN_PX) return;

      const rawW = croppedAreaPixels.width;
      if (rawW <= 0) return;
      if (rawW >= INSTAGRAM_SQUARE_MIN_PX - 0.25) return;

      setZoom((z) => Math.max(CROPPER_MIN_ZOOM, z * (rawW / INSTAGRAM_SQUARE_MIN_PX)));
    },
    [composite]
  );

  const handleGenerateCaption = async () => {
    if (!lightboxCard || !composite?.canvas || currentSidePanels.length === 0) return;
    const pixels = croppedPixelsRef.current;
    if (!pixels) {
      setGenError('Wait for the strip to finish loading, then adjust the crop slightly.');
      return;
    }
    const maxSq = Math.min(composite.canvas.width, composite.canvas.height);
    if (
      maxSq >= INSTAGRAM_SQUARE_MIN_PX &&
      pixels.width < INSTAGRAM_SQUARE_MIN_PX - 0.5
    ) {
      setGenError(
        `Export would be below ${INSTAGRAM_SQUARE_MIN_PX}px — zoom out slightly so the square is at least ${INSTAGRAM_SQUARE_MIN_PX}×${INSTAGRAM_SQUARE_MIN_PX} px.`
      );
      return;
    }
    setGenerating(true);
    setGenError(null);
    let blob: Blob;
    try {
      blob = await extractSquareCropToBlob(composite.canvas, pixels);
    } catch (e) {
      setGenerating(false);
      setGenError(e instanceof Error ? e.message : 'Could not extract crop');
      return;
    }
    const path = `${lightboxCard.id}/social-crop-${crypto.randomUUID()}.jpg`;
    const { error: uploadErr } = await supabase.storage.from('derivatives').upload(path, blob, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
    });
    if (uploadErr) {
      setGenerating(false);
      setGenError(uploadErr.message || 'Upload failed');
      return;
    }
    const resolvedPanelId =
      panelIdForCompositeCrop(composite.panelOffsets, pixels, composite.height) ??
      currentSidePanels[0].id;
    const { result, error } = await createSocialPostFromManualCrop({
      card_id: lightboxCard.id,
      panel_id: resolvedPanelId,
      cropped_image_path: path,
    });
    setGenerating(false);
    if (error || !result?.post) {
      setGenError(error ?? 'Failed to generate');
      return;
    }
    const merged: SocialPostWithCard = {
      ...result.post,
      card_title: result.card_title ?? lightboxCard.title,
      airline_name: result.airline_name ?? lightboxCard.airline_name,
      panel_image_url: result.panel_image_url ?? null,
    };
    setReviewPost(merged);
    setCaption(result.post.caption ?? '');
    setScheduledAt(defaultScheduleIso());
    onPostCreated?.();
  };

  const handleApproveSchedule = async () => {
    if (!reviewPost) return;
    setSaving(true);
    await updateSocialPost(reviewPost.id, {
      caption,
      status: 'scheduled',
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
    setSaving(false);
    closeLightbox();
    onPostCreated?.();
  };

  const handleSaveDraft = async () => {
    if (!reviewPost) return;
    setSaving(true);
    await updateSocialPost(reviewPost.id, { caption });
    setSaving(false);
    closeLightbox();
    onPostCreated?.();
  };

  const handleBackToCrop = async () => {
    if (!reviewPost) return;
    setSaving(true);
    await deleteSocialPost(reviewPost.id);
    setSaving(false);
    setReviewPost(null);
    setCaption('');
    setGenError(null);
    onPostCreated?.();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">New post</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Search for a card, open the lightbox, frame a square crop on the full side (panels flush; crop may span a seam), then generate a caption. Approve to schedule.
        </p>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, airline, aircraft, year…"
          className="w-full rounded-md border bg-background pl-10 pr-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {loadingCards ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {query.trim() ? 'No cards match your search.' : 'No cards in the library.'}
        </p>
      ) : (
        <div
          className="grid w-full"
          style={{
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          {filtered.map((card) => (
            <SocialPickTile key={card.id} card={card} onPick={() => openLightbox(card)} />
          ))}
        </div>
      )}

      {lightboxCard && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-xl overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Crop safety card side and generate caption"
        >
          {loadingDetail ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-white/70" />
            </div>
          ) : cardDetail && cardDetail.panels.length > 0 ? (
            currentSidePanels.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="text-sm text-white/70">No panels on the {lightboxSide} side.</p>
                <div className="fixed top-0 right-0 z-[110] flex">
                  <button
                    type="button"
                    onClick={() => setLightboxSide((s) => (s === 'front' ? 'back' : 'front'))}
                    className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-black/70 hover:bg-black/90 text-white transition-colors border-b border-l border-white/20"
                    aria-label="Flip to other side"
                  >
                    <RotateCw className="h-6 w-6 sm:h-4 sm:w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={closeLightbox}
                    className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-black/70 hover:bg-black/90 text-white transition-colors border-b border-l border-white/20"
                    aria-label="Close"
                  >
                    <X className="h-6 w-6 sm:h-4 sm:w-4" />
                  </button>
                </div>
              </div>
            ) : (
            <>
              <div className="fixed top-0 right-0 z-[110] flex">
                <button
                  type="button"
                  onClick={() => setLightboxSide((s) => (s === 'front' ? 'back' : 'front'))}
                  className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-black/70 hover:bg-black/90 text-white transition-colors border-b border-l border-white/20"
                  aria-label="Flip to other side"
                >
                  <RotateCw className="h-6 w-6 sm:h-4 sm:w-4" />
                </button>
                <button
                  type="button"
                  onClick={closeLightbox}
                  className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-black/70 hover:bg-black/90 text-white transition-colors border-b border-l border-white/20"
                  aria-label="Close"
                >
                  <X className="h-6 w-6 sm:h-4 sm:w-4" />
                </button>
              </div>

              <div className="flex flex-1 min-h-0 flex-col pt-11 sm:pt-8">
                {genError && (
                  <div className="mx-4 mt-2 shrink-0 text-sm text-red-300 bg-red-950/50 rounded-md px-3 py-2 border border-red-500/30">
                    {genError}
                  </div>
                )}

                {/* Flush side strip + square crop on the same surface (crop may cross panel seams). */}
                {!reviewPost && (
                  <div
                    className="flex min-h-0 flex-1 flex-col items-stretch overflow-hidden px-4 sm:px-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {compositeLoading && (
                      <div className="flex flex-1 items-center justify-center">
                        <Loader2 className="h-10 w-10 animate-spin text-white/60" />
                      </div>
                    )}
                    {!compositeLoading && composite && (
                      <>
                        <div className="flex min-h-0 flex-1 items-center justify-center py-2">
                          <div
                            className="relative overflow-hidden rounded-md bg-black"
                            style={{
                              width: composite.width * displayScale,
                              height: composite.height * displayScale,
                            }}
                          >
                            <Cropper
                              key={composite.dataUrl}
                              image={composite.dataUrl}
                              crop={crop}
                              zoom={zoom}
                              aspect={1}
                              onCropChange={setCrop}
                              onZoomChange={setZoom}
                              onCropComplete={onCropComplete}
                              minZoom={CROPPER_MIN_ZOOM}
                              maxZoom={CROPPER_MAX_ZOOM}
                            />
                          </div>
                        </div>
                        <p className="shrink-0 pb-1 text-center text-[11px] text-white/50">
                          {lightboxSide === 'front' ? 'Front' : 'Back'} · Square crop may span two panels
                        </p>
                        {maxSquareCropPx > 0 && maxSquareCropPx < INSTAGRAM_SQUARE_MIN_PX && (
                          <p className="shrink-0 px-2 pb-2 text-center text-[11px] text-amber-200/90">
                            This side is smaller than {INSTAGRAM_SQUARE_MIN_PX}px; export will be below Instagram’s
                            recommended size.
                          </p>
                        )}
                        <div className="shrink-0 space-y-3 pb-4 pt-1 max-w-lg w-full mx-auto">
                          {exportCropPx && (
                            <p
                              className={cn(
                                'text-center text-xs tabular-nums',
                                maxSquareCropPx >= INSTAGRAM_SQUARE_MIN_PX &&
                                  exportCropPx.w >= INSTAGRAM_SQUARE_MIN_PX
                                  ? 'text-emerald-300/95'
                                  : maxSquareCropPx >= INSTAGRAM_SQUARE_MIN_PX
                                    ? 'text-amber-200/90'
                                    : 'text-white/70'
                              )}
                            >
                              Export: {exportCropPx.w} × {exportCropPx.h} px
                              {maxSquareCropPx >= INSTAGRAM_SQUARE_MIN_PX && (
                                <span className="text-white/50 font-normal">
                                  {' '}
                                  (aim ≥ {INSTAGRAM_SQUARE_MIN_PX} for a sharp IG square)
                                </span>
                              )}
                            </p>
                          )}
                          <div className="flex items-center gap-3">
                            <label className="text-xs text-white/60 w-14 shrink-0">Zoom</label>
                            <input
                              type="range"
                              min={CROPPER_MIN_ZOOM}
                              max={CROPPER_MAX_ZOOM}
                              step={0.05}
                              value={zoom}
                              onChange={(e) => setZoom(Number(e.target.value))}
                              className="flex-1 accent-white"
                            />
                            <span className="text-xs tabular-nums w-12 text-right text-white/80">
                              {zoom.toFixed(2)}×
                            </span>
                          </div>
                          <p className="text-xs text-white/50 text-center">
                            Higher zoom = tighter framing but fewer pixels. We cap zoom so the export stays at least{' '}
                            {INSTAGRAM_SQUARE_MIN_PX}×{INSTAGRAM_SQUARE_MIN_PX}px when this side is large enough. Drag
                            the square to position, then generate.
                          </p>
                          <Button
                            type="button"
                            className="w-full gap-2 bg-white text-black hover:bg-white/90"
                            onClick={handleGenerateCaption}
                            disabled={generating || compositeLoading}
                          >
                            {generating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                            Generate caption
                          </Button>
                        </div>
                      </>
                    )}
                    {!compositeLoading && !composite && (
                      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-white/60">
                        Could not build panel strip for this side.
                      </div>
                    )}
                  </div>
                )}

                {reviewPost && composite && (
                  <div
                    className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 py-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img
                      src={composite.dataUrl}
                      alt=""
                      className="max-h-[min(40vh,420px)] w-auto max-w-full object-contain"
                      draggable={false}
                    />
                  </div>
                )}

                {reviewPost && (
                  <div className="shrink-0 border-t border-white/10 bg-black/50 px-4 py-4 overflow-y-auto max-h-[min(42vh,400px)]">
                    <h4 className="text-sm font-medium text-white flex items-center gap-2 mb-3">
                      <Check className="h-4 w-4 text-emerald-400" />
                      Review & schedule
                    </h4>
                    <div className="flex gap-4 flex-col sm:flex-row">
                      <ReviewCropPreview post={reviewPost} />
                      <div className="flex-1 space-y-3 min-w-0">
                        <div>
                          <label className="text-xs font-medium text-white/70">Caption</label>
                          <textarea
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            rows={5}
                            className="mt-1 w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 resize-y"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-white/70 flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            Schedule
                          </label>
                          <input
                            type="datetime-local"
                            value={scheduledAt}
                            onChange={(e) => setScheduledAt(e.target.value)}
                            className="mt-1 w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleApproveSchedule}
                            disabled={saving}
                            className="gap-1.5 bg-white text-black hover:bg-white/90"
                          >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Approve & schedule
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={handleSaveDraft} disabled={saving} className="border-white/30 text-white hover:bg-white/10">
                            Save as draft
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={handleBackToCrop} disabled={saving} className="text-white/80 hover:text-white">
                            Adjust crop again
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
            )
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-white/70">
              <p className="text-sm">{genError ?? 'Could not load this card.'}</p>
              <Button type="button" variant="outline" className="border-white/30 text-white" onClick={closeLightbox}>
                Close
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function ReviewCropPreview({ post }: { post: SocialPostWithCard }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    renderSocialPostPreview(post, post.panel_image_url, 240)
      .then((dataUrl) => {
        const c = ref.current;
        if (!c) return;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, 160, 160);
          ctx.drawImage(img, 0, 0, 160, 160);
          setOk(true);
        };
        img.src = dataUrl;
      })
      .catch(() => setOk(false));
  }, [
    post.panel_image_url,
    post.crop_image_path,
    post.crop_x_pct,
    post.crop_y_pct,
    post.crop_size_pct,
  ]);

  return (
    <canvas
      ref={ref}
      width={160}
      height={160}
      className={cn('rounded-lg border bg-muted shrink-0', !ok && 'opacity-40')}
    />
  );
}
