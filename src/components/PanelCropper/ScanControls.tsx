import React, { useCallback, useMemo } from 'react';
import type { ScanControlsProps } from './types';

export const ScanControls: React.FC<ScanControlsProps> = ({
  rotation,
  onRotate90CW,
  onRotate90CCW,
  onRotationChange,
  onResetRotation,
}) => {
  // Calculate the base rotation (nearest 90° increment) and the fine adjustment
  const { baseRotation, fineAdjustment } = useMemo(() => {
    // Find the nearest 90° increment
    const base = Math.round(rotation / 90) * 90;
    const fine = rotation - base;
    return { baseRotation: base, fineAdjustment: fine };
  }, [rotation]);

  // Handle fine-tune slider change - adjusts relative to the base rotation
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fineValue = parseFloat(e.target.value);
      onRotationChange(baseRotation + fineValue);
    },
    [onRotationChange, baseRotation]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      if (!isNaN(value)) {
        // Normalize to -180 to 180 range
        let normalized = value % 360;
        if (normalized > 180) normalized -= 360;
        if (normalized < -180) normalized += 360;
        onRotationChange(normalized);
      }
    },
    [onRotationChange]
  );

  // Format rotation for display
  const displayRotation = Math.round(rotation * 10) / 10;
  const displayFineAdjustment = Math.round(fineAdjustment * 10) / 10;

  return (
    <div className="flex flex-col gap-3 p-4 bg-muted/30 rounded-lg">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Rotation</h4>
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={onResetRotation}
          title="Reset rotation to 0°"
        >
          Reset
        </button>
      </div>

      {/* Quick rotate buttons */}
      <div className="flex items-center gap-2">
        <button
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-background hover:bg-accent border border-border rounded-md text-sm font-medium transition-colors"
          onClick={onRotate90CCW}
          title="Rotate 90° counter-clockwise"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
            />
          </svg>
          90°
        </button>

        <button
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-background hover:bg-accent border border-border rounded-md text-sm font-medium transition-colors"
          onClick={onRotate90CW}
          title="Rotate 90° clockwise"
        >
          90°
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
            />
          </svg>
        </button>

        <div className="flex-1" />

        {/* Rotation value input */}
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={displayRotation}
            onChange={handleInputChange}
            className="w-16 px-2 py-1 text-sm text-center bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
            step="0.5"
            min="-180"
            max="180"
          />
          <span className="text-sm text-muted-foreground">°</span>
        </div>
      </div>

      {/* Fine-tune slider - adjusts relative to current base rotation */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-8 text-right">-15°</span>
          <input
            type="range"
            min="-15"
            max="15"
            step="0.1"
            value={Math.max(-15, Math.min(15, fineAdjustment))}
            onChange={handleSliderChange}
            className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            title="Fine-tune rotation angle"
          />
          <span className="text-xs text-muted-foreground w-8">+15°</span>
        </div>
        {baseRotation !== 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Base: {baseRotation}° {displayFineAdjustment >= 0 ? '+' : ''}{displayFineAdjustment}° = {displayRotation}°
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Use the buttons for 90° increments, then fine-tune with the slider
      </p>
    </div>
  );
};
