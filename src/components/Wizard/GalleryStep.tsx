import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Check, GripVertical, Star, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LibraryImage } from './types';

interface GalleryStepProps {
  images: LibraryImage[];
  ogImageIndex: number | null;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onSelectOg: (index: number) => void;
  onBack: () => void;
  onSave: () => void;
  isSaving?: boolean;
  saveProgress?: string;
}

export const GalleryStep: React.FC<GalleryStepProps> = ({
  images,
  ogImageIndex,
  onReorder,
  onSelectOg,
  onBack,
  onSave,
  isSaving,
  saveProgress,
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== toIndex) {
      onReorder(dragIndex, toIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  return (
    <div className="flex flex-col h-full p-6 gap-5">
      <div className="flex-shrink-0">
        <h2 className="text-2xl font-semibold tracking-tight">Gallery Setup</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Drag to reorder scans. Click the star to select which image represents this card.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-w-3xl">
          {images.map((img, index) => {
            const isOg = ogImageIndex === index;
            const isDragging = dragIndex === index;
            const isDragOver = dragOverIndex === index && dragIndex !== index;

            return (
              <div
                key={img.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'relative group rounded-lg overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing',
                  isOg ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-muted',
                  isDragging && 'opacity-40',
                  isDragOver && 'border-primary ring-2 ring-primary/20',
                )}
              >
                <div className="aspect-square bg-muted/30">
                  <img
                    src={img.imageUrl}
                    alt={img.label}
                    className="w-full h-full object-cover"
                    style={{ transform: img.rotation ? `rotate(${img.rotation}deg)` : undefined }}
                    draggable={false}
                  />
                </div>

                <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                  <div className="bg-black/60 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                    <GripVertical className="h-3 w-3 opacity-60" />
                    {index + 1}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSelectOg(index); }}
                  className={cn(
                    'absolute top-1.5 right-1.5 p-1.5 rounded-full transition-all',
                    isOg
                      ? 'bg-amber-400 text-white'
                      : 'bg-black/50 text-white/60 opacity-0 group-hover:opacity-100 hover:bg-black/70 hover:text-white',
                  )}
                  title={isOg ? 'Selected as cover image' : 'Set as cover image'}
                >
                  <Star className={cn('h-3.5 w-3.5', isOg && 'fill-current')} />
                </button>

                {isOg && (
                  <div className="absolute bottom-0 inset-x-0 bg-amber-400/90 text-white text-[10px] font-semibold text-center py-0.5 uppercase tracking-wider">
                    Cover
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {images.length === 0 && (
          <div className="flex items-center justify-center h-40">
            <p className="text-sm text-muted-foreground">No images uploaded. Go back to add scans.</p>
          </div>
        )}
      </div>

      <div className="flex justify-between flex-shrink-0 pt-3 border-t">
        <Button variant="outline" size="lg" onClick={onBack} className="gap-2">
          Back
        </Button>
        <Button
          size="lg"
          onClick={onSave}
          disabled={images.length === 0 || isSaving}
          className="gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {saveProgress || 'Saving...'}
            </>
          ) : (
            <>
              Save to Library
              <Check className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
