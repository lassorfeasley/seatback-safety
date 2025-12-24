export type PanelSide = 'front' | 'back';

export interface CropRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export interface Scan {
  id: string;
  side: PanelSide;
  imageFile: File;
  imageUrl: string;
  imageDimensions: ImageDimensions | null;
  regions: CropRegion[];
  label?: string; // e.g., "Scan 1", "Scan 2"
  rotation: number; // Rotation in degrees (0, 90, 180, 270 for quick rotate, or any angle for fine-tune)
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface PanelCropperState {
  scans: Scan[];
  activeScanId: string | null;
  activeSide: PanelSide;
  selectedRegionId: string | null;
  lockDimensions: boolean;
  lockedWidth: number | null;
  lockedHeight: number | null;
}

// Legacy state for single-image mode (kept for reference)
export interface CropperState {
  imageFile: File | null;
  imageUrl: string | null;
  imageDimensions: ImageDimensions | null;
  regions: CropRegion[];
  selectedRegionId: string | null;
  lockDimensions: boolean;
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
  rotation: number;
  onRegionAdd: (region: CropRegion) => void;
  onRegionUpdate: (region: CropRegion) => void;
  onRegionSelect: (id: string | null) => void;
  onRegionDelete: (id: string) => void;
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

export interface ScanGalleryProps {
  scans: Scan[];
  activeScanId: string | null;
  side: PanelSide;
  onScanSelect: (scanId: string) => void;
  onScanAdd: (files: FileList, side: PanelSide) => void;
  onScanDelete: (scanId: string) => void;
}

export interface SideTabsProps {
  activeSide: PanelSide;
  frontScanCount: number;
  backScanCount: number;
  onSideChange: (side: PanelSide) => void;
}

export interface OrganizedCropPreviewProps {
  scans: Scan[];
  selectedRegionId: string | null;
  onSelectRegion: (scanId: string, regionId: string) => void;
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

