import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Group, Line, Circle } from 'react-konva';
import type Konva from 'konva';
import type { CropCanvasProps, CropRegion } from './types';

type GuideMode = 'off' | 'grid';

const MIN_REGION_SIZE = 20;
const ZOOM_SCALE_BY = 1.1;
const MAX_ZOOM = 5;
const MIN_ZOOM = 0.01;
const MAGNIFIER_SIZE = 150;
const MAGNIFIER_ZOOM = 3;

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
  straightenMode = false,
  panelSide,
  onRegionAdd,
  onRegionUpdate,
  onRegionSelect,
  onRegionDelete,
  onImageLoad,
  onStraighten,
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

  // Alignment guides — grid on by default
  const [guideMode, setGuideMode] = useState<GuideMode>('grid');

  // Straighten tool — two-point edge alignment
  const [straightenPoint1, setStraightenPoint1] = useState<{ x: number; y: number } | null>(null);
  const [straightenPreview, setStraightenPreview] = useState<{ x: number; y: number } | null>(null);

  // Two-point click-to-crop: click two opposite corners to define a rectangle
  const [clickCropPoint, setClickCropPoint] = useState<{ x: number; y: number } | null>(null);
  const [clickCropPreview, setClickCropPreview] = useState<{ x: number; y: number } | null>(null);

  // Magnifier loupe
  const [showMagnifier, setShowMagnifier] = useState(true);
  const magnifierCanvasRef = useRef<HTMLCanvasElement>(null);
  const magnifierWrapRef = useRef<HTMLDivElement>(null);

  // Full-canvas crosshair tracking
  const [crosshairPos, setCrosshairPos] = useState<{ x: number; y: number } | null>(null);

  // Clear straighten points when mode is deactivated; clear click-crop when entering straighten
  useEffect(() => {
    if (!straightenMode) {
      setStraightenPoint1(null);
      setStraightenPreview(null);
    } else {
      setClickCropPoint(null);
      setClickCropPreview(null);
    }
  }, [straightenMode]);

  const hasLockedDimensions = lockDimensions && lockedWidth != null && lockedHeight != null;
  const hasConstrainedHeight = !hasLockedDimensions && constrainHeight != null && constrainHeight > 0;
  const isBackFace = panelSide === 'back';

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
    const containerHeight = containerRef.current.offsetHeight;
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
      if (e.key === 'Escape') {
        setClickCropPoint(null);
        setClickCropPreview(null);
      }
      if (e.key === 'g' || e.key === 'G') {
        setGuideMode((prev) => prev === 'off' ? 'grid' : 'off');
      }
      if (e.key === 'm' || e.key === 'M') {
        setShowMagnifier((prev) => !prev);
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
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      setStageSize({
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
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
    const pos = stage.getRelativePointerPosition();
    if (!pos) return null;
    return { x: pos.x, y: pos.y };
  }, []);

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

  // ─── Magnifier drawing ─────────────────────────────────────────

  useEffect(() => {
    if (!showMagnifier && magnifierWrapRef.current) {
      magnifierWrapRef.current.style.display = 'none';
    }
  }, [showMagnifier]);

  const drawMagnifier = useCallback(
    (canvas: HTMLCanvasElement, canvasX: number, canvasY: number) => {
      if (!image || !imageDimensions) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const size = MAGNIFIER_SIZE;
      const zoom = MAGNIFIER_ZOOM;
      const r = size / 2;

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, size, size);

      ctx.translate(r, r);
      ctx.scale(zoom, zoom);
      ctx.translate(-canvasX, -canvasY);

      ctx.translate(
        imageOffset.x + imageDimensions.width / 2,
        imageOffset.y + imageDimensions.height / 2
      );
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-imageDimensions.width / 2, -imageDimensions.height / 2);
      ctx.drawImage(image, 0, 0);

      ctx.restore();

      // Crosshair — shape varies by mode; hidden once a crop region exists (unless straightening)
      if (regions.length === 0 || straightenMode) {
        const crosshairColor = '#ff0000';
        const isLockedCornerCursor = hasLockedDimensions && !straightenMode;
        const isCornerCursor = isLockedCornerCursor || (hasConstrainedHeight && !hasLockedDimensions && !straightenMode && !clickCropPoint);
        const isLineCursor = hasConstrainedHeight && !hasLockedDimensions && !straightenMode && !!clickCropPoint;

        ctx.save();
        ctx.beginPath();
        ctx.arc(r, r, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.strokeStyle = crosshairColor;
        ctx.lineWidth = 0.75;
        if (isLockedCornerCursor) {
          const rectW = lockedWidth! * zoom;
          const rectH = lockedHeight! * zoom;
          ctx.strokeRect(r, r, rectW, rectH);
        } else {
          ctx.beginPath();
          if (isLineCursor) {
            ctx.moveTo(r, 8);
            ctx.lineTo(r, size - 8);
          } else if (isCornerCursor && isBackFace) {
            ctx.moveTo(r, r);
            ctx.lineTo(r, size - 8);
            ctx.moveTo(r, r);
            ctx.lineTo(8, r);
          } else if (isCornerCursor) {
            ctx.moveTo(r, r);
            ctx.lineTo(r, size - 8);
            ctx.moveTo(r, r);
            ctx.lineTo(size - 8, r);
          } else {
            ctx.moveTo(r, 8);
            ctx.lineTo(r, size - 8);
            ctx.moveTo(8, r);
            ctx.lineTo(size - 8, r);
          }
          ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        ctx.fillStyle = crosshairColor;
        ctx.beginPath();
        ctx.arc(r, r, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Circle border — drawn on canvas to avoid CSS square artifacts
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r - 1, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Clear corners outside the circle so no square background leaks
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.beginPath();
      ctx.arc(r, r, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
    [image, imageDimensions, imageOffset, rotation, straightenMode, hasConstrainedHeight, hasLockedDimensions, lockedWidth, lockedHeight, clickCropPoint, regions.length, isBackFace]
  );

  // ─── Mouse handlers ────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Only react to left click
      if (e.evt.button !== 0) return;

      // ── Straighten mode: capture two points ──
      if (straightenMode && onStraighten) {
        const coords = pointerToCanvas();
        if (!coords) return;

        if (!straightenPoint1) {
          setStraightenPoint1(coords);
          return;
        }

        // Second click — compute angle and apply
        const dx = coords.x - straightenPoint1.x;
        const dy = coords.y - straightenPoint1.y;
        const lineAngle = Math.atan2(dy, dx) * (180 / Math.PI);
        const absAngle = Math.abs(lineAngle);
        const isCloserToVertical = absAngle > 45 && absAngle < 135;
        let angleDelta: number;
        if (isCloserToVertical) {
          const target = lineAngle > 0 ? 90 : -90;
          angleDelta = -(lineAngle - target);
        } else {
          const target = Math.abs(lineAngle) > 90 ? (lineAngle > 0 ? 180 : -180) : 0;
          angleDelta = -(lineAngle - target);
        }

        onStraighten(angleDelta);
        setStraightenPoint1(null);
        setStraightenPreview(null);
        return;
      }

      const target = e.target;
      const clickedOnRegion =
        target.name()?.startsWith('crop-') || target.id()?.startsWith('crop-');

      // Clicked on an existing crop region -> select it, don't start drawing
      if (clickedOnRegion) return;

      // In single-crop mode, block drawing when a crop already exists
      if (singleCropMode && regions.length > 0) return;

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

      // ── Locked dimensions: place a fixed-size rectangle at the clicked top-left corner ──
      if (hasLockedDimensions) {
        let rx = coords.x;
        let ry = coords.y;

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

      // ── Two-point click-to-crop: second click completes the rectangle ──
      if (clickCropPoint) {
        const clamped = clampToBounds(coords.x, coords.y);
        let p2y = clamped.y;
        if (hasConstrainedHeight && rotatedBounds) {
          p2y = Math.max(0, Math.min(rotatedBounds.height - constrainHeight!, p2y));
        }

        const x = Math.min(clickCropPoint.x, clamped.x);
        const y = hasConstrainedHeight ? clickCropPoint.y : Math.min(clickCropPoint.y, clamped.y);
        const width = Math.abs(clamped.x - clickCropPoint.x);
        const height = hasConstrainedHeight ? Math.round(constrainHeight!) : Math.abs(clamped.y - clickCropPoint.y);

        if (width >= MIN_REGION_SIZE && (hasConstrainedHeight || height >= MIN_REGION_SIZE)) {
          const region: CropRegion = {
            id: `crop-${Date.now()}`,
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
            label: singleCropMode ? 'Crop' : `Panel ${regions.length + 1}`,
          };
          onRegionAdd(region);
        }

        setClickCropPoint(null);
        setClickCropPreview(null);
        return;
      }

      // ── Free draw: start a rectangle (may convert to click-to-crop on mouseUp) ──
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
      straightenMode,
      straightenPoint1,
      onStraighten,
      clickCropPoint,
    ]
  );

  const handleMouseMove = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent>) => {
      // Full-canvas crosshair tracking — track across entire stage, not just image
      {
        const pos = pointerToCanvas();
        if (pos) {
          setCrosshairPos(pos);
        } else {
          setCrosshairPos(null);
        }
      }

      // Magnifier tracking
      if (showMagnifier && image && imageDimensions) {
        const magnifierCanvas = magnifierCanvasRef.current;
        const magnifierWrap = magnifierWrapRef.current;
        const container = containerRef.current;
        const coords = pointerToCanvas();
        if (magnifierCanvas && magnifierWrap && container && coords) {
          if (
            rotatedBounds &&
            coords.x >= 0 && coords.y >= 0 &&
            coords.x <= rotatedBounds.width && coords.y <= rotatedBounds.height
          ) {
            const rect = container.getBoundingClientRect();
            const screenX = _e.evt.clientX - rect.left;
            const screenY = _e.evt.clientY - rect.top;
            const OFFSET = 24;
            let left = screenX + OFFSET;
            let top = screenY + OFFSET;
            if (left + MAGNIFIER_SIZE > container.offsetWidth)
              left = screenX - MAGNIFIER_SIZE - OFFSET;
            if (top + MAGNIFIER_SIZE > container.offsetHeight)
              top = screenY - MAGNIFIER_SIZE - OFFSET;
            magnifierWrap.style.transform = `translate(${left}px, ${top}px)`;
            magnifierWrap.style.display = 'block';
            drawMagnifier(magnifierCanvas, coords.x, coords.y);
          } else {
            magnifierWrap.style.display = 'none';
          }
        }
      }

      // Straighten preview line
      if (straightenMode && straightenPoint1) {
        const coords = pointerToCanvas();
        if (coords) setStraightenPreview(coords);
        return;
      }

      // Two-point click-to-crop preview
      if (clickCropPoint && !isDrawing) {
        const coords = pointerToCanvas();
        if (coords) {
          const clamped = clampToBounds(coords.x, coords.y);
          setClickCropPreview(clamped);
        }
        return;
      }

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
    [isDrawing, drawStart, pointerToCanvas, clampToBounds, hasConstrainedHeight, straightenMode, straightenPoint1, showMagnifier, image, imageDimensions, rotatedBounds, drawMagnifier, clickCropPoint]
  );

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !drawingRegion) {
      setIsDrawing(false);
      setDrawStart(null);
      setDrawingRegion(null);
      return;
    }

    setIsDrawing(false);

    const { x, y, width, height } = drawingRegion;
    const finalHeight = hasConstrainedHeight ? Math.round(constrainHeight!) : height;

    const widthOk = width >= MIN_REGION_SIZE;
    const heightOk = hasConstrainedHeight || finalHeight >= MIN_REGION_SIZE;

    if (widthOk && heightOk) {
      // Drag was large enough — create the crop region normally
      const region: CropRegion = {
        ...drawingRegion,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: finalHeight,
        label: singleCropMode ? 'Crop' : `Panel ${regions.length + 1}`,
      };
      onRegionAdd(region);
      setDrawStart(null);
      setDrawingRegion(null);
    } else if (drawStart && !hasLockedDimensions) {
      // Drag was too small — treat as a single click; set the first corner for two-point crop
      setClickCropPoint(drawStart);
      setClickCropPreview(null);
      setDrawStart(null);
      setDrawingRegion(null);
    } else {
      setDrawStart(null);
      setDrawingRegion(null);
    }
  }, [isDrawing, drawingRegion, drawStart, singleCropMode, regions.length, onRegionAdd, hasConstrainedHeight, constrainHeight, hasLockedDimensions]);

  const handleMouseLeave = useCallback(() => {
    const magnifierWrap = magnifierWrapRef.current;
    if (magnifierWrap) magnifierWrap.style.display = 'none';
    setCrosshairPos(null);
    handleMouseUp();
  }, [handleMouseUp]);

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

  // ─── Cursor — set on Konva stage container for precise alignment ─

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const container = stage.container();
    if (!container) return;

    let cursor: string;
    const showCanvasCrosshair = straightenMode || regions.length === 0;
    if (showCanvasCrosshair) {
      cursor = 'none';
    } else {
      cursor = 'default';
    }

    container.style.cursor = cursor;
  }, [regions.length, straightenMode]);

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-neutral-900"
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
        onMouseLeave={handleMouseLeave}
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
              fill={selectedRegionId === region.id ? 'rgba(239, 68, 68, 0.25)' : 'rgba(99, 102, 241, 0.2)'}
              stroke={selectedRegionId === region.id ? '#ef4444' : '#818cf8'}
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
              onMouseEnter={(e) => {
                const container = e.target.getStage()?.container();
                if (container) container.style.cursor = 'grab';
              }}
              onMouseLeave={(e) => {
                const container = e.target.getStage()?.container();
                if (container) container.style.cursor = '';
              }}
              onDragStart={(e) => {
                const container = e.target.getStage()?.container();
                if (container) container.style.cursor = 'grabbing';
              }}
            />
          ))}

          {/* Alignment guides — square cells based on shorter dimension */}
          {rotatedBounds && guideMode === 'grid' && (() => {
            const sw = 1 / stageScale;
            const w = rotatedBounds.width;
            const h = rotatedBounds.height;
            const cellSize = Math.min(w, h) / 40;
            const guideLines: React.ReactNode[] = [];

            for (let x = cellSize; x < w; x += cellSize) {
              guideLines.push(
                <Line key={`gv-${x}`} points={[x, 0, x, h]} stroke="rgba(239,68,68,0.18)" strokeWidth={sw} listening={false} />,
              );
            }
            for (let y = cellSize; y < h; y += cellSize) {
              guideLines.push(
                <Line key={`gh-${y}`} points={[0, y, w, y]} stroke="rgba(239,68,68,0.18)" strokeWidth={sw} listening={false} />,
              );
            }

            // Center crosshair (stronger)
            guideLines.push(
              <Line key="ch-v" points={[w / 2, 0, w / 2, h]} stroke="rgba(239,68,68,0.45)" strokeWidth={sw} listening={false} />,
              <Line key="ch-h" points={[0, h / 2, w, h / 2]} stroke="rgba(239,68,68,0.45)" strokeWidth={sw} listening={false} />,
            );

            return guideLines;
          })()}

          {/* Full-canvas crosshair lines — extend across entire visible area */}
          {crosshairPos && (straightenMode || regions.length === 0) && (() => {
            const sw = 1 / stageScale;
            const color = 'rgba(255,0,0,0.6)';

            if (hasLockedDimensions && !straightenMode && lockedWidth != null && lockedHeight != null) {
              return (
                <Rect
                  x={crosshairPos.x}
                  y={crosshairPos.y}
                  width={lockedWidth}
                  height={lockedHeight}
                  stroke={color}
                  strokeWidth={sw}
                  listening={false}
                />
              );
            }

            const extL = -stagePosition.x / stageScale - 10000;
            const extR = (stageSize.width - stagePosition.x) / stageScale + 10000;
            const extT = -stagePosition.y / stageScale - 10000;
            const extB = (stageSize.height - stagePosition.y) / stageScale + 10000;
            const showVertical = true;
            const showHorizontal = !(hasConstrainedHeight && clickCropPoint);
            return (
              <>
                {showVertical && (
                  <Line points={[crosshairPos.x, extT, crosshairPos.x, extB]} stroke={color} strokeWidth={sw} listening={false} />
                )}
                {showHorizontal && (
                  <Line points={[extL, crosshairPos.y, extR, crosshairPos.y]} stroke={color} strokeWidth={sw} listening={false} />
                )}
              </>
            );
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

          {/* Straighten tool: point markers + preview line */}
          {straightenMode && straightenPoint1 && (() => {
            const sw = 1 / stageScale;
            const r = 6 * sw;
            const endPoint = straightenPreview || straightenPoint1;
            return (
              <>
                <Line
                  points={[straightenPoint1.x, straightenPoint1.y, endPoint.x, endPoint.y]}
                  stroke="#22d3ee"
                  strokeWidth={2 * sw}
                  dash={[8 * sw, 4 * sw]}
                  listening={false}
                />
                <Circle x={straightenPoint1.x} y={straightenPoint1.y} radius={r} fill="#22d3ee" stroke="#fff" strokeWidth={sw} listening={false} />
                {straightenPreview && (
                  <Circle x={straightenPreview.x} y={straightenPreview.y} radius={r} fill="#22d3ee" stroke="#fff" strokeWidth={sw} listening={false} />
                )}
              </>
            );
          })()}

          {/* Two-point click-to-crop: corner marker + preview rectangle */}
          {clickCropPoint && (() => {
            const sw = 1 / stageScale;
            const r = 6 * sw;
            const p2 = clickCropPreview;
            const imgW = rotatedBounds?.width ?? 0;
            return (
              <>
                <Circle x={clickCropPoint.x} y={clickCropPoint.y} radius={r} fill="#ff0000" stroke="#fff" strokeWidth={sw} listening={false} />
                {/* Height-constrained: show top-edge guide line + locked height band + vertical edge line */}
                {hasConstrainedHeight && rotatedBounds && (
                  <>
                    <Line
                      points={[0, clickCropPoint.y, imgW, clickCropPoint.y]}
                      stroke="#ff0000"
                      strokeWidth={sw}
                      listening={false}
                    />
                    <Rect
                      x={0}
                      y={clickCropPoint.y}
                      width={imgW}
                      height={Math.round(constrainHeight!)}
                      fill="rgba(255, 0, 0, 0.06)"
                      listening={false}
                    />
                    <Line
                      points={[0, clickCropPoint.y + Math.round(constrainHeight!), imgW, clickCropPoint.y + Math.round(constrainHeight!)]}
                      stroke="rgba(255, 0, 0, 0.3)"
                      strokeWidth={sw}
                      listening={false}
                    />
                    <Line
                      points={[clickCropPoint.x, clickCropPoint.y, clickCropPoint.x, clickCropPoint.y + Math.round(constrainHeight!)]}
                      stroke="#ff0000"
                      strokeWidth={sw}
                      listening={false}
                    />
                  </>
                )}
                {p2 && (() => {
                  const previewX = Math.min(clickCropPoint.x, p2.x);
                  const previewY = hasConstrainedHeight ? clickCropPoint.y : Math.min(clickCropPoint.y, p2.y);
                  const previewW = Math.abs(p2.x - clickCropPoint.x);
                  const previewH = hasConstrainedHeight ? Math.round(constrainHeight!) : Math.abs(p2.y - clickCropPoint.y);
                  if (previewW < 1 && previewH < 1) return null;
                  return (
                    <>
                      <Rect
                        x={previewX}
                        y={previewY}
                        width={previewW}
                        height={previewH}
                        fill="rgba(255, 0, 0, 0.12)"
                        stroke="#ff0000"
                        strokeWidth={sw}
                        listening={false}
                      />
                      {!hasConstrainedHeight && (
                        <Circle x={p2.x} y={p2.y} radius={r} fill="#ff0000" stroke="#fff" strokeWidth={sw} listening={false} />
                      )}
                    </>
                  );
                })()}
              </>
            );
          })()}

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

      {/* Magnifier loupe */}
      <div
        ref={magnifierWrapRef}
        className="absolute top-0 left-0 pointer-events-none"
        style={{ display: 'none', zIndex: 40, willChange: 'transform' }}
      >
        <canvas
          ref={magnifierCanvasRef}
          width={MAGNIFIER_SIZE}
          height={MAGNIFIER_SIZE}
          style={{
            width: MAGNIFIER_SIZE,
            height: MAGNIFIER_SIZE,
            display: 'block',
          }}
        />
        {hasLockedDimensions && !straightenMode && regions.length === 0 && (
          <div className="mt-1 text-center text-[10px] font-medium text-white bg-black/60 rounded px-1.5 py-0.5 whitespace-nowrap">
            select top-left corner
          </div>
        )}
        {hasConstrainedHeight && !hasLockedDimensions && !straightenMode && (
          <div className="mt-1 text-center text-[10px] font-medium text-white bg-black/60 rounded px-1.5 py-0.5 whitespace-nowrap">
            {clickCropPoint
              ? (isBackFace ? 'select left boundary' : 'select right boundary')
              : (isBackFace ? 'select top-right corner' : 'select top-left corner')}
          </div>
        )}
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
        {straightenMode
          ? (straightenPoint1
            ? 'Click the second point on the same edge to straighten'
            : 'Click the first point on a straight edge')
          : clickCropPoint
            ? (hasConstrainedHeight
              ? (isBackFace ? 'Now click the left boundary | Esc to cancel' : 'Now click the right boundary | Esc to cancel')
              : 'Click the opposite corner to complete the crop | Esc to cancel')
            : hasLockedDimensions
              ? 'Click the top-left corner of this panel | Scroll to zoom'
              : hasConstrainedHeight
                ? (isBackFace
                  ? 'Click the top-right corner of this panel (height is locked) | Scroll to zoom'
                  : 'Click the top-left corner of this panel (height is locked) | Scroll to zoom')
                : 'Click + drag or click two corners to crop | Scroll to zoom'}
      </div>
    </div>
  );
};
