import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { CropCanvasProps, CropRegion } from './types';

const MIN_REGION_SIZE = 20;
const ZOOM_SCALE_BY = 1.1;

export const CropCanvas: React.FC<CropCanvasProps> = ({
  imageUrl,
  imageDimensions,
  regions,
  selectedRegionId,
  lockDimensions,
  lockedWidth,
  lockedHeight,
  onRegionAdd,
  onRegionUpdate,
  onRegionSelect,
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
    const selectedNode = stage.findOne(`#region-${selectedRegionId}`);

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

  // Convert stage coordinates to image coordinates
  const stageToImageCoords = useCallback(
    (stageX: number, stageY: number) => {
      return {
        x: (stageX - stagePosition.x) / stageScale,
        y: (stageY - stagePosition.y) / stageScale,
      };
    },
    [stageScale, stagePosition]
  );

  // Handle mouse down - start drawing new region
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Only start drawing if clicking on stage/image, not on existing regions
      const clickedOnEmpty = e.target === e.target.getStage() || e.target.name() === 'background-image';
      
      if (!clickedOnEmpty) {
        return;
      }

      // Deselect when clicking empty area
      onRegionSelect(null);

      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const imageCoords = stageToImageCoords(pointer.x, pointer.y);

      // Check if click is within image bounds
      if (
        imageDimensions &&
        (imageCoords.x < 0 ||
          imageCoords.y < 0 ||
          imageCoords.x > imageDimensions.width ||
          imageCoords.y > imageDimensions.height)
      ) {
        return;
      }

      setIsDrawing(true);

      const newRegion: CropRegion = {
        id: `region-${Date.now()}`,
        x: Math.round(imageCoords.x),
        y: Math.round(imageCoords.y),
        width: lockDimensions && lockedWidth ? lockedWidth : 0,
        height: lockDimensions && lockedHeight ? lockedHeight : 0,
      };

      setDrawingRegion(newRegion);
    },
    [imageDimensions, lockDimensions, lockedWidth, lockedHeight, onRegionSelect, stageToImageCoords]
  );

  // Handle mouse move - resize drawing region
  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isDrawing || !drawingRegion) return;

      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const imageCoords = stageToImageCoords(pointer.x, pointer.y);

      // Clamp to image bounds
      const clampedX = imageDimensions
        ? Math.max(0, Math.min(imageDimensions.width, imageCoords.x))
        : imageCoords.x;
      const clampedY = imageDimensions
        ? Math.max(0, Math.min(imageDimensions.height, imageCoords.y))
        : imageCoords.y;

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
    [isDrawing, drawingRegion, imageDimensions, lockDimensions, lockedWidth, lockedHeight, stageToImageCoords]
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
      const finalRegion: CropRegion = {
        ...drawingRegion,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
        label: `Panel ${regions.length + 1}`,
      };
      onRegionAdd(finalRegion);
    }

    setDrawingRegion(null);
  }, [isDrawing, drawingRegion, lockDimensions, lockedWidth, lockedHeight, regions.length, onRegionAdd]);

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

      onRegionUpdate(updatedRegion);
    },
    [regions, onRegionUpdate]
  );

  // Handle region drag end
  const handleRegionDragEnd = useCallback(
    (regionId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Rect;
      const region = regions.find((r) => r.id === regionId);
      if (!region) return;

      // Clamp position to image bounds
      let x = node.x();
      let y = node.y();

      if (imageDimensions) {
        x = Math.max(0, Math.min(imageDimensions.width - region.width, x));
        y = Math.max(0, Math.min(imageDimensions.height - region.height, y));
      }

      const updatedRegion: CropRegion = {
        ...region,
        x: Math.round(x),
        y: Math.round(y),
      };

      onRegionUpdate(updatedRegion);
    },
    [regions, imageDimensions, onRegionUpdate]
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

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden bg-neutral-900 rounded-b-lg">
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
          {/* Background Image */}
          {image && (
            <KonvaImage
              image={image}
              name="background-image"
              listening={true}
            />
          )}

          {/* Existing regions */}
          {regions.map((region) => (
            <Rect
              key={region.id}
              id={`region-${region.id}`}
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

          {/* Currently drawing region */}
          {normalizedDrawingRegion && normalizedDrawingRegion.width > 0 && normalizedDrawingRegion.height > 0 && (
            <Rect
              x={normalizedDrawingRegion.x}
              y={normalizedDrawingRegion.y}
              width={normalizedDrawingRegion.width}
              height={normalizedDrawingRegion.height}
              fill="rgba(99, 102, 241, 0.3)"
              stroke="#6366f1"
              strokeWidth={2 / stageScale}
              dash={[10 / stageScale, 5 / stageScale]}
            />
          )}

          {/* Transformer for selected region */}
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
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          />
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
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 bg-black/60 text-white text-xs px-2 py-1 rounded">
        Click + drag to create crop | Scroll to zoom | Drag canvas to pan
      </div>
    </div>
  );
};
