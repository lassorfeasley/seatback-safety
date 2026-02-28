import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Scissors,
  RotateCcw,
  RotateCw,
  Lock,
  Unlock,
  Ruler,
} from 'lucide-react';
import { CropCanvas } from '@/components/PanelCropper/CropCanvas';
import type { CropStepProps, LibraryImage } from './types';
import type { CropRegion, ImageDimensions } from '@/components/PanelCropper/types';

export const CropStep: React.FC<CropStepProps> = ({
  panelCount,
  slots,
  images,
  cropWidth,
  cropHeight,
  activeSlot,
  selectedImageId,
  onSelectSlot,
  onSelectImage,
  onCancelCrop,
  onConfirmCrop,
  onClearSlot,
  onResetWidthLock,
  onSetCropDimensions,
  onRotationChange: _onRotationChange,
  onBack,
  onContinue,
  continueLabel,
}) => {
  const filledCount = slots.filter((s) => s.cropRegion !== null).length;
  const totalCount = slots.length;
  const allFilled = filledCount === totalCount;

  // If we're in a crop session, show the crop UI
  if (activeSlot) {
    const oppositeSide = activeSlot.side === 'front' ? 'back' : 'front';
    const oppositeSlot = slots.find(
      (s) => s.panelIndex === activeSlot.panelIndex && s.side === oppositeSide
    );

    return (
      <CropSession
        activeSlot={activeSlot}
        images={images}
        selectedImageId={selectedImageId}
        cropWidth={cropWidth}
        cropHeight={cropHeight}
        existingSlot={slots.find(
          (s) => s.panelIndex === activeSlot.panelIndex && s.side === activeSlot.side
        )}
        oppositeSlot={oppositeSlot}
        onSelectImage={onSelectImage}
        onCancelCrop={onCancelCrop}
        onConfirmCrop={onConfirmCrop}
        onResetWidthLock={onResetWidthLock}
        onSetCropDimensions={onSetCropDimensions}
      />
    );
  }

  const frontSlots = Array.from({ length: panelCount }, (_, i) =>
    slots.find((s) => s.panelIndex === i && s.side === 'front') || null
  );
  const backSlots = Array.from({ length: panelCount }, (_, i) =>
    slots.find((s) => s.panelIndex === i && s.side === 'back') || null
  );

  const frontFilled = frontSlots.filter((s) => s?.cropRegion !== null).length;
  const backFilled = backSlots.filter((s) => s?.cropRegion !== null).length;

  // Shared height from the first cropped panel (any side).
  // Per-panel-index width from whichever side of that index was cropped first.
  const { referenceHeight, panelWidths } = useMemo(() => {
    const filledSlots = slots.filter((s) => s.cropRegion !== null);
    const refHeight = filledSlots.length > 0 ? filledSlots[0].cropRegion!.height : null;

    const widths: Record<number, number> = {};
    for (let i = 0; i < panelCount; i++) {
      const front = frontSlots[i]?.cropRegion;
      const back = backSlots[i]?.cropRegion;
      if (front) widths[i] = front.width;
      else if (back) widths[i] = back.width;
    }

    return { referenceHeight: refHeight, panelWidths: widths };
  }, [slots, panelCount, frontSlots, backSlots]);

  const DEFAULT_ASPECT = 3 / 4;

  // Compute aspect ratio (width/height) for a given panel index
  const getAspectRatio = useCallback(
    (panelIdx: number) => {
      if (referenceHeight && panelWidths[panelIdx] != null) {
        return panelWidths[panelIdx] / referenceHeight;
      }
      if (referenceHeight && Object.keys(panelWidths).length > 0) {
        const avgWidth =
          Object.values(panelWidths).reduce((a, b) => a + b, 0) /
          Object.values(panelWidths).length;
        return avgWidth / referenceHeight;
      }
      return DEFAULT_ASPECT;
    },
    [referenceHeight, panelWidths]
  );

  return (
    <div className="flex flex-col h-full p-3 gap-2">
      {/* Compact toolbar: nav + title + progress + lock info */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <Button variant="outline" size="sm" onClick={onBack} className="h-8 gap-1.5 px-2.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>

        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-sm font-semibold whitespace-nowrap">Crop Panels</span>
          <div className="flex-1 max-w-[200px] bg-muted rounded-full h-1.5">
            <div
              className="bg-primary rounded-full h-1.5 transition-all duration-300"
              style={{ width: `${totalCount > 0 ? (filledCount / totalCount) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filledCount}/{totalCount}
          </span>
          {cropWidth != null && cropHeight != null && (
            <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
              <Lock className="h-3 w-3" />
              <span className="font-mono">{cropWidth}&times;{cropHeight}</span>
            </span>
          )}
        </div>

        <Button size="sm" onClick={onContinue} disabled={filledCount === 0} className="h-8 gap-1.5 px-2.5">
          {continueLabel ?? (allFilled ? 'Continue' : 'Save Progress')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Front side — fills half the remaining space */}
      <div className="flex-1 min-h-0 flex flex-col gap-1">
        <div className="flex items-center justify-between px-1 flex-shrink-0">
          <span className="text-xs font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Front Side
          </span>
          <span className="text-[10px] text-muted-foreground">
            {frontFilled}/{panelCount}
          </span>
        </div>
        <div className="flex-1 min-h-0 flex items-stretch justify-center">
          {frontSlots.map((slot, panelIdx) => (
            <PanelPlaceholder
              key={panelIdx}
              panelIndex={panelIdx}
              side="front"
              slot={slot}
              totalPanels={panelCount}
              aspectRatio={getAspectRatio(panelIdx)}
              onClick={() => onSelectSlot(panelIdx, 'front')}
              onClear={() => onClearSlot(panelIdx, 'front')}
            />
          ))}
        </div>
      </div>

      {/* Back side — fills other half (reversed order) */}
      <div className="flex-1 min-h-0 flex flex-col gap-1">
        <div className="flex items-center justify-between px-1 flex-shrink-0">
          <span className="text-xs font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Back Side
            <span className="text-[10px] text-muted-foreground font-normal ml-1">flipped</span>
          </span>
          <span className="text-[10px] text-muted-foreground">
            {backFilled}/{panelCount}
          </span>
        </div>
        <div className="flex-1 min-h-0 flex items-stretch justify-center">
          {Array.from({ length: panelCount }, (_, rawI) => {
            const panelIdx = panelCount - 1 - rawI;
            return (
              <PanelPlaceholder
                key={panelIdx}
                panelIndex={panelIdx}
                side="back"
                slot={backSlots[panelIdx]}
                totalPanels={panelCount}
                aspectRatio={getAspectRatio(panelIdx)}
                onClick={() => onSelectSlot(panelIdx, 'back')}
                onClear={() => onClearSlot(panelIdx, 'back')}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── PanelPlaceholder ─────────────────────────────────────────────

interface PanelPlaceholderProps {
  panelIndex: number;
  side: 'front' | 'back';
  slot: { cropRegion: CropRegion | null; thumbnailUrl: string | null } | null;
  totalPanels: number;
  aspectRatio: number;
  onClick: () => void;
  onClear: () => void;
}

const PanelPlaceholder: React.FC<PanelPlaceholderProps> = ({
  panelIndex,
  side,
  slot,
  totalPanels,
  aspectRatio,
  onClick,
  onClear,
}) => {
  const isFilled = slot?.cropRegion !== null;
  const isFirst = side === 'front' ? panelIndex === 0 : panelIndex === totalPanels - 1;
  const isLast = side === 'front' ? panelIndex === totalPanels - 1 : panelIndex === 0;

  const roundedClass = [
    isFirst ? 'rounded-l-lg' : '',
    isLast ? 'rounded-r-lg' : '',
  ].join(' ');

  return (
    <div
      className={`
        relative group cursor-pointer transition-all h-full flex-shrink-0
        ${isFilled ? '' : 'hover:bg-muted/40'}
        ${roundedClass}
      `}
      style={{ overflow: 'hidden', aspectRatio: `${aspectRatio}` }}
      onClick={onClick}
    >
      <div
        className={`
          relative w-full h-full flex flex-col items-center justify-center
          border-y-2 transition-colors
          ${isFirst ? 'border-l-2' : 'border-l'}
          ${isLast ? 'border-r-2' : 'border-r'}
          ${isFilled
            ? 'border-muted bg-muted/10'
            : 'border-dashed border-muted-foreground/20 bg-muted/5'
          }
          ${roundedClass}
        `}
      >
        {isFilled && slot?.thumbnailUrl ? (
          <>
            <img
              src={slot.thumbnailUrl}
              alt={`Panel ${panelIndex + 1} ${side}`}
              className={`w-full h-full object-contain ${roundedClass}`}
            />
            <div className={`absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${roundedClass}`}>
              <Scissors className="h-4 w-4 text-white" />
              <span className="text-white text-xs font-medium">Re-crop</span>
            </div>
            <button
              className="absolute top-1.5 right-1.5 p-1 bg-destructive/90 hover:bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              title="Clear crop"
            >
              <X className="w-3 h-3" />
            </button>
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1">
              <div className="flex items-center gap-1">
                <Check className="h-3 w-3 text-green-400" />
                <span className="text-[10px] font-medium text-white/90">
                  Panel {panelIndex + 1}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1.5 p-2">
            <div className="w-8 h-8 rounded-full border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
              <Scissors className="h-3.5 w-3.5 text-muted-foreground/30" />
            </div>
            <div className="text-center">
              <p className="text-[11px] font-medium text-muted-foreground/60">
                Panel {panelIndex + 1}
              </p>
              <p className="text-[10px] text-muted-foreground/40">
                Click to crop
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── CropSession ─────────────────────────────────────────────────

interface CropSessionProps {
  activeSlot: { panelIndex: number; side: 'front' | 'back' };
  images: LibraryImage[];
  selectedImageId: string | null;
  cropWidth: number | null;
  cropHeight: number | null;
  existingSlot: { imageId: string | null; cropRegion: CropRegion | null } | undefined;
  oppositeSlot: { imageId: string | null; cropRegion: CropRegion | null } | undefined;
  onSelectImage: (imageId: string) => void;
  onCancelCrop: () => void;
  onConfirmCrop: (
    panelIndex: number,
    side: 'front' | 'back',
    imageId: string,
    region: CropRegion,
    thumbnailUrl: string,
    rotation: number
  ) => void;
  onResetWidthLock: (panelIndex: number, side: 'front' | 'back') => void;
  onSetCropDimensions: (width: number, height: number) => void;
}

const CropSession: React.FC<CropSessionProps> = ({
  activeSlot,
  images,
  selectedImageId,
  cropWidth: _cropWidth,
  cropHeight,
  existingSlot,
  oppositeSlot,
  onSelectImage,
  onCancelCrop,
  onConfirmCrop,
  onResetWidthLock,
  onSetCropDimensions,
}) => {
  // Local state for the crop region being drawn
  const [region, setRegion] = useState<CropRegion | null>(
    existingSlot?.cropRegion || null
  );
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(null);

  const selectedImage = images.find((i) => i.id === selectedImageId);

  // Rotation controls for the selected image during crop
  const [localRotation, setLocalRotation] = useState(selectedImage?.rotation || 0);

  // Straighten tool
  const [straightenMode, setStraightenMode] = useState(false);
  const handleStraighten = useCallback((angleDelta: number) => {
    setLocalRotation((r) => r + angleDelta);
    setStraightenMode(false);
  }, []);

  // Sync rotation when image changes
  useEffect(() => {
    if (selectedImage) {
      setLocalRotation(selectedImage.rotation);
    }
  }, [selectedImage]);

  // Reset region when image changes (unless it's the same image the slot already has)
  useEffect(() => {
    if (selectedImageId !== existingSlot?.imageId) {
      setRegion(null);
    }
  }, [selectedImageId, existingSlot?.imageId]);

  // ── Constraint logic ──
  // Height from the first crop is shared by all panels.
  // Width is shared between opposite faces of the same panel index.
  const hasReferenceHeight = cropHeight != null;
  const oppositeWidth = oppositeSlot?.cropRegion?.width ?? null;

  // Both dimensions locked: opposite face already has a crop (we know both W and H)
  const dimensionsLocked = hasReferenceHeight && oppositeWidth != null;
  // Height-only constraint: reference height exists but no opposite face width yet
  const heightConstrained = hasReferenceHeight && oppositeWidth == null;
  // Fully free: first crop ever (no reference height)
  // hasReferenceHeight used in dimensionsLocked/heightConstrained above

  const handleRegionAdd = useCallback(
    (newRegion: CropRegion) => {
      setRegion(newRegion);
    },
    []
  );

  const handleRegionUpdate = useCallback((updated: CropRegion) => {
    setRegion(updated);
  }, []);

  const handleRegionSelect = useCallback(() => {}, []);

  const handleRegionDelete = useCallback(() => {
    setRegion(null);
  }, []);

  const handleImageLoad = useCallback((dims: ImageDimensions) => {
    setImageDimensions(dims);
  }, []);

  // Generate thumbnail and confirm — uses a single small canvas
  // instead of creating a huge full-resolution rotated intermediate.
  const handleConfirm = useCallback(async () => {
    if (!region || !selectedImageId || !selectedImage) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = selectedImage.imageUrl;
    });

    const radians = (localRotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const boundsW = img.width * cos + img.height * sin;
    const boundsH = img.width * sin + img.height * cos;

    const thumbCanvas = document.createElement('canvas');
    const maxW = 300;
    const drawScale = Math.min(1, maxW / region.width);
    thumbCanvas.width = Math.round(region.width * drawScale);
    thumbCanvas.height = Math.round(region.height * drawScale);
    const thumbCtx = thumbCanvas.getContext('2d');
    if (thumbCtx) {
      thumbCtx.scale(drawScale, drawScale);
      thumbCtx.translate(-region.x, -region.y);
      thumbCtx.translate(boundsW / 2, boundsH / 2);
      thumbCtx.rotate(radians);
      thumbCtx.drawImage(img, -img.width / 2, -img.height / 2);
    }

    const thumbnailUrl = thumbCanvas.toDataURL('image/jpeg', 0.8);

    onSetCropDimensions(region.width, region.height);

    onConfirmCrop(
      activeSlot.panelIndex,
      activeSlot.side,
      selectedImageId,
      region,
      thumbnailUrl,
      localRotation
    );
  }, [region, selectedImageId, selectedImage, localRotation, activeSlot, onSetCropDimensions, onConfirmCrop]);

  const sideLabel = activeSlot.side === 'front' ? 'Front' : 'Back';
  const sideColor = activeSlot.side === 'front' ? 'bg-blue-500' : 'bg-amber-500';

  // Build the constraint description for the header
  let constraintMessage: React.ReactNode = null;
  if (dimensionsLocked) {
    constraintMessage = (
      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5" />
        Crop locked to{' '}
        <span className="font-mono font-medium">
          {oppositeWidth} &times; {cropHeight}px
        </span>
        {' '}(matching opposite face)
      </p>
    );
  } else if (heightConstrained) {
    constraintMessage = (
      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5" />
        Height locked to{' '}
        <span className="font-mono font-medium">{cropHeight}px</span>
        {' '}&mdash; set the width for this panel
      </p>
    );
  } else {
    constraintMessage = (
      <p className="text-sm text-muted-foreground">
        Draw your first crop to set the shared height for all panels
      </p>
    );
  }

  // Build the instruction text for the crop canvas card
  // Instruction varies by constraint mode — used in UI below if needed

  return (
    <div className="flex h-full">
      {/* Canvas — fills viewport */}
      <div className="flex-1 min-w-0 min-h-0 relative">
        {selectedImage ? (
          <CropCanvas
            imageUrl={selectedImage.imageUrl}
            imageDimensions={imageDimensions}
            regions={region ? [region] : []}
            selectedRegionId={region?.id || null}
            lockDimensions={dimensionsLocked}
            lockedWidth={dimensionsLocked ? oppositeWidth : null}
            lockedHeight={dimensionsLocked ? cropHeight : null}
            constrainHeight={heightConstrained ? cropHeight : null}
            rotation={localRotation}
            singleCropMode={true}
            straightenMode={straightenMode}
            panelSide={activeSlot.side}
            onRegionAdd={handleRegionAdd}
            onRegionUpdate={handleRegionUpdate}
            onRegionSelect={handleRegionSelect}
            onRegionDelete={handleRegionDelete}
            onImageLoad={handleImageLoad}
            onStraighten={handleStraighten}
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-neutral-900 text-muted-foreground text-sm">
            Select a scan image to begin cropping
          </div>
        )}
      </div>

      {/* Right sidebar — controls */}
      <div className="w-64 flex-shrink-0 border-l bg-card flex flex-col overflow-y-auto">
        {/* Panel info + actions */}
        <div className="p-4 border-b flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sideColor}`} />
            <span className="text-sm font-semibold">
              Panel {activeSlot.panelIndex + 1} {sideLabel}
            </span>
          </div>
          {constraintMessage}
          {dimensionsLocked && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onResetWidthLock(activeSlot.panelIndex, activeSlot.side);
                setRegion(null);
              }}
              className="w-full gap-1.5 text-destructive hover:text-destructive"
            >
              <Unlock className="h-3.5 w-3.5" />
              Reset width lock
            </Button>
          )}
        </div>

        {/* Scan picker */}
        <div className="p-4 border-b flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Source Scan</span>
          <div className="flex gap-2 flex-wrap">
            {images.map((img) => (
              <button
                key={img.id}
                className={`
                  flex-shrink-0 w-14 h-14 rounded-md overflow-hidden border-2 transition-all
                  ${selectedImageId === img.id
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-muted hover:border-primary/50'
                  }
                `}
                onClick={() => onSelectImage(img.id)}
              >
                <img
                  src={img.thumbnailUrl ?? img.imageUrl}
                  alt={img.label}
                  className="w-full h-full object-cover"
                  style={{ transform: `rotate(${img.rotation}deg)` }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Rotation */}
        {selectedImage && (
          <div className="p-4 border-b flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rotation</span>
            <RotationStrip rotation={localRotation} onRotationChange={setLocalRotation} />
          </div>
        )}

        {/* Straighten tool */}
        {selectedImage && (
          <div className={`p-4 border-b flex flex-col gap-2 transition-colors ${straightenMode ? 'bg-cyan-600 border-cyan-600' : ''}`}>
            <span className={`text-xs font-medium uppercase tracking-wider ${straightenMode ? 'text-white' : 'text-muted-foreground'}`}>Straighten</span>
            <Button
              variant={straightenMode ? 'outline' : 'outline'}
              size="sm"
              onClick={() => setStraightenMode((m) => !m)}
              className={`w-full gap-1.5 ${straightenMode ? 'bg-white hover:bg-white/90 text-cyan-700 border-white' : ''}`}
            >
              <Ruler className="h-3.5 w-3.5" />
              {straightenMode ? 'Click two points on an edge…' : 'Straighten Edge'}
            </Button>
            {straightenMode && (
              <p className="text-[11px] text-white/80 leading-tight">
                Click two points along a straight edge (like the card border). The image will auto-rotate to make that line perfectly vertical or horizontal.
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="p-4 mt-auto flex flex-col gap-2">
          {region && (
            <Button variant="outline" size="sm" onClick={() => setRegion(null)} className="w-full gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Redraw
            </Button>
          )}
          <Button size="sm" onClick={handleConfirm} disabled={!region || !selectedImageId} className="w-full gap-1.5">
            <Check className="h-3.5 w-3.5" />
            Confirm Crop
          </Button>
          <Button variant="outline" size="sm" onClick={onCancelCrop} className="w-full gap-1.5">
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── RotationStrip ────────────────────────────────────────────────

const RotationStrip: React.FC<{
  rotation: number;
  onRotationChange: React.Dispatch<React.SetStateAction<number>>;
}> = ({ rotation, onRotationChange }) => {
  const coarseBase = Math.round(rotation / 90) * 90;
  const fine = rotation - coarseBase;

  return (
    <div className="flex flex-col gap-2">
      {/* 90° buttons + numeric input */}
      <div className="flex items-center gap-1.5">
        <button
          className="flex items-center gap-1 px-2 py-1 bg-background hover:bg-accent border border-border rounded-md text-xs font-medium transition-colors"
          onClick={() => onRotationChange((r) => {
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
          onClick={() => onRotationChange((r) => {
            const base = Math.round(r / 90) * 90;
            const f = r - base;
            return ((base + 90) % 360) + f;
          })}
          title="Rotate 90° clockwise"
        >
          <RotateCw className="h-3 w-3" />
        </button>
        <input
          type="number"
          value={Math.round(rotation * 10) / 10}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onRotationChange(((v % 360) + 360) % 360);
          }}
          className="flex-1 min-w-0 px-1.5 py-1 text-xs font-mono border border-border rounded-md bg-background text-center"
          step={0.1}
        />
        <span className="text-xs text-muted-foreground">°</span>
        {rotation !== 0 && (
          <button
            className="px-1.5 py-1 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors whitespace-nowrap"
            onClick={() => onRotationChange(0)}
            title="Reset rotation"
          >
            Reset
          </button>
        )}
      </div>
      {/* Fine-tune slider */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">-15°</span>
        <input
          type="range"
          min={-15}
          max={15}
          step={0.1}
          value={fine}
          onChange={(e) => {
            const newFine = parseFloat(e.target.value);
            onRotationChange(coarseBase + newFine);
          }}
          className="flex-1 h-1.5 accent-primary cursor-pointer"
          title="Fine-tune rotation"
        />
        <span className="text-[10px] text-muted-foreground">+15°</span>
      </div>
    </div>
  );
};
