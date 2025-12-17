import React, { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CropCanvas } from './CropCanvas';
import { CropToolbar } from './CropToolbar';
import { CropPreview } from './CropPreview';
import type { CropRegion, CropperState, ImageDimensions } from './types';
import { exportCrops } from './utils';

export const PanelCropper: React.FC = () => {
  const [state, setState] = useState<CropperState>({
    imageFile: null,
    imageUrl: null,
    imageDimensions: null,
    regions: [],
    selectedRegionId: null,
    lockDimensions: true,
    lockedWidth: null,
    lockedHeight: null,
  });

  const imageRef = useRef<HTMLImageElement | null>(null);

  // Handle file drop/select
  const handleFileSelect = useCallback((file: File) => {
    // Revoke previous URL to prevent memory leak
    if (state.imageUrl) {
      URL.revokeObjectURL(state.imageUrl);
    }

    const url = URL.createObjectURL(file);
    setState((prev) => ({
      ...prev,
      imageFile: file,
      imageUrl: url,
      imageDimensions: null,
      regions: [],
      selectedRegionId: null,
    }));
  }, [state.imageUrl]);

  // Handle image load to get dimensions
  const handleImageLoad = useCallback((dimensions: ImageDimensions) => {
    setState((prev) => ({
      ...prev,
      imageDimensions: dimensions,
    }));
  }, []);

  // Add a new crop region
  const handleRegionAdd = useCallback((region: CropRegion) => {
    setState((prev) => {
      // If dimensions are locked and this is the first region, set locked dimensions
      let newLockedWidth = prev.lockedWidth;
      let newLockedHeight = prev.lockedHeight;

      if (prev.lockDimensions && prev.regions.length === 0) {
        newLockedWidth = region.width;
        newLockedHeight = region.height;
      }

      return {
        ...prev,
        regions: [...prev.regions, region],
        selectedRegionId: region.id,
        lockedWidth: newLockedWidth,
        lockedHeight: newLockedHeight,
      };
    });
  }, []);

  // Update an existing region
  const handleRegionUpdate = useCallback((updatedRegion: CropRegion) => {
    setState((prev) => {
      // If dimensions are locked and we're resizing, update all regions
      if (prev.lockDimensions) {
        const widthChanged = prev.lockedWidth !== updatedRegion.width;
        const heightChanged = prev.lockedHeight !== updatedRegion.height;

        if (widthChanged || heightChanged) {
          // Update locked dimensions
          const newLockedWidth = updatedRegion.width;
          const newLockedHeight = updatedRegion.height;

          // Resize all regions to match
          const updatedRegions = prev.regions.map((r) =>
            r.id === updatedRegion.id
              ? updatedRegion
              : { ...r, width: newLockedWidth, height: newLockedHeight }
          );

          return {
            ...prev,
            regions: updatedRegions,
            lockedWidth: newLockedWidth,
            lockedHeight: newLockedHeight,
          };
        }
      }

      return {
        ...prev,
        regions: prev.regions.map((r) =>
          r.id === updatedRegion.id ? updatedRegion : r
        ),
      };
    });
  }, []);

  // Select a region
  const handleRegionSelect = useCallback((id: string | null) => {
    setState((prev) => ({
      ...prev,
      selectedRegionId: id,
    }));
  }, []);

  // Toggle dimension lock
  const handleToggleLock = useCallback(() => {
    setState((prev) => ({
      ...prev,
      lockDimensions: !prev.lockDimensions,
    }));
  }, []);

  // Reset locked dimensions
  const handleResetDimensions = useCallback(() => {
    setState((prev) => ({
      ...prev,
      lockedWidth: null,
      lockedHeight: null,
    }));
  }, []);

  // Delete selected region
  const handleDeleteSelected = useCallback(() => {
    setState((prev) => ({
      ...prev,
      regions: prev.regions.filter((r) => r.id !== prev.selectedRegionId),
      selectedRegionId: null,
    }));
  }, []);

  // Delete all regions
  const handleDeleteAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      regions: [],
      selectedRegionId: null,
      lockedWidth: null,
      lockedHeight: null,
    }));
  }, []);

  // Export crops
  const handleExport = useCallback(async () => {
    if (!state.imageUrl || state.regions.length === 0) return;

    // Load image for processing
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = state.imageUrl!;
    });

    await exportCrops(img, state.regions, {
      fullResolution: true,
      thumbnails: true,
      thumbnailWidth: 400,
      format: 'jpeg',
      quality: 0.9,
    });
  }, [state.imageUrl, state.regions]);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer.files;
      if (files.length > 0 && files[0].type.startsWith('image/')) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect]
  );

  // Handle file input change
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect]
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Panel Cropper</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload a scanned safety card image and draw crop regions around each panel.
            Click and drag to create regions, then export full-resolution crops and thumbnails.
          </p>
        </CardHeader>
        <CardContent>
          <CropToolbar
            hasImage={!!state.imageUrl}
            hasRegions={state.regions.length > 0}
            lockDimensions={state.lockDimensions}
            lockedWidth={state.lockedWidth}
            lockedHeight={state.lockedHeight}
            selectedRegionId={state.selectedRegionId}
            onToggleLock={handleToggleLock}
            onResetDimensions={handleResetDimensions}
            onDeleteSelected={handleDeleteSelected}
            onDeleteAll={handleDeleteAll}
            onExport={handleExport}
          />
        </CardContent>
      </Card>

      {/* Drop zone / Canvas area */}
      <Card>
        <CardContent className="p-0">
          {!state.imageUrl ? (
            <div
              className="flex min-h-[400px] flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg m-4 cursor-pointer hover:border-muted-foreground/50 transition-colors"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input
                id="file-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <svg
                className="h-12 w-12 text-muted-foreground/50 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-lg font-medium text-muted-foreground">
                Drop a scanned image here
              </p>
              <p className="text-sm text-muted-foreground/75">
                or click to browse
              </p>
            </div>
          ) : (
            <CropCanvas
              imageUrl={state.imageUrl}
              imageDimensions={state.imageDimensions}
              regions={state.regions}
              selectedRegionId={state.selectedRegionId}
              lockDimensions={state.lockDimensions}
              lockedWidth={state.lockedWidth}
              lockedHeight={state.lockedHeight}
              onRegionAdd={handleRegionAdd}
              onRegionUpdate={handleRegionUpdate}
              onRegionSelect={handleRegionSelect}
              onImageLoad={handleImageLoad}
            />
          )}
        </CardContent>
      </Card>

      {/* Preview of cropped panels */}
      {state.regions.length > 0 && (
        <CropPreview
          imageUrl={state.imageUrl}
          regions={state.regions}
          selectedRegionId={state.selectedRegionId}
          onSelectRegion={handleRegionSelect}
        />
      )}
    </div>
  );
};
