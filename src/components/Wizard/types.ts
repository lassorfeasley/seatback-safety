import type { CropRegion, ImageDimensions } from '@/components/PanelCropper/types';
import type { Crease, CoverDesignation, Side } from '@/components/FoldEditor/types';

export type PanelSide = 'front' | 'back';

// ─── Document / Provenance / Pricing Types ──────────────────────

export interface DocumentAttachment {
  id?: string;
  file: File | null;
  url?: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  label: string;
}

export interface ProvenanceEntry {
  id?: string;
  source: string;
  acquiredDate: string;
  notes: string;
  documents: DocumentAttachment[];
}

export type PriceType = 'purchase' | 'asking' | 'auction_result' | 'estimate';

export interface PriceObservation {
  id?: string;
  priceUsd: number | null;
  priceType: PriceType;
  source: string;
  observedDate: string;
  documents: DocumentAttachment[];
}

// Metadata collected in the Card Info step
export interface CardMetadata {
  airlineId: string | null;
  airlineName: string;
  manufacturerId: string | null;
  manufacturerName: string;
  modelId: string | null;
  modelName: string;
  variantId: string | null;
  variantName: string;
  title: string;
  publishedYear: number | null;
  revision: string;
  language: string;
  notes: string;
  provenance: ProvenanceEntry[];
  priceObservations: PriceObservation[];
}

export const EMPTY_METADATA: CardMetadata = {
  airlineId: null,
  airlineName: '',
  manufacturerId: null,
  manufacturerName: '',
  modelId: null,
  modelName: '',
  variantId: null,
  variantName: '',
  title: '',
  publishedYear: null,
  revision: '',
  language: '',
  notes: '',
  provenance: [],
  priceObservations: [],
};

// A scan image in the shared library (not assigned to any panel)
export interface LibraryImage {
  id: string;
  imageFile: File | null;
  imageUrl: string;
  thumbnailUrl?: string;
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
  dirty?: boolean; // true when crop was modified since last save
  widthPx?: number;  // panel image pixel width (for aspect ratio when cropRegion is null)
  heightPx?: number; // panel image pixel height
}

// Top-level wizard state
export interface WizardState {
  currentStep: 1 | 2 | 3 | 4;
  metadata: CardMetadata;
  panelCount: number; // 0 = not set yet (defaults to 3)
  images: LibraryImage[];
  slots: PanelSlot[];
  cropWidth: number | null;
  cropHeight: number | null;
  creases: Crease[];
  cover: CoverDesignation;
  pivotIndex: number | null;
  isBooklet: boolean;

  // UI state for step 3 (crop session)
  activeSlot: { panelIndex: number; side: PanelSide } | null;
  selectedImageId: string | null;
}

// ─── Step Prop Interfaces ────────────────────────────────────────

export interface CardInfoStepProps {
  metadata: CardMetadata;
  panelCount: number;
  images: LibraryImage[];
  isBooklet: boolean;
  onMetadataChange: (metadata: CardMetadata) => void;
  onPanelCountChange: (count: number) => void;
  onBookletChange: (isBooklet: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
}

export interface ImageLibraryStepProps {
  images: LibraryImage[];
  onAddImages: (files: FileList) => void;
  onDeleteImage: (imageId: string) => void;
  onRotationChange: (imageId: string, rotation: number) => void;
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
    thumbnailUrl: string,
    rotation: number
  ) => void;
  onClearSlot: (panelIndex: number, side: PanelSide) => void;
  onResetWidthLock: (panelIndex: number, side: PanelSide) => void;
  onSetCropDimensions: (width: number, height: number) => void;
  onRotationChange: (imageId: string, rotation: number) => void;
  onBack: () => void;
  onContinue: () => void;
  continueLabel?: string;
}

export interface FoldStepProps {
  panelCount: number;
  slots: PanelSlot[];
  creases: Crease[];
  cover: CoverDesignation;
  pivotIndex: number | null;
  isBooklet: boolean;
  onBookletChange: (isBooklet: boolean) => void;
  onCreaseChange: (betweenPanel: number, direction: 'forward' | 'backward', side: Side) => void;
  onSequenceChange: (betweenPanel: number, sequence: number, side: Side) => void;
  onCoverChange: (spreadIndex: number, side: Side) => void;
  onPivotChange: (spreadIndex: number) => void;
  onBack: () => void;
  onExport: () => void;
  onSave: () => void;
  isSaving?: boolean;
  saveProgress?: string;
  saveLabel?: string;
  hideExport?: boolean;
}

export interface StepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4;
  panelCount: number;
  imageCount: number;
  filledSlots: number;
  totalSlots: number;
  onStepClick: (step: 1 | 2 | 3 | 4) => void;
}
