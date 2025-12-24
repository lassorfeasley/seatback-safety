import React, { useCallback, useRef } from 'react';
import type { ScanGalleryProps } from './types';

export const ScanGallery: React.FC<ScanGalleryProps> = ({
  scans,
  activeScanId,
  side,
  onScanSelect,
  onScanAdd,
  onScanDelete,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        // Filter for image files only
        const imageFiles = Array.from(files).filter((f) =>
          f.type.startsWith('image/')
        );
        if (imageFiles.length > 0) {
          const dt = new DataTransfer();
          imageFiles.forEach((f) => dt.items.add(f));
          onScanAdd(dt.files, side);
        }
      }
    },
    [onScanAdd, side]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onScanAdd(files, side);
      }
      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onScanAdd, side]
  );

  const handleAddClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const sideLabel = side === 'front' ? 'Front' : 'Back';

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          {sideLabel} Scans ({scans.length})
        </h3>
      </div>

      <div
        className="flex gap-3 overflow-x-auto pb-2"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Existing scans */}
        {scans.map((scan, index) => (
          <div
            key={scan.id}
            className={`
              relative flex-shrink-0 cursor-pointer rounded-lg overflow-hidden border-2 transition-all
              ${activeScanId === scan.id
                ? 'border-primary ring-2 ring-primary/20'
                : 'border-muted hover:border-primary/50'
              }
            `}
            onClick={() => onScanSelect(scan.id)}
          >
            <img
              src={scan.imageUrl}
              alt={scan.label || `${sideLabel} Scan ${index + 1}`}
              className="block w-24 h-24 object-cover"
            />
            {/* Scan number badge */}
            <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
              {index + 1}
            </div>
            {/* Crop count badge */}
            {scan.regions.length > 0 && (
              <div className="absolute top-1 right-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded">
                {scan.regions.length} crop{scan.regions.length !== 1 ? 's' : ''}
              </div>
            )}
            {/* Delete button */}
            <button
              className="absolute bottom-1 right-1 p-1 bg-destructive/90 hover:bg-destructive text-destructive-foreground rounded transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onScanDelete(scan.id);
              }}
              title="Delete scan"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            {/* Label */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs px-2 py-1 text-center">
              {scan.label || `Scan ${index + 1}`}
            </div>
          </div>
        ))}

        {/* Add scan button */}
        <button
          className="
            flex-shrink-0 w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25
            hover:border-muted-foreground/50 hover:bg-muted/50
            flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer
          "
          onClick={handleAddClick}
        >
          <svg
            className="w-6 h-6 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="text-xs text-muted-foreground">Add Scan</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />
      </div>

      {scans.length === 0 && (
        <div
          className="mt-2 flex flex-col items-center justify-center py-8 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:border-muted-foreground/50 transition-colors"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleAddClick}
        >
          <svg
            className="h-10 w-10 text-muted-foreground/50 mb-2"
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
          <p className="text-sm text-muted-foreground">
            Drop {sideLabel.toLowerCase()} scans here or click to browse
          </p>
          <p className="text-xs text-muted-foreground/75 mt-1">
            You can add multiple scans if the panel doesn't fit in one scan
          </p>
        </div>
      )}
    </div>
  );
};

