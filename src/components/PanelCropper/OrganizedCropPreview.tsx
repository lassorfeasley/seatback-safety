import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { OrganizedCropPreviewProps, Scan, PanelSide } from './types';

interface PreviewThumbnail {
  scanId: string;
  regionId: string;
  dataUrl: string;
  label: string;
  width: number;
  height: number;
}

interface ScanWithThumbnails {
  scan: Scan;
  thumbnails: PreviewThumbnail[];
}

interface SideGroup {
  side: PanelSide;
  label: string;
  scansWithThumbnails: ScanWithThumbnails[];
}

export const OrganizedCropPreview: React.FC<OrganizedCropPreviewProps> = ({
  scans,
  selectedRegionId,
  onSelectRegion,
}) => {
  const [sideGroups, setSideGroups] = useState<SideGroup[]>([]);

  // Generate thumbnails for all scans
  useEffect(() => {
    if (scans.length === 0) {
      setSideGroups([]);
      return;
    }

    const generateAllThumbnails = async () => {
      const frontScans = scans.filter((s) => s.side === 'front');
      const backScans = scans.filter((s) => s.side === 'back');

      const processScans = async (scanList: Scan[]): Promise<ScanWithThumbnails[]> => {
        const results: ScanWithThumbnails[] = [];

        for (const scan of scanList) {
          if (scan.regions.length === 0) {
            results.push({ scan, thumbnails: [] });
            continue;
          }

          const img = new Image();
          img.crossOrigin = 'anonymous';

          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = scan.imageUrl;
          });

          const thumbnails: PreviewThumbnail[] = [];

          for (const region of scan.regions) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;

            const maxPreviewWidth = 120;
            const scale = Math.min(1, maxPreviewWidth / region.width);
            const previewWidth = Math.round(region.width * scale);
            const previewHeight = Math.round(region.height * scale);

            canvas.width = previewWidth;
            canvas.height = previewHeight;

            ctx.drawImage(
              img,
              region.x,
              region.y,
              region.width,
              region.height,
              0,
              0,
              previewWidth,
              previewHeight
            );

            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

            thumbnails.push({
              scanId: scan.id,
              regionId: region.id,
              dataUrl,
              label: region.label || `Crop ${scan.regions.indexOf(region) + 1}`,
              width: region.width,
              height: region.height,
            });
          }

          results.push({ scan, thumbnails });
        }

        return results;
      };

      const [frontResults, backResults] = await Promise.all([
        processScans(frontScans),
        processScans(backScans),
      ]);

      const groups: SideGroup[] = [];

      if (frontResults.some((r) => r.thumbnails.length > 0)) {
        groups.push({
          side: 'front',
          label: 'Front Side',
          scansWithThumbnails: frontResults.filter((r) => r.thumbnails.length > 0),
        });
      }

      if (backResults.some((r) => r.thumbnails.length > 0)) {
        groups.push({
          side: 'back',
          label: 'Back Side',
          scansWithThumbnails: backResults.filter((r) => r.thumbnails.length > 0),
        });
      }

      setSideGroups(groups);
    };

    generateAllThumbnails().catch(console.error);
  }, [scans]);

  const totalCrops = sideGroups.reduce(
    (acc, group) =>
      acc +
      group.scansWithThumbnails.reduce((acc2, swt) => acc2 + swt.thumbnails.length, 0),
    0
  );

  if (totalCrops === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          All Crops ({totalCrops} panel{totalCrops !== 1 ? 's' : ''})
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Click a crop to select it in the editor
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {sideGroups.map((group) => (
          <div key={group.side}>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  group.side === 'front' ? 'bg-blue-500' : 'bg-amber-500'
                }`}
              />
              {group.label}
            </h3>

            <div className="space-y-4 pl-4 border-l-2 border-muted">
              {group.scansWithThumbnails.map((swt, scanIndex) => (
                <div key={swt.scan.id}>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">
                    {swt.scan.label || `Scan ${scanIndex + 1}`}
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {swt.thumbnails.map((thumb, cropIndex) => (
                      <div
                        key={thumb.regionId}
                        className={`
                          relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all
                          ${selectedRegionId === thumb.regionId
                            ? 'border-primary ring-2 ring-primary/20'
                            : 'border-muted hover:border-primary/50'
                          }
                        `}
                        onClick={() => onSelectRegion(thumb.scanId, thumb.regionId)}
                      >
                        <img
                          src={thumb.dataUrl}
                          alt={thumb.label}
                          className="block"
                          style={{ maxHeight: '100px' }}
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs px-2 py-1">
                          <div className="font-medium">{thumb.label}</div>
                          <div className="text-white/70">
                            {thumb.width} × {thumb.height}px
                          </div>
                        </div>
                        <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                          {cropIndex + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

