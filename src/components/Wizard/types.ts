import type { CropRegion, ImageDimensions } from '@/components/PanelCropper/types';
import type { Crease, CoverDesignation, Side } from '@/components/FoldEditor/types';

export type PanelSide = 'front' | 'back';

// A scan image in the shared library (not assigned to any panel)
export interface LibraryImage {
  id: string;
  imageFile: File;
  imageUrl: string;
  imageDimensions: ImageDimensions | null;
  label: string;
  rotation: number;
}

// A single panel slot (e.g., Panel 1 Front, Panel 2 Back)
export interface PanelSlot {
  panelIndex: number;
  side: PanelSide;
  imageId: string | null; // which LibraryImage was used
  cropRegion: CropRegion | null; // the single crop region
  thumbnailUrl: string | null; // generated thumbnail data URL
}

// Top-level wizard state
export interface WizardState {
  currentStep: 1 | 2 | 3 | 4;
  panelCount: number; // 0 = not set yet
  images: LibraryImage[];
  slots: PanelSlot[];
  cropWidth: number | null;
  cropHeight: number | null;
  creases: Crease[];
  cover: CoverDesignation;

  // UI state for step 3 (crop session)
  activeSlot: { panelIndex: number; side: PanelSide } | null;
  selectedImageId: string | null;
}

// ─── Step Prop Interfaces ────────────────────────────────────────

export interface PanelCountStepProps {
  panelCount: number;
  onConfirm: (count: number) => void;
}

export interface ImageLibraryStepProps {
  images: LibraryImage[];
  onAddImages: (files: FileList) => void;
  onDeleteImage: (imageId: string) => void;
  onRotationChange: (imageId: string, rotation: number) => void;
  onBack: () => void;
  onContinue: () => void;
}

export interface CropStepProps {
  panelCount: number;
  slots: PanelSlot[];
  images: LibraryImage[];
  cropWidth: number | null;
  cropHeight: number | null;
  activeSlot: { panelIndex: number; side: PanelSide } | null;
  selectedImageId: string | null;
  onSelectSlot: (panelIndex: number, side: PanelSide) => void;
  onSelectImage: (imageId: string) => void;
  onCancelCrop: () => void;
  onConfirmCrop: (
    panelIndex: number,
    side: PanelSide,
    imageId: string,
    region: CropRegion,
    thumbnailUrl: string
  ) => void;
  onClearSlot: (panelIndex: number, side: PanelSide) => void;
  onSetCropDimensions: (width: number, height: number) => void;
  onBack: () => void;
  onContinue: () => void;
}

export interface FoldStepProps {
  panelCount: number;
  slots: PanelSlot[];
  creases: Crease[];
  cover: CoverDesignation;
  onCreaseChange: (betweenPanel: number, direction: 'forward' | 'backward', side: Side) => void;
  onSequenceChange: (betweenPanel: number, sequence: number, side: Side) => void;
  onCoverChange: (spreadIndex: number, side: Side) => void;
  onBack: () => void;
  onExport: () => void;
  onSave: () => void;
  isSaving?: boolean;
  saveProgress?: string;
}

export interface StepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4;
  panelCount: number;
  imageCount: number;
  filledSlots: number;
  totalSlots: number;
  onStepClick: (step: 1 | 2 | 3 | 4) => void;
}
