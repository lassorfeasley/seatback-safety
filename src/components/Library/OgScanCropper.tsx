import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  X,
  Check,
  RotateCcw,
  RotateCw,
  Ruler,
} from 'lucide-react';
import { CropCanvas } from '@/components/PanelCropper/CropCanvas';
import { extractCropWithRotation } from '@/components/PanelCropper/utils';
import type { CropRegion, ImageDimensions } from '@/components/PanelCropper/types';

interface OgScanCropperProps {
  scanUrl: string;
  scanLabel: string;
  generating: boolean;
  /** Called with an optional blob: URL of the extracted crop region.
   *  If undefined, the full scan should be used as-is. */
  onGenerate: (croppedBlobUrl?: string) => void;
  onCancel: () => void;
}

export const OgScanCropper: React.FC<OgScanCropperProps> = ({
  scanUrl,
  scanLabel,
  generating,
  onGenerate,
  onCancel,
}) => {
  const [region, setRegion] = useState<CropRegion | null>(null);
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(null);
  const [rotation, setRotation] = useState(0);
  const [straightenMode, setStraightenMode] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const handleRegionAdd = useCallback((r: CropRegion) => setRegion(r), []);
  const handleRegionUpdate = useCallback((r: CropRegion) => setRegion(r), []);
  const handleRegionSelect = useCallback(() => {}, []);
  const handleRegionDelete = useCallback(() => setRegion(null), []);
  const handleImageLoad = useCallback((dims: ImageDimensions) => setImageDimensions(dims), []);
  const handleStraighten = useCallback((angleDelta: number) => {
    setRotation((r) => r + angleDelta);
    setStraightenMode(false);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!region) {
      onGenerate();
      return;
    }

    setExtracting(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = scanUrl;
      });

      const blob = await extractCropWithRotation(img, region, rotation, {
        format: 'jpeg',
        quality: 0.95,
      });

      const blobUrl = URL.createObjectURL(blob);
      onGenerate(blobUrl);
    } catch (err) {
      console.error('Failed to extract crop for OG:', err);
      onGenerate();
    } finally {
      setExtracting(false);
    }
  }, [region, rotation, scanUrl, onGenerate]);

  const busy = generating || extracting;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0 bg-card">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium">Crop for OG Image</h3>
          <span className="text-xs text-muted-foreground">{scanLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={busy}
            className="h-7 px-2 text-xs gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Canvas area */}
        <div className="flex-1 min-w-0 min-h-0 relative">
          <CropCanvas
            imageUrl={scanUrl}
            imageDimensions={imageDimensions}
            regions={region ? [region] : []}
            selectedRegionId={region?.id || null}
            lockDimensions={false}
            lockedWidth={null}
            lockedHeight={null}
            rotation={rotation}
            singleCropMode={true}
            straightenMode={straightenMode}
            onRegionAdd={handleRegionAdd}
            onRegionUpdate={handleRegionUpdate}
            onRegionSelect={handleRegionSelect}
            onRegionDelete={handleRegionDelete}
            onImageLoad={handleImageLoad}
            onStraighten={handleStraighten}
          />
        </div>

        {/* Right sidebar */}
        <div className="w-56 flex-shrink-0 border-l bg-card flex flex-col overflow-y-auto">
          {/* Rotation */}
          <div className="p-4 border-b flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rotation</span>
            <div className="flex items-center gap-1.5">
              <button
                className="flex items-center gap-1 px-2 py-1 bg-background hover:bg-accent border border-border rounded-md text-xs font-medium transition-colors"
                onClick={() => setRotation((r) => {
                  const base = Math.round(r / 90) * 90;
                  const f = r - base;
                  return ((base - 90 + 360) % 360) + f;
                })}
                title="Rotate 90° counter-clockwise"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <button
                className="flex items-center gap-1 px-2 py-1 bg-background hover:bg-accent border border-border rounded-md text-xs font-medium transition-colors"
                onClick={() => setRotation((r) => {
                  const base = Math.round(r / 90) * 90;
                  const f = r - base;
                  return ((base + 90) % 360) + f;
                })}
                title="Rotate 90° clockwise"
              >
                <RotateCw className="h-3 w-3" />
              </button>
              <button
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 border rounded-md text-xs font-medium transition-colors ${
                  straightenMode
                    ? 'bg-cyan-600 border-cyan-600 text-white hover:bg-cyan-700'
                    : 'bg-background hover:bg-accent border-border'
                }`}
                onClick={() => setStraightenMode((m) => !m)}
                title="Click two points on a straight edge to auto-straighten"
              >
                <Ruler className="h-3 w-3" />
                Straighten
              </button>
            </div>
            {straightenMode && (
              <p className="text-[11px] text-muted-foreground leading-tight">
                Click two points on a straight edge to auto-align.
              </p>
            )}
          </div>

          {/* Crop info */}
          <div className="p-4 border-b flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Crop Region</span>
            {region ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground font-mono">
                  {Math.round(region.width)} &times; {Math.round(region.height)}px
                </p>
                <button
                  onClick={() => setRegion(null)}
                  className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground py-1 rounded-md hover:bg-muted transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Redraw
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Draw a crop region on the scan, or generate with no crop to use the full image.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="p-4 flex flex-col gap-2 mt-auto">
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={busy}
              className="w-full gap-1.5"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {region ? 'Generate OG from Crop' : 'Generate OG (full image)'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={busy}
              className="w-full gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
