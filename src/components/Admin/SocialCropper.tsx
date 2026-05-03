import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Button } from '@/components/ui/button';
import { Loader2, X, RotateCw, Crop as CropIcon } from 'lucide-react';
import {
  buildCompositeStrip,
  extractSquareCropToBlob,
  panelIdForCompositeCrop,
  type CompositeStripResult,
} from '@/lib/socialCompositeStrip';
import { supabase } from '@/lib/supabase';
import { createSocialCrop, type SocialCrop } from '@/lib/socialCropService';
import { cn } from '@/lib/utils';
import type { CardDetailData } from '@/lib/safetyCardService';
import type { Panel } from '@/components/FoldEditor/types';

const INSTAGRAM_SQUARE_MIN_PX = 400;
const CROPPER_MIN_ZOOM = 0.5;
const CROPPER_MAX_ZOOM = 50;

interface SocialCropperBaseProps {
  cardId: string;
  onCropSaved: (crop: SocialCrop) => void;
  onClose: () => void;
}

interface PanelModeProps extends SocialCropperBaseProps {
  mode: 'panels';
  cardDetail: CardDetailData;
  scanUrl?: never;
  scanId?: never;
}

interface ScanModeProps extends SocialCropperBaseProps {
  mode: 'scan';
  scanUrl: string;
  scanId: string;
  cardDetail?: never;
}

export type SocialCropperProps = PanelModeProps | ScanModeProps;

export const SocialCropper: React.FC<SocialCropperProps> = (props) => {
  const { cardId, onCropSaved, onClose } = props;

  const [side, setSide] = useState<'front' | 'back'>(() =>
    props.mode === 'panels' ? (props.cardDetail.cover?.side ?? 'front') : 'front'
  );
  const [composite, setComposite] = useState<CompositeStripResult | null>(null);
  const [compositeLoading, setCompositeLoading] = useState(false);

  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1200,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const croppedPixelsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [exportCropPx, setExportCropPx] = useState<{ w: number; h: number } | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Panel mode state
  const currentSidePanels = useMemo(() => {
    if (props.mode !== 'panels') return [];
    return props.cardDetail.panels
      .filter((p: Panel) => p.side === side)
      .sort((a: Panel, b: Panel) => a.panel_index - b.panel_index);
  }, [props.mode, props.mode === 'panels' ? props.cardDetail : null, side]);

  // The image URL the cropper operates on
  const imageUrl = props.mode === 'scan' ? props.scanUrl : composite?.dataUrl ?? null;
  const imageReady = props.mode === 'scan' ? true : (!compositeLoading && !!composite);
  const isLoading = props.mode === 'panels' && compositeLoading;

  // Scan mode: track natural dimensions for size feedback
  const [scanNaturalSize, setScanNaturalSize] = useState<{ w: number; h: number } | null>(null);

  const maxSquareCropPx = useMemo(() => {
    if (props.mode === 'scan' && scanNaturalSize) {
      return Math.min(scanNaturalSize.w, scanNaturalSize.h);
    }
    if (composite) return Math.min(composite.width, composite.height);
    return 0;
  }, [props.mode, composite, scanNaturalSize]);

  const displayScale = useMemo(() => {
    if (props.mode === 'scan') return 1;
    if (!composite) return 1;
    const stripZone = 0.54;
    const availableWidth = viewport.w - 80;
    const availableHeight = Math.min(Math.floor(viewport.h * stripZone), viewport.h - 40);
    const scaleX = composite.width > 0 ? availableWidth / composite.width : 1;
    const scaleY = composite.height > 0 ? availableHeight / composite.height : 1;
    return Math.min(1, scaleX, scaleY);
  }, [props.mode, composite, viewport]);

  // Build composite strip for panel mode
  useEffect(() => {
    if (props.mode !== 'panels') return;
    if (currentSidePanels.length === 0) { setComposite(null); return; }
    let cancelled = false;
    setCompositeLoading(true);
    buildCompositeStrip(props.cardDetail, currentSidePanels)
      .then((r) => { if (!cancelled) { setComposite(r); setCompositeLoading(false); } })
      .catch(() => { if (!cancelled) { setComposite(null); setCompositeLoading(false); } });
    return () => { cancelled = true; };
  }, [props.mode, props.mode === 'panels' ? props.cardDetail : null, side, currentSidePanels]);

  // Load scan natural size for scan mode
  useEffect(() => {
    if (props.mode !== 'scan') return;
    const img = new Image();
    img.onload = () => setScanNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = props.scanUrl;
  }, [props.mode, props.mode === 'scan' ? props.scanUrl : null]);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    croppedPixelsRef.current = null;
    setExportCropPx(null);
  }, [imageUrl]);

  const onCropComplete = useCallback(
    (
      _area: { x: number; y: number; width: number; height: number },
      croppedAreaPixels: { x: number; y: number; width: number; height: number }
    ) => {
      croppedPixelsRef.current = croppedAreaPixels;
      setExportCropPx({ w: Math.round(croppedAreaPixels.width), h: Math.round(croppedAreaPixels.height) });

      if (maxSquareCropPx < INSTAGRAM_SQUARE_MIN_PX) return;
      if (croppedAreaPixels.width >= INSTAGRAM_SQUARE_MIN_PX - 0.25) return;
      setZoom((z) => Math.max(CROPPER_MIN_ZOOM, z * (croppedAreaPixels.width / INSTAGRAM_SQUARE_MIN_PX)));
    },
    [maxSquareCropPx]
  );

  const handleSaveCrop = async () => {
    const pixels = croppedPixelsRef.current;
    if (!pixels) {
      setError('Adjust the crop slightly to register the selection.');
      return;
    }
    if (maxSquareCropPx >= INSTAGRAM_SQUARE_MIN_PX && pixels.width < INSTAGRAM_SQUARE_MIN_PX - 0.5) {
      setError(`Export would be below ${INSTAGRAM_SQUARE_MIN_PX}px — zoom out slightly.`);
      return;
    }

    setSaving(true);
    setError(null);

    let blob: Blob;
    try {
      if (props.mode === 'panels' && composite?.canvas) {
        blob = await extractSquareCropToBlob(composite.canvas, pixels);
      } else if (props.mode === 'scan') {
        blob = await extractSquareCropFromUrl(props.scanUrl, pixels);
      } else {
        setSaving(false);
        setError('No image source available');
        return;
      }
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : 'Could not extract crop');
      return;
    }

    const path = `${cardId}/social-crop-${crypto.randomUUID()}.jpg`;
    const { error: uploadErr } = await supabase.storage.from('derivatives').upload(path, blob, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
    });
    if (uploadErr) {
      setSaving(false);
      setError(uploadErr.message || 'Upload failed');
      return;
    }

    let panelId = 'scan';
    if (props.mode === 'panels' && composite) {
      panelId =
        panelIdForCompositeCrop(composite.panelOffsets, pixels, composite.height) ??
        currentSidePanels[0]?.id ?? 'unknown';
    } else if (props.mode === 'scan') {
      panelId = `scan:${props.scanId}`;
    }

    const { crop: savedCrop, error: saveErr } = await createSocialCrop({
      card_id: cardId,
      panel_id: panelId,
      crop_image_path: path,
    });

    setSaving(false);
    if (saveErr || !savedCrop) {
      setError(saveErr ?? 'Failed to save crop');
      return;
    }

    onCropSaved(savedCrop);
  };

  const noContent = props.mode === 'panels' && currentSidePanels.length === 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-xl overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Select a social media crop"
    >
      <div className="fixed top-0 right-0 z-[110] flex">
        {props.mode === 'panels' && (
          <button
            type="button"
            onClick={() => setSide((s) => (s === 'front' ? 'back' : 'front'))}
            className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-black/70 hover:bg-black/90 text-white transition-colors border-b border-l border-white/20"
            aria-label="Flip to other side"
          >
            <RotateCw className="h-6 w-6 sm:h-4 sm:w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-black/70 hover:bg-black/90 text-white transition-colors border-b border-l border-white/20"
          aria-label="Close"
        >
          <X className="h-6 w-6 sm:h-4 sm:w-4" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 flex-col pt-11 sm:pt-8">
        {error && (
          <div className="mx-4 mt-2 shrink-0 text-sm text-red-300 bg-red-950/50 rounded-md px-3 py-2 border border-red-500/30">
            {error}
          </div>
        )}

        {noContent ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm text-white/70">No panels on the {side} side.</p>
          </div>
        ) : (
          <div
            className="flex min-h-0 flex-1 flex-col items-stretch overflow-hidden px-4 sm:px-10"
            onClick={(e) => e.stopPropagation()}
          >
            {isLoading && (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-white/60" />
              </div>
            )}
            {imageReady && imageUrl && (
              <>
                <div className="flex min-h-0 flex-1 items-center justify-center py-2">
                  <div
                    className="relative overflow-hidden rounded-md bg-black"
                    style={
                      props.mode === 'panels' && composite
                        ? { width: composite.width * displayScale, height: composite.height * displayScale }
                        : { width: '100%', maxWidth: 900, height: '100%', maxHeight: '60vh' }
                    }
                  >
                    <Cropper
                      key={imageUrl}
                      image={imageUrl}
                      crop={crop}
                      zoom={zoom}
                      aspect={1}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={onCropComplete}
                      minZoom={CROPPER_MIN_ZOOM}
                      maxZoom={CROPPER_MAX_ZOOM}
                      onMediaLoaded={(mediaSize) => {
                        if (props.mode === 'scan') {
                          setScanNaturalSize({ w: mediaSize.naturalWidth, h: mediaSize.naturalHeight });
                        }
                      }}
                    />
                  </div>
                </div>
                <p className="shrink-0 pb-1 text-center text-[11px] text-white/50">
                  {props.mode === 'scan'
                    ? 'Frame a dramatic scene from the scan, then save'
                    : `${side === 'front' ? 'Front' : 'Back'} · Frame a dramatic scene, then save`}
                </p>
                {maxSquareCropPx > 0 && maxSquareCropPx < INSTAGRAM_SQUARE_MIN_PX && (
                  <p className="shrink-0 px-2 pb-2 text-center text-[11px] text-amber-200/90">
                    This image is smaller than {INSTAGRAM_SQUARE_MIN_PX}px; export will be below Instagram's recommended size.
                  </p>
                )}
                <div className="shrink-0 space-y-3 pb-4 pt-1 max-w-lg w-full mx-auto">
                  {exportCropPx && (
                    <p
                      className={cn(
                        'text-center text-xs tabular-nums',
                        maxSquareCropPx >= INSTAGRAM_SQUARE_MIN_PX && exportCropPx.w >= INSTAGRAM_SQUARE_MIN_PX
                          ? 'text-emerald-300/95'
                          : maxSquareCropPx >= INSTAGRAM_SQUARE_MIN_PX
                            ? 'text-amber-200/90'
                            : 'text-white/70'
                      )}
                    >
                      Export: {exportCropPx.w} × {exportCropPx.h} px
                      {maxSquareCropPx >= INSTAGRAM_SQUARE_MIN_PX && (
                        <span className="text-white/50 font-normal">
                          {' '}(aim ≥ {INSTAGRAM_SQUARE_MIN_PX} for a sharp IG square)
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
                  <Button
                    type="button"
                    className="w-full gap-2 bg-white text-black hover:bg-white/90"
                    onClick={handleSaveCrop}
                    disabled={saving || isLoading}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CropIcon className="h-4 w-4" />
                    )}
                    Save crop
                  </Button>
                </div>
              </>
            )}
            {!isLoading && !imageUrl && (
              <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-white/60">
                Could not load image for cropping.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/** Extract a square crop from an image URL (for scan mode). */
async function extractSquareCropFromUrl(
  url: string,
  cropArea: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Failed to load image'));
    i.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cropArea.width);
  canvas.height = Math.round(cropArea.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    img,
    cropArea.x, cropArea.y, cropArea.width, cropArea.height,
    0, 0, cropArea.width, cropArea.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.96
    );
  });
}
