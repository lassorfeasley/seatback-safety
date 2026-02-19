import React, { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Upload, X, RotateCw } from 'lucide-react';
import { ScanEditorModal } from './ScanEditorModal';
import type { ImageLibraryStepProps } from './types';

export const ImageLibraryStep: React.FC<ImageLibraryStepProps> = ({
  images,
  onAddImages,
  onDeleteImage,
  onRotationChange,
  onContinue,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const editingImage = editingImageId ? images.find((i) => i.id === editingImageId) ?? null : null;

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
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
        if (imageFiles.length > 0) {
          const dt = new DataTransfer();
          imageFiles.forEach((f) => dt.items.add(f));
          onAddImages(dt.files);
        }
      }
    },
    [onAddImages]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onAddImages(e.target.files);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [onAddImages]
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Image Library</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload all the scan images you have of your safety card. You can use the same image for multiple panel crops.
        </p>
      </div>

      {/* Upload area */}
      <div
        className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-muted-foreground/20
                   rounded-lg cursor-pointer hover:border-muted-foreground/40 hover:bg-muted/20 transition-colors"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">
          Drop images here or click to browse
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          JPG, PNG, TIFF, or WebP
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Image grid */}
      {images.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Uploaded Images ({images.length})
            </h3>
            <p className="text-xs text-muted-foreground/60">
              Click an image to edit rotation &amp; alignment
            </p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {images.map((img, index) => (
              <div
                key={img.id}
                className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-transparent hover:border-foreground/20 transition-all aspect-square"
                onClick={() => setEditingImageId(img.id)}
              >
                <img
                  src={img.imageUrl}
                  alt={img.label}
                  className="w-full h-full object-cover"
                  style={{
                    transform: `rotate(${img.rotation}deg)`,
                  }}
                />
                <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                  {index + 1}
                </div>
                {img.rotation !== 0 && (
                  <div className="absolute top-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    <RotateCw className="h-2.5 w-2.5" />
                    {Math.round(img.rotation)}°
                  </div>
                )}
                <button
                  className="absolute bottom-1 right-1 p-1 bg-destructive/90 hover:bg-destructive text-destructive-foreground rounded transition-colors opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteImage(img.id);
                  }}
                  title="Delete image"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end items-center pt-3 border-t">
        <Button
          onClick={onContinue}
          disabled={images.length === 0}
          className="gap-2"
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Scan editor modal */}
      {editingImage && (
        <ScanEditorModal
          image={editingImage}
          onRotationChange={onRotationChange}
          onDelete={(id) => {
            onDeleteImage(id);
            setEditingImageId(null);
          }}
          onClose={() => setEditingImageId(null)}
        />
      )}
    </div>
  );
};
