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

  const [viewportH, setViewportH] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 800
  );
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const croppedPixelsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [exportCropPx, setExportCropPx] = useState<{ w: number; h: number } | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSidePanels = useMemo(() => {
    if (props.mode !== 'panels') return [];
    return props.cardDetail.panels
      .filter((p: Panel) => p.side === side)
      .sort((a: Panel, b: Panel) => a.panel_index - b.panel_index);
  }, [props.mode, props.mode === 'panels' ? props.cardDetail : null, side]);

  const imageUrl = props.mode === 'scan' ? props.scanUrl : composite?.dataUrl ?? null;
  const imageReady = props.mode === 'scan' ? true : (!compositeLoading && !!composite);
  const isLoading = props.mode === 'panels' && compositeLoading;

  const [scanNaturalSize, setScanNaturalSize] = useState<{ w: number; h: number } | null>(null);

  const maxSquareCropPx = useMemo(() => {
    if (props.mode === 'scan' && scanNaturalSize) {
      return Math.min(scanNaturalSize.w, scanNaturalSize.h);
    }
    if (composite) return Math.min(composite.width, composite.height);
    return 0;
  }, [props.mode, composite, scanNaturalSize]);

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

  useEffect(() => {
    if (props.mode !== 'scan') return;
    const img = new Image();
    img.onload = () => setScanNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = props.scanUrl;
  }, [props.mode, props.mode === 'scan' ? props.scanUrl : null]);

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', onResize);
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

  const cropSizePx = Math.max(200, Math.floor(viewportH / 2));

  const mainRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const preventScroll = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', preventScroll, { passive: false });
    return () => el.removeEventListener('wheel', preventScroll);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex bg-neutral-900 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Select a social media crop"
    >
      {/* ── Main area: cropper fills entire space ── */}
      <div ref={mainRef} className="flex-1 min-w-0 min-h-0 relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-white/60" />
          </div>
        )}

        {noContent && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-white/50">No panels on the {side} side.</p>
          </div>
        )}

        {!isLoading && !noContent && imageReady && imageUrl && (
          <Cropper
            key={imageUrl}
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropSize={{ width: cropSizePx, height: cropSizePx }}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            minZoom={CROPPER_MIN_ZOOM}
            maxZoom={CROPPER_MAX_ZOOM}
            style={{
              containerStyle: { width: '100%', height: '100%', background: '#171717' },
            }}
            onMediaLoaded={(mediaSize) => {
              if (props.mode === 'scan') {
                setScanNaturalSize({ w: mediaSize.naturalWidth, h: mediaSize.naturalHeight });
              }
            }}
          />
        )}

        {!isLoading && !noContent && !imageUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
            Could not load image for cropping.
          </div>
        )}
      </div>

      {/* ── Right sidebar ── */}
      <div className="w-64 flex-shrink-0 border-l bg-card flex flex-col overflow-y-auto">
        {/* Side toggle (panel mode) */}
        {props.mode === 'panels' && (
          <div className="p-4 border-b flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Side</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setSide('front')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors border',
                  side === 'front'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                )}
              >
                Front
              </button>
              <button
                type="button"
                onClick={() => setSide('back')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors border',
                  side === 'back'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent border-border'
                )}
              >
                <RotateCw className="h-3 w-3" />
                Back
              </button>
            </div>
          </div>
        )}

        {/* Zoom */}
        {imageReady && imageUrl && !noContent && (
          <div className="p-4 border-b flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Zoom</span>
              <span className="text-xs tabular-nums text-muted-foreground">{zoom.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min={CROPPER_MIN_ZOOM}
              max={CROPPER_MAX_ZOOM}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        )}

        {/* Export info */}
        {imageReady && imageUrl && !noContent && exportCropPx && (
          <div className="p-4 border-b flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Export Size</span>
            <p
              className={cn(
                'text-sm tabular-nums font-medium',
                maxSquareCropPx >= INSTAGRAM_SQUARE_MIN_PX && exportCropPx.w >= INSTAGRAM_SQUARE_MIN_PX
                  ? 'text-emerald-600'
                  : maxSquareCropPx >= INSTAGRAM_SQUARE_MIN_PX
                    ? 'text-amber-600'
                    : 'text-foreground'
              )}
            >
              {exportCropPx.w} × {exportCropPx.h} px
            </p>
            {maxSquareCropPx >= INSTAGRAM_SQUARE_MIN_PX && (
              <p className="text-[11px] text-muted-foreground">
                Aim ≥ {INSTAGRAM_SQUARE_MIN_PX}px for a sharp IG square
              </p>
            )}
            {maxSquareCropPx > 0 && maxSquareCropPx < INSTAGRAM_SQUARE_MIN_PX && (
              <p className="text-[11px] text-amber-600">
                Source is smaller than {INSTAGRAM_SQUARE_MIN_PX}px
              </p>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-4 mt-4 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 border border-destructive/30">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="p-4 flex flex-col gap-3 mt-auto">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {props.mode === 'scan'
              ? 'Frame a dramatic scene from the scan, then save.'
              : 'Drag and zoom to frame a dramatic scene, then save.'}
          </p>
          <Button
            type="button"
            size="sm"
            onClick={handleSaveCrop}
            disabled={saving || isLoading || noContent || !imageReady || !imageUrl}
            className="w-full gap-1.5"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CropIcon className="h-3.5 w-3.5" />
            )}
            Save crop
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="w-full gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
        </div>
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
