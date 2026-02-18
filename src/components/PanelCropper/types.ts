export type PanelSide = 'front' | 'back';

export interface CropRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface CropCanvasProps {
  imageUrl: string | null;
  imageDimensions: ImageDimensions | null;
  regions: CropRegion[];
  selectedRegionId: string | null;
  lockDimensions: boolean;
  lockedWidth: number | null;
  lockedHeight: number | null;
  constrainHeight?: number | null; // Lock height only (width remains free-draw). Ignored when lockDimensions is true.
  rotation: number;
  singleCropMode?: boolean; // When true: drawing replaces existing region, no collision detection
  onRegionAdd: (region: CropRegion) => void;
  onRegionUpdate: (region: CropRegion) => void;
  onRegionSelect: (id: string | null) => void;
  onRegionDelete: (id: string) => void;
  onImageLoad: (dimensions: ImageDimensions) => void;
}

export interface ScanControlsProps {
  rotation: number;
  onRotate90CW: () => void;
  onRotate90CCW: () => void;
  onRotationChange: (degrees: number) => void;
  onResetRotation: () => void;
}

export interface ExportOptions {
  fullResolution: boolean;
  thumbnails: boolean;
  thumbnailWidth: number;
  format: 'jpeg' | 'png';
  quality: number;
}
