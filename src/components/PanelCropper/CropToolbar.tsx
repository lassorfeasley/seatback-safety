import React from 'react';
import { Button } from '@/components/ui/button';
import { Lock, Unlock, Trash2, Download, RotateCcw } from 'lucide-react';
import type { CropToolbarProps } from './types';

export const CropToolbar: React.FC<CropToolbarProps> = ({
  hasImage,
  hasRegions,
  lockDimensions,
  lockedWidth,
  lockedHeight,
  selectedRegionId,
  onToggleLock,
  onResetDimensions,
  onDeleteSelected,
  onDeleteAll,
  onExport,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Dimension Lock Toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant={lockDimensions ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleLock}
          disabled={!hasImage}
          className="gap-2"
        >
          {lockDimensions ? (
            <>
              <Lock className="h-4 w-4" />
              Dimensions Locked
            </>
          ) : (
            <>
              <Unlock className="h-4 w-4" />
              Dimensions Unlocked
            </>
          )}
        </Button>

        {lockDimensions && lockedWidth && lockedHeight && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded font-mono">
              {lockedWidth} × {lockedHeight}px
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetDimensions}
              title="Reset dimensions (next crop will set new size)"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        )}

        {lockDimensions && !lockedWidth && (
          <span className="text-sm text-muted-foreground">
            Draw first crop to set dimensions
          </span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Delete Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onDeleteSelected}
          disabled={!selectedRegionId}
          className="gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Delete Selected
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onDeleteAll}
          disabled={!hasRegions}
          className="gap-2 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Delete All
        </Button>
      </div>

      {/* Export */}
      <Button
        variant="default"
        size="sm"
        onClick={onExport}
        disabled={!hasRegions}
        className="gap-2"
      >
        <Download className="h-4 w-4" />
        Export Crops
      </Button>
    </div>
  );
};

