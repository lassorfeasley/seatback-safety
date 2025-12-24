import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Group } from 'react-konva';
import type Konva from 'konva';
import type { CropCanvasProps, CropRegion } from './types';

const MIN_REGION_SIZE = 20;
const ZOOM_SCALE_BY = 1.1;

// Check if two rectangles intersect
function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

// Find a valid position that doesn't intersect with other regions
function findNonIntersectingPosition(
  region: CropRegion,
  otherRegions: CropRegion[],
  bounds: { width: number; height: number } | null
): { x: number; y: number } {
  // Start with the desired position
  let { x, y } = region;

  // Check for intersections and try to resolve
  for (const other of otherRegions) {
    if (other.id === region.id) continue;

    const testRegion = { ...region, x, y };
    if (rectsIntersect(testRegion, other)) {
      // Try moving right of the intersecting region
      const rightX = other.x + other.width + 5;
      if (!bounds || rightX + region.width <= bounds.width) {
        x = rightX;
      } else {
        // Try moving below
        y = other.y + other.height + 5;
        x = region.x; // Reset x
      }
    }
  }

  // Clamp to bounds
  if (bounds) {
    x = Math.max(0, Math.min(bounds.width - region.width, x));
    y = Math.max(0, Math.min(bounds.height - region.height, y));
  }

  return { x, y };
}

export const CropCanvas: React.FC<CropCanvasProps> = ({
  imageUrl,
  imageDimensions,
  regions,
  selectedRegionId,
  lockDimensions,
  lockedWidth,
  lockedHeight,
  rotation,
  onRegionAdd,
  onRegionUpdate,
  onRegionSelect,
  onRegionDelete,
  onImageLoad,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [stageScale, setStageScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingRegion, setDrawingRegion] = useState<CropRegion | null>(null);

  // Calculate the bounding box of the rotated image
  const rotatedBounds = useMemo(() => {
    if (!imageDimensions) return null;
    
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    
    // The bounding box of the rotated image
    const width = imageDimensions.width * cos + imageDimensions.height * sin;
    const height = imageDimensions.width * sin + imageDimensions.height * cos;
    
    return { width, height };
  }, [imageDimensions, rotation]);

  // Keyboard event handler for delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRegionId) {
        // Don't delete if user is typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
          return;
        }
        e.preventDefault();
        onRegionDelete(selectedRegionId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRegionId, onRegionDelete]);

  // Load image when URL changes
  useEffect(() => {
    if (!imageUrl) {
      setImage(null);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);
      onImageLoad({ width: img.width, height: img.height });

      // Fit image to container
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const containerHeight = Math.min(600, window.innerHeight - 300);
        const scaleX = containerWidth / img.width;
        const scaleY = containerHeight / img.height;
        const scale = Math.min(scaleX, scaleY, 1);
        setStageScale(scale);
        setStagePosition({ x: 0, y: 0 });
      }
    };
    img.src = imageUrl;
  }, [imageUrl, onImageLoad]);

  // Update stage size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setStageSize({
          width: containerRef.current.offsetWidth,
          height: Math.max(400, Math.min(700, window.innerHeight - 300)),
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Update transformer when selection changes
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;

    const stage = stageRef.current;
    const selectedNode = stage.findOne(`#${selectedRegionId}`);

    if (selectedNode) {
      transformerRef.current.nodes([selectedNode]);
    } else {
      transformerRef.current.nodes([]);
    }
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedRegionId, regions]);

  // Handle wheel zoom
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stageScale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stagePosition.x) / oldScale,
      y: (pointer.y - stagePosition.y) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0 ? oldScale * ZOOM_SCALE_BY : oldScale / ZOOM_SCALE_BY;

    // Limit zoom
    const clampedScale = Math.max(0.1, Math.min(5, newScale));

    const newPos = {
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    };

    setStageScale(clampedScale);
    setStagePosition(newPos);
  }, [stageScale, stagePosition]);

  // Convert stage coordinates to canvas coordinates (for axis-aligned crops on rotated image)
  const stageToCanvasCoords = useCallback(
    (stageX: number, stageY: number) => {
      // Simple conversion - crops are in canvas space (axis-aligned)
      return {
        x: (stageX - stagePosition.x) / stageScale,
        y: (stageY - stagePosition.y) / stageScale,
      };
    },
    [stageScale, stagePosition]
  );

  // Check if a new region would intersect with existing ones
  const wouldIntersect = useCallback(
    (newRegion: CropRegion, excludeId?: string) => {
      for (const region of regions) {
        if (region.id === excludeId) continue;
        if (rectsIntersect(newRegion, region)) {
          return true;
        }
      }
      return false;
    },
    [regions]
  );

  // Handle mouse down - start drawing new region
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Only start drawing if clicking on stage/image, not on existing regions
      const target = e.target;
      const isRegion = target.name()?.startsWith('crop-') || target.id()?.startsWith('crop-');
      
      if (isRegion) {
        return;
      }

      // Deselect when clicking empty area
      onRegionSelect(null);

      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const canvasCoords = stageToCanvasCoords(pointer.x, pointer.y);

      // Check if click is within the rotated image bounds
      if (rotatedBounds) {
        if (
          canvasCoords.x < 0 ||
          canvasCoords.y < 0 ||
          canvasCoords.x > rotatedBounds.width ||
          canvasCoords.y > rotatedBounds.height
        ) {
          return;
        }
      }

      setIsDrawing(true);

      const newRegion: CropRegion = {
        id: `crop-${Date.now()}`,
        x: Math.round(canvasCoords.x),
        y: Math.round(canvasCoords.y),
        width: lockDimensions && lockedWidth ? lockedWidth : 0,
        height: lockDimensions && lockedHeight ? lockedHeight : 0,
      };

      setDrawingRegion(newRegion);
    },
    [rotatedBounds, lockDimensions, lockedWidth, lockedHeight, onRegionSelect, stageToCanvasCoords]
  );

  // Handle mouse move - resize drawing region
  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isDrawing || !drawingRegion) return;

      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const canvasCoords = stageToCanvasCoords(pointer.x, pointer.y);

      // Clamp to rotated image bounds
      const clampedX = rotatedBounds
        ? Math.max(0, Math.min(rotatedBounds.width, canvasCoords.x))
        : canvasCoords.x;
      const clampedY = rotatedBounds
        ? Math.max(0, Math.min(rotatedBounds.height, canvasCoords.y))
        : canvasCoords.y;

      // If dimensions are locked, don't resize
      if (lockDimensions && lockedWidth && lockedHeight) {
        return;
      }

      const width = Math.round(clampedX - drawingRegion.x);
      const height = Math.round(clampedY - drawingRegion.y);

      setDrawingRegion({
        ...drawingRegion,
        width: width,
        height: height,
      });
    },
    [isDrawing, drawingRegion, rotatedBounds, lockDimensions, lockedWidth, lockedHeight, stageToCanvasCoords]
  );

  // Handle mouse up - finish drawing region
  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !drawingRegion) {
      setIsDrawing(false);
      return;
    }

    setIsDrawing(false);

    // Normalize region (handle negative width/height from drawing backwards)
    let { x, y, width, height } = drawingRegion;

    if (width < 0) {
      x = x + width;
      width = Math.abs(width);
    }
    if (height < 0) {
      y = y + height;
      height = Math.abs(height);
    }

    // Use locked dimensions if available
    if (lockDimensions && lockedWidth && lockedHeight) {
      width = lockedWidth;
      height = lockedHeight;
    }

    // Only add if region is large enough
    if (width >= MIN_REGION_SIZE && height >= MIN_REGION_SIZE) {
      const candidateRegion: CropRegion = {
        ...drawingRegion,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
        label: `Panel ${regions.length + 1}`,
      };

      // Check for intersection and find valid position
      if (wouldIntersect(candidateRegion)) {
        const validPos = findNonIntersectingPosition(candidateRegion, regions, rotatedBounds);
        candidateRegion.x = validPos.x;
        candidateRegion.y = validPos.y;

        // If still intersecting after adjustment, don't add
        if (wouldIntersect(candidateRegion)) {
          setDrawingRegion(null);
          return;
        }
      }

      onRegionAdd(candidateRegion);
    }

    setDrawingRegion(null);
  }, [isDrawing, drawingRegion, lockDimensions, lockedWidth, lockedHeight, regions, rotatedBounds, wouldIntersect, onRegionAdd]);

  // Handle region click (select)
  const handleRegionClick = useCallback(
    (regionId: string) => {
      onRegionSelect(regionId);
    },
    [onRegionSelect]
  );

  // Handle region transform (resize)
  const handleRegionTransformEnd = useCallback(
    (regionId: string, e: Konva.KonvaEventObject<Event>) => {
      const node = e.target as Konva.Rect;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      // Reset scale and apply to width/height
      node.scaleX(1);
      node.scaleY(1);

      const region = regions.find((r) => r.id === regionId);
      if (!region) return;

      const updatedRegion: CropRegion = {
        ...region,
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        width: Math.round(Math.max(MIN_REGION_SIZE, node.width() * scaleX)),
        height: Math.round(Math.max(MIN_REGION_SIZE, node.height() * scaleY)),
      };

      // Check for intersection with other regions
      if (wouldIntersect(updatedRegion, regionId)) {
        // Revert to original position/size
        node.x(region.x);
        node.y(region.y);
        node.width(region.width);
        node.height(region.height);
        return;
      }

      onRegionUpdate(updatedRegion);
    },
    [regions, wouldIntersect, onRegionUpdate]
  );

  // Handle region drag end
  const handleRegionDragEnd = useCallback(
    (regionId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Rect;
      const region = regions.find((r) => r.id === regionId);
      if (!region) return;

      // Clamp position to rotated bounds
      let x = node.x();
      let y = node.y();

      if (rotatedBounds) {
        x = Math.max(0, Math.min(rotatedBounds.width - region.width, x));
        y = Math.max(0, Math.min(rotatedBounds.height - region.height, y));
      }

      const updatedRegion: CropRegion = {
        ...region,
        x: Math.round(x),
        y: Math.round(y),
      };

      // Check for intersection and revert if needed
      if (wouldIntersect(updatedRegion, regionId)) {
        // Find non-intersecting position
        const validPos = findNonIntersectingPosition(updatedRegion, regions, rotatedBounds);
        
        // If still intersecting, revert to original
        const testRegion = { ...updatedRegion, ...validPos };
        if (wouldIntersect(testRegion, regionId)) {
          node.x(region.x);
          node.y(region.y);
          return;
        }
        
        updatedRegion.x = validPos.x;
        updatedRegion.y = validPos.y;
      }

      onRegionUpdate(updatedRegion);
    },
    [regions, rotatedBounds, wouldIntersect, onRegionUpdate]
  );

  // Normalize drawing region for display
  const normalizedDrawingRegion = drawingRegion
    ? {
        ...drawingRegion,
        x: drawingRegion.width < 0 ? drawingRegion.x + drawingRegion.width : drawingRegion.x,
        y: drawingRegion.height < 0 ? drawingRegion.y + drawingRegion.height : drawingRegion.y,
        width: Math.abs(drawingRegion.width),
        height: Math.abs(drawingRegion.height),
      }
    : null;

  // Check if currently drawing region would intersect
  const drawingWouldIntersect = useMemo(() => {
    if (!normalizedDrawingRegion || normalizedDrawingRegion.width < MIN_REGION_SIZE || normalizedDrawingRegion.height < MIN_REGION_SIZE) {
      return false;
    }
    return wouldIntersect(normalizedDrawingRegion as CropRegion);
  }, [normalizedDrawingRegion, wouldIntersect]);

  // Calculate image position to center the rotated image
  const imageOffset = useMemo(() => {
    if (!imageDimensions || !rotatedBounds) return { x: 0, y: 0 };
    return {
      x: (rotatedBounds.width - imageDimensions.width) / 2,
      y: (rotatedBounds.height - imageDimensions.height) / 2,
    };
  }, [imageDimensions, rotatedBounds]);

  return (
    <div 
      ref={containerRef} 
      className="relative w-full overflow-hidden bg-neutral-900 rounded-b-lg"
      tabIndex={0}
    >
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePosition.x}
        y={stagePosition.y}
        draggable={!isDrawing}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <Layer>
          {/* Rotated image (the image rotates to align with axis-aligned crops) */}
          {image && imageDimensions && (
            <Group
              x={imageOffset.x + imageDimensions.width / 2}
              y={imageOffset.y + imageDimensions.height / 2}
              rotation={rotation}
              offsetX={imageDimensions.width / 2}
              offsetY={imageDimensions.height / 2}
            >
              <KonvaImage
                image={image}
                name="background-image"
                listening={true}
              />
            </Group>
          )}

          {/* Axis-aligned crop regions (these stay horizontal/vertical) */}
          {regions.map((region) => (
            <Rect
              key={region.id}
              id={region.id}
              name={region.id}
              x={region.x}
              y={region.y}
              width={region.width}
              height={region.height}
              fill="rgba(99, 102, 241, 0.2)"
              stroke={selectedRegionId === region.id ? '#6366f1' : '#818cf8'}
              strokeWidth={selectedRegionId === region.id ? 3 / stageScale : 2 / stageScale}
              draggable
              onClick={() => handleRegionClick(region.id)}
              onTap={() => handleRegionClick(region.id)}
              onDragEnd={(e) => handleRegionDragEnd(region.id, e)}
              onTransformEnd={(e) => handleRegionTransformEnd(region.id, e)}
            />
          ))}

          {/* Currently drawing region (axis-aligned) */}
          {normalizedDrawingRegion && normalizedDrawingRegion.width > 0 && normalizedDrawingRegion.height > 0 && (
            <Rect
              x={normalizedDrawingRegion.x}
              y={normalizedDrawingRegion.y}
              width={normalizedDrawingRegion.width}
              height={normalizedDrawingRegion.height}
              fill={drawingWouldIntersect ? 'rgba(239, 68, 68, 0.3)' : 'rgba(99, 102, 241, 0.3)'}
              stroke={drawingWouldIntersect ? '#ef4444' : '#6366f1'}
              strokeWidth={2 / stageScale}
              dash={[10 / stageScale, 5 / stageScale]}
            />
          )}

          {/* Transformer for selected region - edge handles only */}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              // Limit minimum size
              if (newBox.width < MIN_REGION_SIZE || newBox.height < MIN_REGION_SIZE) {
                return oldBox;
              }
              return newBox;
            }}
            rotateEnabled={false}
            keepRatio={false}
            enabledAnchors={['top-center', 'bottom-center', 'middle-left', 'middle-right']}
            anchorSize={14}
            anchorStroke="#6366f1"
            anchorFill="#ffffff"
            anchorCornerRadius={2}
            borderStroke="#6366f1"
            borderStrokeWidth={2}
          />

          {/* Fallback when no dimensions yet */}
          {image && !imageDimensions && (
            <KonvaImage
              image={image}
              name="background-image"
              listening={true}
            />
          )}
        </Layer>
      </Stage>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex gap-2">
        <button
          className="bg-white/90 hover:bg-white rounded-md px-3 py-1 text-sm font-medium shadow"
          onClick={() => setStageScale((s) => Math.min(5, s * 1.2))}
        >
          +
        </button>
        <button
          className="bg-white/90 hover:bg-white rounded-md px-3 py-1 text-sm font-medium shadow"
          onClick={() => setStageScale((s) => Math.max(0.1, s / 1.2))}
        >
          −
        </button>
        <button
          className="bg-white/90 hover:bg-white rounded-md px-3 py-1 text-sm font-medium shadow"
          onClick={() => {
            setStageScale(1);
            setStagePosition({ x: 0, y: 0 });
          }}
        >
          1:1
        </button>
      </div>

      {/* Image info overlay */}
      {imageDimensions && (
        <div className="absolute top-4 left-4 bg-black/60 text-white text-xs px-2 py-1 rounded">
          {imageDimensions.width} × {imageDimensions.height}px | Zoom: {Math.round(stageScale * 100)}%
          {rotation !== 0 && ` | Rotation: ${Math.round(rotation * 10) / 10}°`}
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 bg-black/60 text-white text-xs px-2 py-1 rounded">
        Click + drag to crop | Delete/Backspace to remove | Scroll to zoom
      </div>
    </div>
  );
};
