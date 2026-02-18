import React, { useCallback, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Upload, X, RotateCw } from 'lucide-react';
import { ScanControls } from '@/components/PanelCropper/ScanControls';
import type { ImageLibraryStepProps } from './types';

export const ImageLibraryStep: React.FC<ImageLibraryStepProps> = ({
  images,
  onAddImages,
  onDeleteImage,
  onRotationChange,
  onBack,
  onContinue,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

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

  const selectedImage = images.find((i) => i.id === selectedImageId);

  // Rotation handlers for selected image
  const handleRotate90CW = useCallback(() => {
    if (!selectedImageId) return;
    const img = images.find((i) => i.id === selectedImageId);
    if (img) onRotationChange(selectedImageId, (img.rotation + 90) % 360);
  }, [selectedImageId, images, onRotationChange]);

  const handleRotate90CCW = useCallback(() => {
    if (!selectedImageId) return;
    const img = images.find((i) => i.id === selectedImageId);
    if (img) onRotationChange(selectedImageId, (img.rotation - 90 + 360) % 360);
  }, [selectedImageId, images, onRotationChange]);

  const handleRotationDirect = useCallback(
    (degrees: number) => {
      if (selectedImageId) onRotationChange(selectedImageId, degrees);
    },
    [selectedImageId, onRotationChange]
  );

  const handleResetRotation = useCallback(() => {
    if (selectedImageId) onRotationChange(selectedImageId, 0);
  }, [selectedImageId, onRotationChange]);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>Image Library</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload all the scan images you have of your safety card. You can use the same image for multiple panel crops.
          </p>
        </CardHeader>
      </Card>

      {/* Upload area */}
      <Card>
        <CardContent className="pt-6">
          <div
            className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:border-muted-foreground/50 hover:bg-muted/30 transition-colors"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              Drop images here or click to browse
            </p>
            <p className="text-xs text-muted-foreground/75 mt-1">
              Upload scans of your safety card panels (JPG, PNG, etc.)
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
        </CardContent>
      </Card>

      {/* Image grid */}
      {images.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Uploaded Images ({images.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Click an image to select it for rotation adjustments
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {images.map((img, index) => (
                <div
                  key={img.id}
                  className={`
                    relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all aspect-square
                    ${selectedImageId === img.id
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'border-muted hover:border-primary/50'
                    }
                  `}
                  onClick={() =>
                    setSelectedImageId(selectedImageId === img.id ? null : img.id)
                  }
                >
                  <img
                    src={img.imageUrl}
                    alt={img.label}
                    className="w-full h-full object-cover"
                    style={{
                      transform: `rotate(${img.rotation}deg)`,
                    }}
                  />
                  {/* Number badge */}
                  <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                    {index + 1}
                  </div>
                  {/* Rotation indicator */}
                  {img.rotation !== 0 && (
                    <div className="absolute top-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      <RotateCw className="h-2.5 w-2.5" />
                      {Math.round(img.rotation)}°
                    </div>
                  )}
                  {/* Delete button */}
                  <button
                    className="absolute bottom-1 right-1 p-1 bg-destructive/90 hover:bg-destructive text-destructive-foreground rounded transition-colors opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedImageId === img.id) setSelectedImageId(null);
                      onDeleteImage(img.id);
                    }}
                    title="Delete image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rotation controls for selected image */}
      {selectedImage && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Rotation &mdash; {selectedImage.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScanControls
              rotation={selectedImage.rotation}
              onRotate90CW={handleRotate90CW}
              onRotate90CCW={handleRotate90CCW}
              onRotationChange={handleRotationDirect}
              onResetRotation={handleResetRotation}
            />
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onContinue}
          disabled={images.length === 0}
          className="gap-2"
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
