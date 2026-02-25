import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { StepIndicator } from './StepIndicator';
import { CardInfoStep } from './CardInfoStep';
import { ImageLibraryStep } from './ImageLibraryStep';
import { CropStep } from './CropStep';
import { FoldStep } from './FoldStep';
import { extractCropWithRotation } from '@/components/PanelCropper/utils';
import {
  saveCardToLibrary,
  fetchCardDetail,
  fetchCardForCropEditing,
  updateCardFolds,
  updateCardPanels,
} from '@/lib/safetyCardService';
import type { WizardState, PanelSlot, PanelSide, LibraryImage, CardMetadata } from './types';
import { EMPTY_METADATA } from './types';
import type { CropRegion } from '@/components/PanelCropper/types';
import type { Crease, Side, FoldDirection } from '@/components/FoldEditor/types';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Loader2 } from 'lucide-react';

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
  editCardId?: string;
  initialStep?: 3 | 4;
  initialSlot?: { panelIndex: number; side: 'front' | 'back' };
}

export const SafetyCardWizard: React.FC<SafetyCardWizardProps> = ({
  onSaveComplete,
  onBackToLibrary,
  editCardId,
  initialStep,
  initialSlot,
}) => {
  const isEditMode = !!editCardId;

  const [state, setState] = useState<WizardState>({
    currentStep: initialStep ?? 1,
    metadata: { ...EMPTY_METADATA },
    panelCount: 0,
    images: [],
    slots: [],
    cropWidth: null,
    cropHeight: null,
    creases: [],
    cover: { spreadIndex: 0, side: 'front' },
    pivotIndex: null,
    activeSlot: null,
    selectedImageId: null,
  });

  const [editLoading, setEditLoading] = useState(isEditMode);
  const [editSideIds, setEditSideIds] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');
  const [pendingSave, setPendingSave] = useState(false);

  // ─── Load existing card data for edit mode ─────────────────────

  useEffect(() => {
    if (!editCardId) return;

    const load = async () => {
      if (initialStep === 4) {
        const card = await fetchCardDetail(editCardId);
        if (!card) { setEditLoading(false); return; }

        const panelCount = card.panel_count ?? 0;
        const slots: PanelSlot[] = [];
        for (let i = 0; i < panelCount; i++) {
          const fp = card.panels.find((p) => p.side === 'front' && p.panel_index === i);
          const bp = card.panels.find((p) => p.side === 'back' && p.panel_index === i);
          slots.push({ panelIndex: i, side: 'front', imageId: null, cropRegion: null, thumbnailUrl: fp?.thumbnail_url ?? null });
          slots.push({ panelIndex: i, side: 'back', imageId: null, cropRegion: null, thumbnailUrl: bp?.thumbnail_url ?? null });
        }

        setState((prev) => ({
          ...prev,
          currentStep: 4,
          panelCount,
          slots,
          creases: card.creases.length > 0 ? card.creases : generateDefaultCreases(panelCount),
          cover: card.cover,
          pivotIndex: card.pivotIndex,
        }));
      } else if (initialStep === 3) {
        const editData = await fetchCardForCropEditing(editCardId);
        if (!editData) { setEditLoading(false); return; }

        setEditSideIds(editData.sideIds);

        const images: LibraryImage[] = [];
        for (const scan of editData.scans) {
          try {
            const response = await fetch(scan.downloadUrl);
            const blob = await response.blob();
            const file = new File([blob], scan.originalFilename, { type: scan.mimeType });
            images.push({
              id: scan.id,
              imageFile: file,
              imageUrl: URL.createObjectURL(blob),
              imageDimensions: null,
              label: scan.originalFilename,
              rotation: 0,
            });
          } catch (e) {
            console.error('Failed to download scan', scan.id, e);
          }
        }

        const slots: PanelSlot[] = [];
        for (let i = 0; i < editData.panelCount; i++) {
          for (const side of ['front', 'back'] as PanelSide[]) {
            const panelData = editData.panels.find((p) => p.panelIndex === i && p.side === side);
            if (panelData) {
              const img = images.find((im) => im.id === panelData.scanId);
              if (img) img.rotation = panelData.rotationDeg;
              slots.push({
                panelIndex: i,
                side,
                imageId: panelData.scanId,
                cropRegion: { id: `crop-${i}-${side}`, x: panelData.cropX, y: panelData.cropY, width: panelData.cropWidth, height: panelData.cropHeight },
                thumbnailUrl: panelData.thumbnailUrl,
              });
            } else {
              slots.push({ panelIndex: i, side, imageId: null, cropRegion: null, thumbnailUrl: null });
            }
          }
        }

        setState((prev) => {
          const base = {
            ...prev,
            currentStep: 3 as const,
            panelCount: editData.panelCount,
            images,
            slots,
            cropWidth: editData.cropWidth,
            cropHeight: editData.cropHeight,
          };

          if (initialSlot) {
            const existing = slots.find(
              (s) => s.panelIndex === initialSlot.panelIndex && s.side === initialSlot.side
            );
            base.activeSlot = { panelIndex: initialSlot.panelIndex, side: initialSlot.side };

            if (existing?.imageId) {
              base.selectedImageId = existing.imageId;
            } else {
              const oppSide: PanelSide = initialSlot.side === 'front' ? 'back' : 'front';
              const oppSlot = slots.find(
                (s) => s.panelIndex === initialSlot.panelIndex && s.side === oppSide
              );
              const oppImageId = oppSlot?.imageId ?? null;
              let defaultImageId = images[0]?.id || null;
              if (images.length === 2) {
                if (oppImageId) {
                  defaultImageId = images.find((i) => i.id !== oppImageId)?.id ?? defaultImageId;
                } else if (initialSlot.side === 'back') {
                  defaultImageId = images[1].id;
                }
              } else if (images.length > 2 && oppImageId) {
                defaultImageId = images.find((i) => i.id !== oppImageId)?.id ?? defaultImageId;
              }
              base.selectedImageId = defaultImageId;
            }
          }

          return base;
        });
      }

      setEditLoading(false);
    };

    load();
  }, [editCardId, initialStep, initialSlot]);

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

  // ─── Step 1: Card Info ──────────────────────────────────────────

  const handleMetadataChange = useCallback((metadata: CardMetadata) => {
    setState((prev) => ({ ...prev, metadata }));
  }, []);

  const handlePanelCountChange = useCallback((count: number) => {
    setState((prev) => {
      if (count === prev.panelCount) return { ...prev, panelCount: count };

      const newSlots = generateSlots(count);
      const newCreases = generateDefaultCreases(count);

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

      for (let i = 0; i < newCreases.length; i++) {
        const nc = newCreases[i];
        const existing = prev.creases.find(
          (c) => c.side === nc.side && c.between_panel === nc.between_panel
        );
        if (existing) {
          newCreases[i] = { ...existing };
        }
      }

      return { ...prev, panelCount: count, slots: newSlots, creases: newCreases };
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
    setState((prev) => {
      const existingSlot = prev.slots.find(
        (s) => s.panelIndex === panelIndex && s.side === side
      );
      if (existingSlot?.imageId) {
        return {
          ...prev,
          activeSlot: { panelIndex, side },
          selectedImageId: existingSlot.imageId,
        };
      }

      const oppositeSide: PanelSide = side === 'front' ? 'back' : 'front';
      const oppositeSlot = prev.slots.find(
        (s) => s.panelIndex === panelIndex && s.side === oppositeSide
      );
      const oppositeImageId = oppositeSlot?.imageId ?? null;

      let defaultImageId = prev.images[0]?.id || null;
      if (prev.images.length === 2) {
        if (oppositeImageId) {
          defaultImageId = prev.images.find((i) => i.id !== oppositeImageId)?.id ?? defaultImageId;
        } else if (side === 'back') {
          defaultImageId = prev.images[1].id;
        }
      } else if (prev.images.length > 2 && oppositeImageId) {
        defaultImageId = prev.images.find((i) => i.id !== oppositeImageId)?.id ?? defaultImageId;
      }

      return {
        ...prev,
        activeSlot: { panelIndex, side },
        selectedImageId: defaultImageId,
      };
    });
  }, []);

  const handleSelectImage = useCallback((imageId: string) => {
    setState((prev) => ({ ...prev, selectedImageId: imageId }));
  }, []);

  const handleCancelCrop = useCallback(() => {
    if (initialSlot) {
      onBackToLibrary?.();
    } else {
      setState((prev) => ({ ...prev, activeSlot: null, selectedImageId: null }));
    }
  }, [initialSlot, onBackToLibrary]);

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
        ...(initialSlot ? {} : { activeSlot: null, selectedImageId: null }),
      }));
      if (initialSlot) {
        setPendingSave(true);
      }
    },
    [initialSlot]
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
    setState((prev) => {
      const next = { ...prev, cover: { spreadIndex, side } };
      if (prev.pivotIndex === spreadIndex) next.pivotIndex = null;
      return next;
    });
  }, []);

  const handlePivotChange = useCallback((spreadIndex: number) => {
    setState((prev) => ({ ...prev, pivotIndex: spreadIndex }));
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

    if (editCardId && initialStep === 4) {
      const result = await updateCardFolds(editCardId, state.creases, state.cover, state.pivotIndex);
      setIsSaving(false);
      setSaveProgress('');
      if (result.success) {
        onSaveComplete?.(editCardId);
      } else {
        alert(`Save failed: ${result.error}`);
      }
      return;
    }

    if (editCardId && initialStep === 3) {
      const result = await updateCardPanels(editCardId, state, editSideIds, (p) => {
        setSaveProgress(`${p.stage} (${p.current}/${p.total})`);
      });
      setIsSaving(false);
      setSaveProgress('');
      if (result.success) {
        onSaveComplete?.(editCardId);
      } else {
        alert(`Save failed: ${result.error}`);
      }
      return;
    }

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
  }, [state, editCardId, initialStep, editSideIds, onSaveComplete]);

  // Auto-save after confirming a crop in direct mode
  useEffect(() => {
    if (pendingSave && !isSaving) {
      setPendingSave(false);
      handleSave();
    }
  }, [pendingSave, isSaving, handleSave]);

  // ─── Render ────────────────────────────────────────────────────

  if (editLoading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading card data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden relative">
      {isSaving && initialSlot && (
        <div className="absolute inset-0 z-50 bg-background/80 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Saving crop...</p>
            {saveProgress && <p className="text-xs text-muted-foreground">{saveProgress}</p>}
          </div>
        </div>
      )}
      {!initialSlot && (
      <div className="border-b flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center">
          {onBackToLibrary && (
            <button
              onClick={onBackToLibrary}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              &larr; {isEditMode ? 'Back to Card' : 'Library'}
            </button>
          )}
          {!isEditMode && (
            <StepIndicator
              currentStep={state.currentStep}
              panelCount={state.panelCount}
              imageCount={state.images.length}
              filledSlots={filledSlots}
              totalSlots={totalSlots}
              onStepClick={goToStep}
            />
          )}
          {isEditMode && (
            <div className="flex-1 flex items-center justify-center py-2">
              <span className="text-sm font-medium text-muted-foreground">
                Editing {initialStep === 3 ? 'Crops' : 'Folds'}
              </span>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Step content — fills remaining height */}
      <div className="flex-1 min-h-0 w-full" style={{ maxWidth: state.currentStep === 3 ? 'none' : '80rem', margin: '0 auto' }}>
        {state.currentStep === 1 && !isEditMode && (
          <ImageLibraryStep
            images={state.images}
            onAddImages={handleAddImages}
            onDeleteImage={handleDeleteImage}
            onRotationChange={handleRotationChange}
            onContinue={() => goToStep(2)}
          />
        )}

        {state.currentStep === 2 && !isEditMode && (
          <CardInfoStep
            metadata={state.metadata}
            panelCount={state.panelCount}
            images={state.images}
            onMetadataChange={handleMetadataChange}
            onPanelCountChange={handlePanelCountChange}
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
            onRotationChange={handleRotationChange}
            onBack={isEditMode ? (onBackToLibrary ?? (() => {})) : () => goToStep(2)}
            onContinue={isEditMode ? handleSave : () => goToStep(4)}
            continueLabel={isEditMode ? (isSaving ? 'Saving...' : 'Save Changes') : undefined}
          />
        )}

        {state.currentStep === 4 && (
          <FoldStep
            panelCount={state.panelCount}
            slots={state.slots}
            creases={state.creases}
            cover={state.cover}
            pivotIndex={state.pivotIndex}
            onCreaseChange={handleCreaseChange}
            onSequenceChange={handleSequenceChange}
            onCoverChange={handleCoverChange}
            onPivotChange={handlePivotChange}
            onBack={isEditMode ? (onBackToLibrary ?? (() => {})) : () => goToStep(3)}
            onExport={handleExport}
            onSave={handleSave}
            isSaving={isSaving}
            saveProgress={saveProgress}
            saveLabel={isEditMode ? 'Save Changes' : undefined}
            hideExport={isEditMode}
          />
        )}
      </div>
    </div>
  );
};
