export interface CropRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string; // e.g., "F-S1", "B-S2"
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface CropperState {
  imageFile: File | null;
  imageUrl: string | null;
  imageDimensions: ImageDimensions | null;
  regions: CropRegion[];
  selectedRegionId: string | null;
  lockDimensions: boolean; // All crops same size
  lockedWidth: number | null;
  lockedHeight: number | null;
}

export interface CropCanvasProps {
  imageUrl: string | null;
  imageDimensions: ImageDimensions | null;
  regions: CropRegion[];
  selectedRegionId: string | null;
  lockDimensions: boolean;
  lockedWidth: number | null;
  lockedHeight: number | null;
  onRegionAdd: (region: CropRegion) => void;
  onRegionUpdate: (region: CropRegion) => void;
  onRegionSelect: (id: string | null) => void;
  onImageLoad: (dimensions: ImageDimensions) => void;
}

export interface CropToolbarProps {
  hasImage: boolean;
  hasRegions: boolean;
  lockDimensions: boolean;
  lockedWidth: number | null;
  lockedHeight: number | null;
  selectedRegionId: string | null;
  onToggleLock: () => void;
  onResetDimensions: () => void;
  onDeleteSelected: () => void;
  onDeleteAll: () => void;
  onExport: () => void;
}

export interface CropPreviewProps {
  imageUrl: string | null;
  regions: CropRegion[];
  selectedRegionId: string | null;
  onSelectRegion: (id: string) => void;
}

export interface ExportOptions {
  fullResolution: boolean;
  thumbnails: boolean;
  thumbnailWidth: number;
  format: 'jpeg' | 'png';
  quality: number;
}
