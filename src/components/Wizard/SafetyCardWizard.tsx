import React, { useState, useCallback, useMemo } from 'react';
import { StepIndicator } from './StepIndicator';
import { PanelCountStep } from './PanelCountStep';
import { ImageLibraryStep } from './ImageLibraryStep';
import { CropStep } from './CropStep';
import { FoldStep } from './FoldStep';
import { extractCropWithRotation } from '@/components/PanelCropper/utils';
import { saveCardToLibrary } from '@/lib/safetyCardService';
import type { WizardState, PanelSlot, PanelSide, LibraryImage } from './types';
import type { CropRegion } from '@/components/PanelCropper/types';
import type { Crease, Side, FoldDirection } from '@/components/FoldEditor/types';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Generate default creases for a given panel count
function generateDefaultCreases(panelCount: number): Crease[] {
  const creases: Crease[] = [];
  for (let i = 0; i < panelCount - 1; i++) {
    creases.push({
      side: 'front',
      between_panel: i,
      fold_direction: i % 2 === 0 ? 'forward' : 'backward',
      unfold_sequence: i,
    });
    creases.push({
      side: 'back',
      between_panel: i,
      fold_direction: i % 2 === 0 ? 'backward' : 'forward',
      unfold_sequence: i,
    });
  }
  return creases;
}

// Generate empty slots for a given panel count
function generateSlots(panelCount: number): PanelSlot[] {
  const slots: PanelSlot[] = [];
  for (let i = 0; i < panelCount; i++) {
    slots.push({ panelIndex: i, side: 'front', imageId: null, cropRegion: null, thumbnailUrl: null });
    slots.push({ panelIndex: i, side: 'back', imageId: null, cropRegion: null, thumbnailUrl: null });
  }
  return slots;
}

interface SafetyCardWizardProps {
  onSaveComplete?: (cardId: string) => void;
  onBackToLibrary?: () => void;
}

export const SafetyCardWizard: React.FC<SafetyCardWizardProps> = ({
  onSaveComplete,
  onBackToLibrary,
}) => {
  const [state, setState] = useState<WizardState>({
    currentStep: 1,
    panelCount: 0,
    images: [],
    slots: [],
    cropWidth: null,
    cropHeight: null,
    creases: [],
    cover: { spreadIndex: 0, side: 'front' },
    activeSlot: null,
    selectedImageId: null,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');

  // ─── Derived data ──────────────────────────────────────────────

  const filledSlots = useMemo(
    () => state.slots.filter((s) => s.cropRegion !== null).length,
    [state.slots]
  );

  const totalSlots = state.slots.length;

  // ─── Step navigation ──────────────────────────────────────────

  const goToStep = useCallback((step: 1 | 2 | 3 | 4) => {
    setState((prev) => ({ ...prev, currentStep: step, activeSlot: null, selectedImageId: null }));
  }, []);

  // ─── Step 1: Panel Count ──────────────────────────────────────

  const handlePanelCountConfirm = useCallback((count: number) => {
    setState((prev) => {
      // If count changed, regenerate slots and creases, preserving existing data where possible
      const newSlots = generateSlots(count);
      const newCreases = generateDefaultCreases(count);

      // Carry over existing slot data for panels that still exist
      for (const newSlot of newSlots) {
        const existing = prev.slots.find(
          (s) => s.panelIndex === newSlot.panelIndex && s.side === newSlot.side
        );
        if (existing) {
          newSlot.imageId = existing.imageId;
          newSlot.cropRegion = existing.cropRegion;
          newSlot.thumbnailUrl = existing.thumbnailUrl;
        }
      }

      // Carry over existing crease settings for positions that still exist
      for (let i = 0; i < newCreases.length; i++) {
        const nc = newCreases[i];
        const existing = prev.creases.find(
          (c) => c.side === nc.side && c.between_panel === nc.between_panel
        );
        if (existing) {
          newCreases[i] = { ...existing };
        }
      }

      return {
        ...prev,
        panelCount: count,
        slots: newSlots,
        creases: newCreases,
        currentStep: 2,
      };
    });
  }, []);

  // ─── Step 2: Image Library ────────────────────────────────────

  const handleAddImages = useCallback((files: FileList) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setState((prev) => {
      const newImages: LibraryImage[] = imageFiles.map((file, i) => ({
        id: generateId(),
        imageFile: file,
        imageUrl: URL.createObjectURL(file),
        imageDimensions: null,
        label: `Image ${prev.images.length + i + 1}`,
        rotation: 0,
      }));
      return { ...prev, images: [...prev.images, ...newImages] };
    });
  }, []);

  const handleDeleteImage = useCallback((imageId: string) => {
    setState((prev) => {
      const img = prev.images.find((i) => i.id === imageId);
      if (img) URL.revokeObjectURL(img.imageUrl);

      // Also clear any slots that reference this image
      const updatedSlots = prev.slots.map((slot) =>
        slot.imageId === imageId
          ? { ...slot, imageId: null, cropRegion: null, thumbnailUrl: null }
          : slot
      );

      return {
        ...prev,
        images: prev.images.filter((i) => i.id !== imageId),
        slots: updatedSlots,
      };
    });
  }, []);

  const handleRotationChange = useCallback((imageId: string, rotation: number) => {
    setState((prev) => ({
      ...prev,
      images: prev.images.map((img) =>
        img.id === imageId ? { ...img, rotation } : img
      ),
    }));
  }, []);

  // ─── Step 3: Crop Panels ─────────────────────────────────────

  const handleSelectSlot = useCallback((panelIndex: number, side: PanelSide) => {
    setState((prev) => ({
      ...prev,
      activeSlot: { panelIndex, side },
      selectedImageId: prev.images[0]?.id || null,
    }));
  }, []);

  const handleSelectImage = useCallback((imageId: string) => {
    setState((prev) => ({ ...prev, selectedImageId: imageId }));
  }, []);

  const handleCancelCrop = useCallback(() => {
    setState((prev) => ({ ...prev, activeSlot: null, selectedImageId: null }));
  }, []);

  const handleConfirmCrop = useCallback(
    (
      panelIndex: number,
      side: PanelSide,
      imageId: string,
      region: CropRegion,
      thumbnailUrl: string
    ) => {
      setState((prev) => ({
        ...prev,
        slots: prev.slots.map((slot) =>
          slot.panelIndex === panelIndex && slot.side === side
            ? { ...slot, imageId, cropRegion: region, thumbnailUrl }
            : slot
        ),
        activeSlot: null,
        selectedImageId: null,
      }));
    },
    []
  );

  const handleClearSlot = useCallback((panelIndex: number, side: PanelSide) => {
    setState((prev) => ({
      ...prev,
      slots: prev.slots.map((slot) =>
        slot.panelIndex === panelIndex && slot.side === side
          ? { ...slot, imageId: null, cropRegion: null, thumbnailUrl: null }
          : slot
      ),
    }));
  }, []);

  const handleSetCropDimensions = useCallback((width: number, height: number) => {
    setState((prev) => ({
      ...prev,
      cropWidth: width,
      cropHeight: prev.cropHeight ?? height,
    }));
  }, []);

  // ─── Step 4: Fold Structure ───────────────────────────────────

  const handleCreaseChange = useCallback(
    (betweenPanel: number, direction: FoldDirection, side: Side) => {
      setState((prev) => {
        const oppositeDirection: FoldDirection =
          direction === 'forward' ? 'backward' : 'forward';
        const oppositeSide: Side = side === 'front' ? 'back' : 'front';

        return {
          ...prev,
          creases: prev.creases.map((c) => {
            if (c.between_panel === betweenPanel && c.side === side) {
              return { ...c, fold_direction: direction };
            }
            if (c.between_panel === betweenPanel && c.side === oppositeSide) {
              return { ...c, fold_direction: oppositeDirection };
            }
            return c;
          }),
        };
      });
    },
    []
  );

  const handleSequenceChange = useCallback(
    (betweenPanel: number, newSequence: number, _side: Side) => {
      setState((prev) => {
        const currentCrease = prev.creases.find(
          (c) => c.side === 'front' && c.between_panel === betweenPanel
        );
        const oldSequence = currentCrease?.unfold_sequence ?? betweenPanel;

        const swapCrease = prev.creases.find(
          (c) =>
            c.side === 'front' &&
            c.unfold_sequence === newSequence &&
            c.between_panel !== betweenPanel
        );

        return {
          ...prev,
          creases: prev.creases.map((c) => {
            if (c.between_panel === betweenPanel) {
              return { ...c, unfold_sequence: newSequence };
            }
            if (swapCrease && c.between_panel === swapCrease.between_panel) {
              return { ...c, unfold_sequence: oldSequence };
            }
            return c;
          }),
        };
      });
    },
    []
  );

  const handleCoverChange = useCallback((spreadIndex: number, side: Side) => {
    setState((prev) => ({ ...prev, cover: { spreadIndex, side } }));
  }, []);

  // ─── Export ────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    const zip = new JSZip();
    const fullFolder = zip.folder('full');
    const thumbFolder = zip.folder('thumbnails');
    if (!fullFolder || !thumbFolder) return;

    for (const slot of state.slots) {
      if (!slot.cropRegion || !slot.imageId) continue;

      const img = state.images.find((i) => i.id === slot.imageId);
      if (!img) continue;

      const image = new Image();
      image.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = reject;
        image.src = img.imageUrl;
      });

      const label = `Panel_${slot.panelIndex + 1}_${slot.side}`;
      const region = { ...slot.cropRegion, label };

      const fullBlob = await extractCropWithRotation(image, region, img.rotation, {
        format: 'jpeg',
        quality: 0.9,
      });
      fullFolder.file(`${label}.jpg`, fullBlob);

      const thumbBlob = await extractCropWithRotation(image, region, img.rotation, {
        targetWidth: 400,
        format: 'jpeg',
        quality: 0.8,
      });
      thumbFolder.file(`${label}.jpg`, thumbBlob);
    }

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    saveAs(zipBlob, `safety_card_panels_${timestamp}.zip`);
  }, [state.slots, state.images]);

  // ─── Save to Library ──────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveProgress('Starting...');

    const result = await saveCardToLibrary(state, (p) => {
      setSaveProgress(`${p.stage} (${p.current}/${p.total})`);
    });

    setIsSaving(false);
    setSaveProgress('');

    if (result.success) {
      if (onSaveComplete) {
        onSaveComplete(result.cardId);
      } else {
        alert(`Card saved! ID: ${result.cardId}`);
      }
    } else {
      alert(`Save failed: ${result.error}`);
    }
  }, [state, onSaveComplete]);

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      {/* Step indicator header */}
      <div className="border-b bg-card flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center">
          {onBackToLibrary && (
            <button
              onClick={onBackToLibrary}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              &larr; Library
            </button>
          )}
          <StepIndicator
            currentStep={state.currentStep}
            panelCount={state.panelCount}
            imageCount={state.images.length}
            filledSlots={filledSlots}
            totalSlots={totalSlots}
            onStepClick={goToStep}
          />
        </div>
      </div>

      {/* Step content — fills remaining height */}
      <div className="flex-1 min-h-0 max-w-7xl w-full mx-auto">
        {state.currentStep === 1 && (
          <PanelCountStep
            panelCount={state.panelCount}
            onConfirm={handlePanelCountConfirm}
          />
        )}

        {state.currentStep === 2 && (
          <ImageLibraryStep
            images={state.images}
            onAddImages={handleAddImages}
            onDeleteImage={handleDeleteImage}
            onRotationChange={handleRotationChange}
            onBack={() => goToStep(1)}
            onContinue={() => goToStep(3)}
          />
        )}

        {state.currentStep === 3 && (
          <CropStep
            panelCount={state.panelCount}
            slots={state.slots}
            images={state.images}
            cropWidth={state.cropWidth}
            cropHeight={state.cropHeight}
            activeSlot={state.activeSlot}
            selectedImageId={state.selectedImageId}
            onSelectSlot={handleSelectSlot}
            onSelectImage={handleSelectImage}
            onCancelCrop={handleCancelCrop}
            onConfirmCrop={handleConfirmCrop}
            onClearSlot={handleClearSlot}
            onSetCropDimensions={handleSetCropDimensions}
            onBack={() => goToStep(2)}
            onContinue={() => goToStep(4)}
          />
        )}

        {state.currentStep === 4 && (
          <FoldStep
            panelCount={state.panelCount}
            slots={state.slots}
            creases={state.creases}
            cover={state.cover}
            onCreaseChange={handleCreaseChange}
            onSequenceChange={handleSequenceChange}
            onCoverChange={handleCoverChange}
            onBack={() => goToStep(3)}
            onExport={handleExport}
            onSave={handleSave}
            isSaving={isSaving}
            saveProgress={saveProgress}
          />
        )}
      </div>
    </div>
  );
};
