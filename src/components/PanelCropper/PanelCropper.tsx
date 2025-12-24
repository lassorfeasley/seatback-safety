import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CropCanvas } from './CropCanvas';
import { CropToolbar } from './CropToolbar';
import { SideTabs } from './SideTabs';
import { ScanGallery } from './ScanGallery';
import { ScanControls } from './ScanControls';
import { OrganizedCropPreview } from './OrganizedCropPreview';
import type { CropRegion, PanelCropperState, PanelSide, Scan, ImageDimensions } from './types';
import { exportCropsWithRotation } from './utils';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const PanelCropper: React.FC = () => {
  const [state, setState] = useState<PanelCropperState>({
    scans: [],
    activeScanId: null,
    activeSide: 'front',
    selectedRegionId: null,
    lockDimensions: true,
    lockedWidth: null,
    lockedHeight: null,
  });

  // Get scans filtered by active side
  const scansForActiveSide = useMemo(
    () => state.scans.filter((s) => s.side === state.activeSide),
    [state.scans, state.activeSide]
  );

  // Get the active scan
  const activeScan = useMemo(
    () => state.scans.find((s) => s.id === state.activeScanId) || null,
    [state.scans, state.activeScanId]
  );

  // Count scans per side
  const frontScanCount = useMemo(
    () => state.scans.filter((s) => s.side === 'front').length,
    [state.scans]
  );
  const backScanCount = useMemo(
    () => state.scans.filter((s) => s.side === 'back').length,
    [state.scans]
  );

  // Handle side change
  const handleSideChange = useCallback((side: PanelSide) => {
    setState((prev) => {
      // Find first scan on the new side to make active
      const firstScanOnSide = prev.scans.find((s) => s.side === side);
      return {
        ...prev,
        activeSide: side,
        activeScanId: firstScanOnSide?.id || null,
        selectedRegionId: null,
      };
    });
  }, []);

  // Handle adding new scans
  const handleScanAdd = useCallback((files: FileList, side: PanelSide) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    
    if (imageFiles.length === 0) return;

    const newScans: Scan[] = imageFiles.map((file, index) => ({
      id: generateId(),
      side,
      imageFile: file,
      imageUrl: URL.createObjectURL(file),
      imageDimensions: null,
      regions: [],
      label: `Scan ${index + 1}`,
      rotation: 0,
    }));

    setState((prev) => {
      // Renumber labels based on existing scans for this side
      const existingCount = prev.scans.filter((s) => s.side === side).length;
      const renumberedScans = newScans.map((scan, idx) => ({
        ...scan,
        label: `Scan ${existingCount + idx + 1}`,
      }));

      return {
        ...prev,
        scans: [...prev.scans, ...renumberedScans],
        activeScanId: renumberedScans[0]?.id || prev.activeScanId,
        activeSide: side,
      };
    });
  }, []);

  // Handle selecting a scan
  const handleScanSelect = useCallback((scanId: string) => {
    setState((prev) => ({
      ...prev,
      activeScanId: scanId,
      selectedRegionId: null,
    }));
  }, []);

  // Handle deleting a scan
  const handleScanDelete = useCallback((scanId: string) => {
    setState((prev) => {
      const scanToDelete = prev.scans.find((s) => s.id === scanId);
      if (scanToDelete) {
        URL.revokeObjectURL(scanToDelete.imageUrl);
      }

      const remainingScans = prev.scans.filter((s) => s.id !== scanId);
      
      // If we're deleting the active scan, select another one
      let newActiveScanId = prev.activeScanId;
      if (prev.activeScanId === scanId) {
        const samesSideScans = remainingScans.filter((s) => s.side === prev.activeSide);
        newActiveScanId = samesSideScans[0]?.id || null;
      }

      return {
        ...prev,
        scans: remainingScans,
        activeScanId: newActiveScanId,
        selectedRegionId: null,
      };
    });
  }, []);

  // Handle image load for active scan
  const handleImageLoad = useCallback((dimensions: ImageDimensions) => {
    setState((prev) => ({
      ...prev,
      scans: prev.scans.map((s) =>
        s.id === prev.activeScanId ? { ...s, imageDimensions: dimensions } : s
      ),
    }));
  }, []);

  // Rotation handlers
  const handleRotate90CW = useCallback(() => {
    setState((prev) => ({
      ...prev,
      scans: prev.scans.map((s) =>
        s.id === prev.activeScanId
          ? { ...s, rotation: (s.rotation + 90) % 360 }
          : s
      ),
    }));
  }, []);

  const handleRotate90CCW = useCallback(() => {
    setState((prev) => ({
      ...prev,
      scans: prev.scans.map((s) =>
        s.id === prev.activeScanId
          ? { ...s, rotation: (s.rotation - 90 + 360) % 360 }
          : s
      ),
    }));
  }, []);

  const handleRotationChange = useCallback((degrees: number) => {
    setState((prev) => ({
      ...prev,
      scans: prev.scans.map((s) =>
        s.id === prev.activeScanId ? { ...s, rotation: degrees } : s
      ),
    }));
  }, []);

  const handleResetRotation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      scans: prev.scans.map((s) =>
        s.id === prev.activeScanId ? { ...s, rotation: 0 } : s
      ),
    }));
  }, []);

  // Handle adding a crop region to active scan
  const handleRegionAdd = useCallback((region: CropRegion) => {
    setState((prev) => {
      if (!prev.activeScanId) return prev;

      let newLockedWidth = prev.lockedWidth;
      let newLockedHeight = prev.lockedHeight;

      // Check if this is the first region across all scans
      const totalRegions = prev.scans.reduce((acc, s) => acc + s.regions.length, 0);
      if (prev.lockDimensions && totalRegions === 0) {
        newLockedWidth = region.width;
        newLockedHeight = region.height;
      }

      return {
        ...prev,
        scans: prev.scans.map((s) =>
          s.id === prev.activeScanId
            ? { ...s, regions: [...s.regions, region] }
            : s
        ),
        selectedRegionId: region.id,
        lockedWidth: newLockedWidth,
        lockedHeight: newLockedHeight,
      };
    });
  }, []);

  // Handle updating a crop region
  const handleRegionUpdate = useCallback((updatedRegion: CropRegion) => {
    setState((prev) => {
      if (!prev.activeScanId) return prev;

      if (prev.lockDimensions) {
        const widthChanged = prev.lockedWidth !== updatedRegion.width;
        const heightChanged = prev.lockedHeight !== updatedRegion.height;

        if (widthChanged || heightChanged) {
          const newLockedWidth = updatedRegion.width;
          const newLockedHeight = updatedRegion.height;

          // Update all regions across all scans
          const updatedScans = prev.scans.map((scan) => ({
            ...scan,
            regions: scan.regions.map((r) =>
              r.id === updatedRegion.id
                ? updatedRegion
                : { ...r, width: newLockedWidth, height: newLockedHeight }
            ),
          }));

          return {
            ...prev,
            scans: updatedScans,
            lockedWidth: newLockedWidth,
            lockedHeight: newLockedHeight,
          };
        }
      }

      return {
        ...prev,
        scans: prev.scans.map((s) =>
          s.id === prev.activeScanId
            ? {
                ...s,
                regions: s.regions.map((r) =>
                  r.id === updatedRegion.id ? updatedRegion : r
                ),
              }
            : s
        ),
      };
    });
  }, []);

  // Handle selecting a region
  const handleRegionSelect = useCallback((id: string | null) => {
    setState((prev) => ({
      ...prev,
      selectedRegionId: id,
    }));
  }, []);

  // Handle selecting a region from the organized preview
  const handleOrganizedRegionSelect = useCallback((scanId: string, regionId: string) => {
    setState((prev) => {
      const scan = prev.scans.find((s) => s.id === scanId);
      return {
        ...prev,
        activeSide: scan?.side || prev.activeSide,
        activeScanId: scanId,
        selectedRegionId: regionId,
      };
    });
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
      scans: prev.scans.map((s) =>
        s.id === prev.activeScanId
          ? { ...s, regions: s.regions.filter((r) => r.id !== prev.selectedRegionId) }
          : s
      ),
      selectedRegionId: null,
    }));
  }, []);

  // Delete a specific region by ID (for keyboard delete)
  const handleRegionDelete = useCallback((regionId: string) => {
    setState((prev) => ({
      ...prev,
      scans: prev.scans.map((s) =>
        s.id === prev.activeScanId
          ? { ...s, regions: s.regions.filter((r) => r.id !== regionId) }
          : s
      ),
      selectedRegionId: prev.selectedRegionId === regionId ? null : prev.selectedRegionId,
    }));
  }, []);

  // Delete all regions from active scan
  const handleDeleteAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      scans: prev.scans.map((s) =>
        s.id === prev.activeScanId ? { ...s, regions: [] } : s
      ),
      selectedRegionId: null,
    }));
  }, []);

  // Export all crops from all scans (with rotation applied)
  const handleExport = useCallback(async () => {
    const scansWithRegions = state.scans.filter((s) => s.regions.length > 0);
    if (scansWithRegions.length === 0) return;

    for (const scan of scansWithRegions) {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = scan.imageUrl;
      });

      // Add side and scan info to labels
      const labeledRegions = scan.regions.map((r, idx) => ({
        ...r,
        label: r.label || `${scan.side === 'front' ? 'F' : 'B'}-${scan.label}-Crop${idx + 1}`,
      }));

      await exportCropsWithRotation(img, labeledRegions, scan.rotation, {
        fullResolution: true,
        thumbnails: true,
        thumbnailWidth: 400,
        format: 'jpeg',
        quality: 0.9,
      });
    }
  }, [state.scans]);

  // Check if we have any regions across all scans
  const hasAnyRegions = useMemo(
    () => state.scans.some((s) => s.regions.length > 0),
    [state.scans]
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>Panel Cropper</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload scans for each side of your safety card panel. Add multiple scans per side if the panel is larger than your scan bed.
          </p>
        </CardHeader>
      </Card>

      {/* Side Tabs + Scan Gallery */}
      <Card>
        <SideTabs
          activeSide={state.activeSide}
          frontScanCount={frontScanCount}
          backScanCount={backScanCount}
          onSideChange={handleSideChange}
        />
        <ScanGallery
          scans={scansForActiveSide}
          activeScanId={state.activeScanId}
          side={state.activeSide}
          onScanSelect={handleScanSelect}
          onScanAdd={handleScanAdd}
          onScanDelete={handleScanDelete}
        />
      </Card>

      {/* Toolbar + Rotation Controls - only show when we have an active scan */}
      {activeScan && (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <CropToolbar
              hasImage={true}
              hasRegions={activeScan.regions.length > 0}
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
            <ScanControls
              rotation={activeScan.rotation}
              onRotate90CW={handleRotate90CW}
              onRotate90CCW={handleRotate90CCW}
              onRotationChange={handleRotationChange}
              onResetRotation={handleResetRotation}
            />
          </CardContent>
        </Card>
      )}

      {/* Crop Canvas - only show when we have an active scan */}
      {activeScan && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  activeScan.side === 'front' ? 'bg-blue-500' : 'bg-amber-500'
                }`}
              />
              {activeScan.side === 'front' ? 'Front' : 'Back'} - {activeScan.label}
              {activeScan.rotation !== 0 && (
                <span className="text-xs text-muted-foreground font-normal">
                  (Rotated {Math.round(activeScan.rotation * 10) / 10}°)
                </span>
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Click and drag to create crop regions on this scan
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <CropCanvas
              imageUrl={activeScan.imageUrl}
              imageDimensions={activeScan.imageDimensions}
              regions={activeScan.regions}
              selectedRegionId={state.selectedRegionId}
              lockDimensions={state.lockDimensions}
              lockedWidth={state.lockedWidth}
              lockedHeight={state.lockedHeight}
              rotation={activeScan.rotation}
              onRegionAdd={handleRegionAdd}
              onRegionUpdate={handleRegionUpdate}
              onRegionSelect={handleRegionSelect}
              onRegionDelete={handleRegionDelete}
              onImageLoad={handleImageLoad}
            />
          </CardContent>
        </Card>
      )}

      {/* Show empty state when no active scan */}
      {!activeScan && state.scans.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <svg
                className="h-16 w-16 text-muted-foreground/30 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <h3 className="text-lg font-medium text-muted-foreground mb-2">
                No scans yet
              </h3>
              <p className="text-sm text-muted-foreground/75 max-w-md">
                Start by adding scans above. Use the Front and Back tabs to organize your scans by which side of the panel they represent.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Organized Crop Preview - shows all crops from all scans */}
      {hasAnyRegions && (
        <OrganizedCropPreview
          scans={state.scans}
          selectedRegionId={state.selectedRegionId}
          onSelectRegion={handleOrganizedRegionSelect}
        />
      )}
    </div>
  );
};
