import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Group, Line } from 'react-konva';
import type Konva from 'konva';
import type { CropCanvasProps, CropRegion } from './types';

type GuideMode = 'off' | 'crosshair' | 'grid';

const MIN_REGION_SIZE = 20;
const ZOOM_SCALE_BY = 1.1;
const MAX_ZOOM = 5;
const MIN_ZOOM = 0.01;

export const CropCanvas: React.FC<CropCanvasProps> = ({
  imageUrl,
  imageDimensions,
  regions,
  selectedRegionId,
  lockDimensions,
  lockedWidth,
  lockedHeight,
  constrainHeight,
  rotation,
  singleCropMode = false,
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

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawingRegion, setDrawingRegion] = useState<CropRegion | null>(null);

  // Alignment guides
  const [guideMode, setGuideMode] = useState<GuideMode>('crosshair');

  const hasLockedDimensions = lockDimensions && lockedWidth != null && lockedHeight != null;
  const hasConstrainedHeight = !hasLockedDimensions && constrainHeight != null && constrainHeight > 0;

  // ─── Rotated image bounds ──────────────────────────────────────

  const rotatedBounds = useMemo(() => {
    if (!imageDimensions) return null;
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    return {
      width: imageDimensions.width * cos + imageDimensions.height * sin,
      height: imageDimensions.width * sin + imageDimensions.height * cos,
    };
  }, [imageDimensions, rotation]);

  const imageOffset = useMemo(() => {
    if (!imageDimensions || !rotatedBounds) return { x: 0, y: 0 };
    return {
      x: (rotatedBounds.width - imageDimensions.width) / 2,
      y: (rotatedBounds.height - imageDimensions.height) / 2,
    };
  }, [imageDimensions, rotatedBounds]);

  // ─── Fit image to container ────────────────────────────────────

  const fitToContainer = useCallback(() => {
    if (!containerRef.current || !rotatedBounds) return;
    const containerWidth = containerRef.current.offsetWidth;
    const containerHeight = stageSize.height;
    const scaleX = containerWidth / rotatedBounds.width;
    const scaleY = containerHeight / rotatedBounds.height;
    const scale = Math.min(scaleX, scaleY) * 0.9; // 90% to add padding
    const clampedScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));

    // Center the image in the container
    const offsetX = (containerWidth - rotatedBounds.width * clampedScale) / 2;
    const offsetY = (containerHeight - rotatedBounds.height * clampedScale) / 2;

    setStageScale(clampedScale);
    setStagePosition({ x: offsetX, y: offsetY });
  }, [rotatedBounds, stageSize.height]);

  // ─── Keyboard: Delete/Backspace + G for guide toggle ──────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRegionId) {
        e.preventDefault();
        onRegionDelete(selectedRegionId);
      }
      if (e.key === 'g' || e.key === 'G') {
        setGuideMode((prev) =>
          prev === 'off' ? 'crosshair' : prev === 'crosshair' ? 'grid' : 'off'
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRegionId, onRegionDelete]);

  // ─── Load image ────────────────────────────────────────────────

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
    };
    img.src = imageUrl;
  }, [imageUrl, onImageLoad]);

  // Fit to container only when a NEW image loads (not on rotation changes)
  const fittedImageRef = useRef<string | null>(null);
  useEffect(() => {
    if (rotatedBounds && imageUrl && imageUrl !== fittedImageRef.current) {
      fittedImageRef.current = imageUrl;
      fitToContainer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotatedBounds, imageUrl]);

  // ─── Resize container ──────────────────────────────────────────

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

  // ─── Transformer sync ─────────────────────────────────────────

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    const selectedNode = stageRef.current.findOne(`#${selectedRegionId}`);
    if (selectedNode && !hasLockedDimensions) {
      transformerRef.current.nodes([selectedNode]);
    } else {
      transformerRef.current.nodes([]);
    }
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedRegionId, regions, hasLockedDimensions]);

  // ─── Coordinate conversion ─────────────────────────────────────

  const pointerToCanvas = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return {
      x: (pointer.x - stagePosition.x) / stageScale,
      y: (pointer.y - stagePosition.y) / stageScale,
    };
  }, [stageScale, stagePosition]);

  // Clamp a point to rotated image bounds
  const clampToBounds = useCallback(
    (x: number, y: number) => {
      if (!rotatedBounds) return { x, y };
      return {
        x: Math.max(0, Math.min(rotatedBounds.width, x)),
        y: Math.max(0, Math.min(rotatedBounds.height, y)),
      };
    },
    [rotatedBounds]
  );

  // ─── Zoom (scroll wheel, pointer-centric) ─────────────────────

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const oldScale = stageScale;
      const mousePointTo = {
        x: (pointer.x - stagePosition.x) / oldScale,
        y: (pointer.y - stagePosition.y) / oldScale,
      };

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale =
        direction > 0 ? oldScale * ZOOM_SCALE_BY : oldScale / ZOOM_SCALE_BY;
      const clampedScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));

      setStageScale(clampedScale);
      setStagePosition({
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
      });
    },
    [stageScale, stagePosition]
  );

  // ─── Zoom buttons (center-centric) ────────────────────────────

  const zoomBy = useCallback(
    (factor: number) => {
      const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, stageScale * factor));
      // Zoom towards the center of the viewport
      const centerX = stageSize.width / 2;
      const centerY = stageSize.height / 2;
      const mousePointTo = {
        x: (centerX - stagePosition.x) / stageScale,
        y: (centerY - stagePosition.y) / stageScale,
      };
      setStageScale(newScale);
      setStagePosition({
        x: centerX - mousePointTo.x * newScale,
        y: centerY - mousePointTo.y * newScale,
      });
    },
    [stageScale, stagePosition, stageSize]
  );

  // ─── Mouse handlers ────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Only react to left click
      if (e.evt.button !== 0) return;

      const target = e.target;
      const clickedOnRegion =
        target.name()?.startsWith('crop-') || target.id()?.startsWith('crop-');

      // Clicked on an existing crop region -> select it, don't start drawing
      if (clickedOnRegion) return;

      // Clicked on empty canvas/image -> deselect + start drawing
      onRegionSelect(null);

      const coords = pointerToCanvas();
      if (!coords) return;

      // Must be inside the image bounds
      if (rotatedBounds) {
        if (
          coords.x < 0 ||
          coords.y < 0 ||
          coords.x > rotatedBounds.width ||
          coords.y > rotatedBounds.height
        ) {
          return;
        }
      }

      // ── Locked dimensions: place a fixed-size rectangle ──
      if (hasLockedDimensions) {
        const halfW = lockedWidth! / 2;
        const halfH = lockedHeight! / 2;
        let rx = coords.x - halfW;
        let ry = coords.y - halfH;

        // Clamp so the rectangle stays inside the image
        if (rotatedBounds) {
          rx = Math.max(0, Math.min(rotatedBounds.width - lockedWidth!, rx));
          ry = Math.max(0, Math.min(rotatedBounds.height - lockedHeight!, ry));
        }

        const placed: CropRegion = {
          id: `crop-${Date.now()}`,
          x: Math.round(rx),
          y: Math.round(ry),
          width: lockedWidth!,
          height: lockedHeight!,
          label: singleCropMode ? 'Crop' : `Panel ${regions.length + 1}`,
        };

        onRegionAdd(placed);
        return;
      }

      // ── Free draw: start a rectangle ──
      const clamped = clampToBounds(coords.x, coords.y);
      let startY = clamped.y;
      if (hasConstrainedHeight && rotatedBounds) {
        startY = Math.max(0, Math.min(rotatedBounds.height - constrainHeight!, startY));
      }
      setIsDrawing(true);
      setDrawStart({ x: clamped.x, y: startY });
      setDrawingRegion({
        id: `crop-${Date.now()}`,
        x: Math.round(clamped.x),
        y: Math.round(startY),
        width: 0,
        height: hasConstrainedHeight ? Math.round(constrainHeight!) : 0,
      });
    },
    [
      pointerToCanvas,
      rotatedBounds,
      hasLockedDimensions,
      hasConstrainedHeight,
      constrainHeight,
      lockedWidth,
      lockedHeight,
      singleCropMode,
      regions.length,
      clampToBounds,
      onRegionSelect,
      onRegionAdd,
    ]
  );

  const handleMouseMove = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isDrawing || !drawStart) return;

      const coords = pointerToCanvas();
      if (!coords) return;

      const clamped = clampToBounds(coords.x, coords.y);

      if (hasConstrainedHeight) {
        const x = Math.min(drawStart.x, clamped.x);
        const width = Math.abs(clamped.x - drawStart.x);
        setDrawingRegion((prev) =>
          prev
            ? { ...prev, x: Math.round(x), width: Math.round(width) }
            : null
        );
        return;
      }

      const x = Math.min(drawStart.x, clamped.x);
      const y = Math.min(drawStart.y, clamped.y);
      const width = Math.abs(clamped.x - drawStart.x);
      const height = Math.abs(clamped.y - drawStart.y);

      setDrawingRegion((prev) =>
        prev
          ? { ...prev, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
          : null
      );
    },
    [isDrawing, drawStart, pointerToCanvas, clampToBounds, hasConstrainedHeight]
  );

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !drawingRegion) {
      setIsDrawing(false);
      setDrawStart(null);
      setDrawingRegion(null);
      return;
    }

    setIsDrawing(false);
    setDrawStart(null);

    const { x, y, width, height } = drawingRegion;
    const finalHeight = hasConstrainedHeight ? Math.round(constrainHeight!) : height;

    const widthOk = width >= MIN_REGION_SIZE;
    const heightOk = hasConstrainedHeight || finalHeight >= MIN_REGION_SIZE;

    if (widthOk && heightOk) {
      const region: CropRegion = {
        ...drawingRegion,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: finalHeight,
        label: singleCropMode ? 'Crop' : `Panel ${regions.length + 1}`,
      };
      onRegionAdd(region);
    }

    setDrawingRegion(null);
  }, [isDrawing, drawingRegion, singleCropMode, regions.length, onRegionAdd, hasConstrainedHeight, constrainHeight]);

  // ─── Region click (select) ─────────────────────────────────────

  const handleRegionClick = useCallback(
    (regionId: string) => {
      onRegionSelect(regionId);
    },
    [onRegionSelect]
  );

  // ─── Region drag end (reposition) ─────────────────────────────

  const handleRegionDragEnd = useCallback(
    (regionId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Rect;
      const region = regions.find((r) => r.id === regionId);
      if (!region) return;

      let x = node.x();
      let y = node.y();

      // Clamp to image bounds
      if (rotatedBounds) {
        x = Math.max(0, Math.min(rotatedBounds.width - region.width, x));
        y = Math.max(0, Math.min(rotatedBounds.height - region.height, y));
      }

      // Snap the node to the clamped position
      node.x(x);
      node.y(y);

      onRegionUpdate({
        ...region,
        x: Math.round(x),
        y: Math.round(y),
      });
    },
    [regions, rotatedBounds, onRegionUpdate]
  );

  // ─── Region transform end (resize via handles) ────────────────

  const handleRegionTransformEnd = useCallback(
    (regionId: string, e: Konva.KonvaEventObject<Event>) => {
      const node = e.target as Konva.Rect;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);

      const region = regions.find((r) => r.id === regionId);
      if (!region) return;

      const newWidth = Math.round(Math.max(MIN_REGION_SIZE, node.width() * scaleX));
      const newHeight = hasConstrainedHeight
        ? Math.round(constrainHeight!)
        : Math.round(Math.max(MIN_REGION_SIZE, node.height() * scaleY));

      onRegionUpdate({
        ...region,
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        width: newWidth,
        height: newHeight,
      });
    },
    [regions, onRegionUpdate, hasConstrainedHeight, constrainHeight]
  );

  // ─── Render ────────────────────────────────────────────────────

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
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <Layer>
          {/* Rotated image */}
          {image && imageDimensions && (
            <Group
              x={imageOffset.x + imageDimensions.width / 2}
              y={imageOffset.y + imageDimensions.height / 2}
              rotation={rotation}
              offsetX={imageDimensions.width / 2}
              offsetY={imageDimensions.height / 2}
            >
              <KonvaImage image={image} name="background-image" listening={true} />
            </Group>
          )}

          {/* Crop regions */}
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
              strokeWidth={
                selectedRegionId === region.id
                  ? 3 / stageScale
                  : 2 / stageScale
              }
              draggable
              onClick={() => handleRegionClick(region.id)}
              onTap={() => handleRegionClick(region.id)}
              onDragEnd={(e) => handleRegionDragEnd(region.id, e)}
              onTransformEnd={(e) => handleRegionTransformEnd(region.id, e)}
            />
          ))}

          {/* Alignment guides */}
          {rotatedBounds && guideMode !== 'off' && (() => {
            const sw = 1 / stageScale;
            const w = rotatedBounds.width;
            const h = rotatedBounds.height;
            const guideLines: React.ReactNode[] = [];

            if (guideMode === 'crosshair') {
              guideLines.push(
                <Line key="ch-v" points={[w / 2, 0, w / 2, h]} stroke="rgba(239,68,68,0.5)" strokeWidth={sw} listening={false} />,
                <Line key="ch-h" points={[0, h / 2, w, h / 2]} stroke="rgba(239,68,68,0.5)" strokeWidth={sw} listening={false} />,
              );
            } else if (guideMode === 'grid') {
              const count = 20;
              for (let i = 1; i < count; i++) {
                const x = (w / count) * i;
                const y = (h / count) * i;
                guideLines.push(
                  <Line key={`gv-${i}`} points={[x, 0, x, h]} stroke="rgba(239,68,68,0.25)" strokeWidth={sw} listening={false} />,
                  <Line key={`gh-${i}`} points={[0, y, w, y]} stroke="rgba(239,68,68,0.25)" strokeWidth={sw} listening={false} />,
                );
              }
            }
            return guideLines;
          })()}

          {/* Drawing preview rectangle */}
          {drawingRegion && drawingRegion.width > 0 && drawingRegion.height > 0 && (
            <Rect
              x={drawingRegion.x}
              y={drawingRegion.y}
              width={drawingRegion.width}
              height={drawingRegion.height}
              fill="rgba(99, 102, 241, 0.3)"
              stroke="#6366f1"
              strokeWidth={2 / stageScale}
              dash={[10 / stageScale, 5 / stageScale]}
              listening={false}
            />
          )}

          {/* Transformer: only shown when NOT locked and a region is selected */}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < MIN_REGION_SIZE || newBox.height < MIN_REGION_SIZE) {
                return oldBox;
              }
              if (hasConstrainedHeight) {
                return { ...newBox, y: oldBox.y, height: oldBox.height };
              }
              return newBox;
            }}
            rotateEnabled={false}
            keepRatio={false}
            enabledAnchors={
              hasConstrainedHeight
                ? ['middle-left', 'middle-right']
                : [
                    'top-left',
                    'top-center',
                    'top-right',
                    'middle-left',
                    'middle-right',
                    'bottom-left',
                    'bottom-center',
                    'bottom-right',
                  ]
            }
            anchorSize={12}
            anchorStroke="#6366f1"
            anchorFill="#ffffff"
            anchorCornerRadius={2}
            borderStroke="#6366f1"
            borderStrokeWidth={2}
          />

          {/* Fallback: image before dimensions known */}
          {image && !imageDimensions && (
            <KonvaImage image={image} name="background-image" listening={true} />
          )}
        </Layer>
      </Stage>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex gap-1.5">
        <button
          className={`rounded-md px-3 py-1.5 text-sm font-medium shadow-md transition-colors ${
            guideMode !== 'off' ? 'bg-red-500/80 text-white hover:bg-red-500' : 'bg-white/90 hover:bg-white'
          }`}
          onClick={() => setGuideMode((prev) => prev === 'off' ? 'crosshair' : prev === 'crosshair' ? 'grid' : 'off')}
          title={`Guides: ${guideMode} (G)`}
        >
          {guideMode === 'off' ? '⊞' : guideMode === 'crosshair' ? '┼' : '▦'}
        </button>
        <button
          className="bg-white/90 hover:bg-white rounded-md px-3 py-1.5 text-sm font-medium shadow-md transition-colors"
          onClick={() => zoomBy(1.3)}
          title="Zoom in"
        >
          +
        </button>
        <button
          className="bg-white/90 hover:bg-white rounded-md px-3 py-1.5 text-sm font-medium shadow-md transition-colors"
          onClick={() => zoomBy(1 / 1.3)}
          title="Zoom out"
        >
          &minus;
        </button>
        <button
          className="bg-white/90 hover:bg-white rounded-md px-3 py-1.5 text-sm font-medium shadow-md transition-colors"
          onClick={fitToContainer}
          title="Fit to screen"
        >
          Fit
        </button>
      </div>

      {/* Image info overlay */}
      {imageDimensions && (
        <div className="absolute top-4 left-4 bg-black/60 text-white text-xs px-2 py-1 rounded pointer-events-none">
          {imageDimensions.width} &times; {imageDimensions.height}px
          &nbsp;|&nbsp;Zoom: {Math.round(stageScale * 100)}%
          {rotation !== 0 &&
            ` | Rotation: ${Math.round(rotation * 10) / 10}°`}
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 bg-black/60 text-white text-xs px-2 py-1 rounded pointer-events-none">
        {hasLockedDimensions
          ? 'Click to place crop | Drag to reposition | Scroll to zoom'
          : hasConstrainedHeight
            ? 'Click + drag horizontally to set width | Height is locked | Scroll to zoom'
            : 'Click + drag to draw crop | Drag to reposition | Scroll to zoom'}
      </div>
    </div>
  );
};
