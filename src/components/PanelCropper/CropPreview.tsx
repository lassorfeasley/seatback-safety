import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CropPreviewProps, CropRegion } from './types';

interface PreviewThumbnail {
  id: string;
  dataUrl: string;
  label: string;
  width: number;
  height: number;
}

export const CropPreview: React.FC<CropPreviewProps> = ({
  imageUrl,
  regions,
  selectedRegionId,
  onSelectRegion,
}) => {
  const [thumbnails, setThumbnails] = useState<PreviewThumbnail[]>([]);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Generate preview thumbnails when regions or image changes
  useEffect(() => {
    if (!imageUrl || regions.length === 0) {
      setThumbnails([]);
      return;
    }

    const generateThumbnails = async () => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageUrl;
      });

      imageRef.current = img;

      const newThumbnails: PreviewThumbnail[] = [];

      for (const region of regions) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        // Generate small preview (max 150px wide)
        const maxPreviewWidth = 150;
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

        newThumbnails.push({
          id: region.id,
          dataUrl,
          label: region.label || `Panel ${regions.indexOf(region) + 1}`,
          width: region.width,
          height: region.height,
        });
      }

      setThumbnails(newThumbnails);
    };

    generateThumbnails().catch(console.error);
  }, [imageUrl, regions]);

  if (thumbnails.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Crop Preview ({thumbnails.length} panel{thumbnails.length !== 1 ? 's' : ''})
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Click a panel to select it on the canvas
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          {thumbnails.map((thumb, index) => (
            <div
              key={thumb.id}
              className={`
                relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all
                ${selectedRegionId === thumb.id
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-muted hover:border-primary/50'
                }
              `}
              onClick={() => onSelectRegion(thumb.id)}
            >
              <img
                src={thumb.dataUrl}
                alt={thumb.label}
                className="block"
                style={{ maxHeight: '120px' }}
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs px-2 py-1">
                <div className="font-medium">{thumb.label}</div>
                <div className="text-white/70">
                  {thumb.width} × {thumb.height}px
                </div>
              </div>
              <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                {index + 1}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
