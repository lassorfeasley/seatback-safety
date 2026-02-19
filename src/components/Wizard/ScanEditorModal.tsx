import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Check } from 'lucide-react';
import { ScanControls } from '@/components/PanelCropper/ScanControls';
import type { LibraryImage } from './types';

interface ScanEditorModalProps {
  image: LibraryImage;
  onRotationChange: (imageId: string, rotation: number) => void;
  onDelete: (imageId: string) => void;
  onClose: () => void;
}

type GuideMode = 'off' | 'crosshair' | 'grid';

export const ScanEditorModal: React.FC<ScanEditorModalProps> = ({
  image,
  onRotationChange,
  onDelete,
  onClose,
}) => {
  const [guideMode, setGuideMode] = useState<GuideMode>('crosshair');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'g' || e.key === 'G') {
        setGuideMode((prev) =>
          prev === 'off' ? 'crosshair' : prev === 'crosshair' ? 'grid' : 'off'
        );
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleRotate90CW = useCallback(() => {
    onRotationChange(image.id, (image.rotation + 90) % 360);
  }, [image.id, image.rotation, onRotationChange]);

  const handleRotate90CCW = useCallback(() => {
    onRotationChange(image.id, (image.rotation - 90 + 360) % 360);
  }, [image.id, image.rotation, onRotationChange]);

  const handleRotationDirect = useCallback(
    (degrees: number) => onRotationChange(image.id, degrees),
    [image.id, onRotationChange]
  );

  const handleResetRotation = useCallback(
    () => onRotationChange(image.id, 0),
    [image.id, onRotationChange]
  );

  const handleDelete = useCallback(() => {
    onDelete(image.id);
    onClose();
  }, [image.id, onDelete, onClose]);

  const cycleGuides = useCallback(() => {
    setGuideMode((prev) =>
      prev === 'off' ? 'crosshair' : prev === 'crosshair' ? 'grid' : 'off'
    );
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{image.label}</h2>
          {image.imageDimensions && (
            <span className="text-xs text-muted-foreground">
              {image.imageDimensions.width} &times; {image.imageDimensions.height}px
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={cycleGuides}
            className={`gap-1.5 text-xs ${guideMode !== 'off' ? 'border-red-500/50 text-red-500' : ''}`}
          >
            {guideMode === 'off' ? '⊞ Guides' : guideMode === 'crosshair' ? '┼ Crosshair' : '▦ Grid'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
          <Button size="sm" onClick={onClose} className="gap-1.5">
            <Check className="h-4 w-4" />
            Done
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-8 bg-neutral-900/50">
        <div className="relative max-w-full max-h-full">
          <img
            src={image.imageUrl}
            alt={image.label}
            className="max-w-full max-h-[calc(100vh-280px)] object-contain rounded shadow-2xl"
            style={{
              transform: `rotate(${image.rotation}deg)`,
              transition: 'transform 0.2s ease',
            }}
          />
          {guideMode !== 'off' && <AlignmentGuides mode={guideMode} />}
        </div>
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 border-t bg-background px-6 py-4">
        <div className="max-w-xl mx-auto">
          <ScanControls
            rotation={image.rotation}
            onRotate90CW={handleRotate90CW}
            onRotate90CCW={handleRotate90CCW}
            onRotationChange={handleRotationDirect}
            onResetRotation={handleResetRotation}
          />
        </div>
      </div>
    </div>
  );
};

// ─── Alignment Guides ─────────────────────────────────────────────

const GUIDE_CENTER = 'rgba(220,38,38,0.6)';
const GUIDE_LINE = 'rgba(220,38,38,0.25)';
const GRID_COUNT = 20;

function buildLines(count: number) {
  const lines: number[] = [];
  for (let i = 1; i < count; i++) {
    lines.push((i / count) * 100);
  }
  return lines;
}

const gridLines = buildLines(GRID_COUNT);

const AlignmentGuides: React.FC<{ mode: 'crosshair' | 'grid' }> = ({ mode }) => (
  <div className="absolute inset-0 z-20 pointer-events-none">
    {/* Center crosshair */}
    <div
      className="absolute left-1/2 top-0 bottom-0 w-px"
      style={{ backgroundColor: GUIDE_CENTER }}
    />
    <div
      className="absolute top-1/2 left-0 right-0 h-px"
      style={{ backgroundColor: GUIDE_CENTER }}
    />

    {mode === 'grid' && gridLines.map((pct) => (
      <React.Fragment key={pct}>
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{ left: `${pct}%`, backgroundColor: GUIDE_LINE }}
        />
        <div
          className="absolute left-0 right-0 h-px"
          style={{ top: `${pct}%`, backgroundColor: GUIDE_LINE }}
        />
      </React.Fragment>
    ))}
  </div>
);
