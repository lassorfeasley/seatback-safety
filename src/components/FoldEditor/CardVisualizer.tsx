import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RotateCw, RotateCcw, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Panel, Crease } from './types';

interface CardVisualizerProps {
  panels: Panel[];
  creases: Crease[];
}

interface Spread {
  index: number;
  frontPanel: Panel | undefined;
  backPanel: Panel | undefined;
}

export const CardVisualizer: React.FC<CardVisualizerProps> = ({ panels, creases }) => {
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [foldAmount, setFoldAmount] = useState(0); // 0 = flat, 1 = fully folded
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const rotationStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Sort panels by side and index
  const frontPanels = useMemo(
    () =>
      panels
        .filter((p) => p.side === 'front')
        .sort((a, b) => a.panel_index - b.panel_index),
    [panels]
  );

  const backPanels = useMemo(
    () =>
      panels
        .filter((p) => p.side === 'back')
        .sort((a, b) => a.panel_index - b.panel_index),
    [panels]
  );

  // Create spreads - each spread is a front/back pair at the same index
  const spreads: Spread[] = useMemo(() => {
    const maxIndex = Math.max(
      ...frontPanels.map((p) => p.panel_index),
      ...backPanels.map((p) => p.panel_index),
      -1
    );
    
    const result: Spread[] = [];
    for (let i = 0; i <= maxIndex; i++) {
      result.push({
        index: i,
        frontPanel: frontPanels.find((p) => p.panel_index === i),
        backPanel: backPanels.find((p) => p.panel_index === i),
      });
    }
    return result;
  }, [frontPanels, backPanels]);

  // Get creases (use front creases as the source of truth)
  const frontCreases = useMemo(
    () => creases.filter((c) => c.side === 'front').sort((a, b) => a.between_panel - b.between_panel),
    [creases]
  );

  // Flip to back (180° on Y axis)
  const handleFlip = () => {
    setRotation((prev) => ({
      x: prev.x,
      y: prev.y + 180,
    }));
  };

  // Reset to front view
  const handleReset = () => {
    setRotation({ x: 0, y: 0 });
  };

  // Fold/unfold
  const handleFold = () => {
    setFoldAmount(1);
  };

  const handleUnfold = () => {
    setFoldAmount(0);
  };

  // Mouse/touch drag handlers for rotation
  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    setIsDragging(true);
    dragStart.current = { x: clientX, y: clientY };
    rotationStart.current = { ...rotation };
  }, [rotation]);

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging) return;

    const deltaX = clientX - dragStart.current.x;
    const deltaY = clientY - dragStart.current.y;

    const sensitivity = 0.5;

    setRotation({
      x: rotationStart.current.x - deltaY * sensitivity,
      y: rotationStart.current.y + deltaX * sensitivity,
    });
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    handleDragEnd();
  };

  const handleMouseLeave = () => {
    if (isDragging) handleDragEnd();
  };

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  // Determine which side is showing based on Y rotation
  const normalizedY = ((rotation.y % 360) + 360) % 360;
  const isShowingBack = normalizedY > 90 && normalizedY < 270;

  // Calculate centering offset as the card folds
  // When panels fold, they collapse toward the left, so we need to shift right to compensate
  // Estimate: each folded panel reduces visible width, shift by half that reduction
  const panelCount = spreads.length;
  const estimatedPanelWidth = 150; // Approximate panel width in pixels
  
  // When folded, panels stack - visible width is roughly 1 panel
  // The reduction in width creates an offset that needs compensation
  const widthReduction = (panelCount - 1) * estimatedPanelWidth * foldAmount;
  const centeringOffset = widthReduction / 2;

  // Get fold angle for a specific crease
  const getCreaseFoldAngle = (creaseIndex: number): number => {
    const crease = frontCreases.find((c) => c.between_panel === creaseIndex);
    if (!crease) return 0;
    
    const maxAngle = 180;
    const angle = foldAmount * maxAngle;
    
    // Forward = folds toward viewer = negative rotation
    // Backward = folds away from viewer = positive rotation
    return crease.fold_direction === 'forward' ? -angle : angle;
  };

  // Calculate cumulative transform data for each spread
  // This computes the actual world-space position/rotation of each panel
  const getSpreadTransforms = useMemo(() => {
    const transforms: Array<{
      xOffset: number;
      yRotation: number;
      zOffset: number;
      isFlipped: boolean;
    }> = [];
    
    const panelWidth = estimatedPanelWidth;
    
    for (let i = 0; i < spreads.length; i++) {
      if (i === 0) {
        // First spread is the anchor - no transform
        transforms.push({
          xOffset: 0,
          yRotation: 0,
          zOffset: 0,
          isFlipped: false,
        });
      } else {
        // Get the previous transform
        const prevTransform = transforms[i - 1];
        
        // Get the fold angle at the crease BEFORE this spread (crease i-1)
        const crease = frontCreases.find((c) => c.between_panel === i - 1);
        const foldAngle = crease 
          ? (crease.fold_direction === 'forward' ? -1 : 1) * foldAmount * 180
          : 0;
        
        // Cumulative rotation
        const cumulativeRotation = prevTransform.yRotation + foldAngle;
        
        // Is this spread flipped (back facing viewer)?
        const normalizedRotation = ((cumulativeRotation % 360) + 360) % 360;
        const isFlipped = normalizedRotation > 90 && normalizedRotation < 270;
        
        // Calculate X offset - when folded, panels stack at the same position
        // When flat, each panel is offset by its width
        const flatXOffset = i * panelWidth;
        const foldedXOffset = 0; // All panels stack at origin when folded
        const xOffset = flatXOffset + (foldedXOffset - flatXOffset) * foldAmount;
        
        // Z offset for stacking - increases with depth
        // Forward folds go toward viewer (+Z), backward folds go away (-Z)
        // But we need to account for the cumulative state
        const zSign = crease?.fold_direction === 'forward' ? 1 : -1;
        const zOffset = prevTransform.zOffset + (zSign * foldAmount * 2);
        
        transforms.push({
          xOffset,
          yRotation: cumulativeRotation,
          zOffset,
          isFlipped,
        });
      }
    }
    
    return transforms;
  }, [spreads.length, frontCreases, foldAmount, estimatedPanelWidth]);

  // Render spreads with nested structure for proper hinge behavior
  const renderFoldableSpreads = () => {
    if (spreads.length === 0) return null;

    // Paper thickness - represents the physical thickness of each folded panel
    // This is important for proper stacking when panels fold on top of each other
    const PAPER_THICKNESS = 2; // pixels

    // Build nested structure for proper 3D hinge behavior
    // Each spread rotates around its left edge (the hinge/crease)
    const renderSpread = (index: number): React.ReactNode => {
      const spread = spreads[index];
      if (!spread) return null;
      
      const isLastSpread = index === spreads.length - 1;
      
      // Get fold angle for the crease AFTER this spread
      const foldAngle = getCreaseFoldAngle(index);
      
      // Get fold direction to determine stacking
      const crease = frontCreases.find((c) => c.between_panel === index);
      const isForwardFold = crease?.fold_direction === 'forward';

      return (
        <div
          key={`spread-${spread.index}`}
          className="flex [transform-style:preserve-3d]"
        >
          {/* This spread - a 3D card with front and back faces */}
          <div 
            className="relative [transform-style:preserve-3d] flex-shrink-0"
          >
            {/* Front face */}
            {spread.frontPanel && (
              <img
                src={spread.frontPanel.thumbnail_url}
                alt={`Front panel ${spread.frontPanel.panel_index}`}
                className="h-[300px] w-auto object-contain pointer-events-none [backface-visibility:hidden]"
                style={{
                  // Front face is at half thickness toward viewer
                  transform: `translateZ(${PAPER_THICKNESS / 2}px)`,
                }}
                draggable={false}
              />
            )}
            {/* Back face - rotated 180° and behind */}
            {spread.backPanel && (
              <img
                src={spread.backPanel.thumbnail_url}
                alt={`Back panel ${spread.backPanel.panel_index}`}
                className="absolute inset-0 h-[300px] w-auto object-contain pointer-events-none [backface-visibility:hidden]"
                style={{
                  // Back face is at half thickness away from viewer, then flipped
                  transform: `translateZ(${-PAPER_THICKNESS / 2}px) rotateY(180deg)`,
                }}
                draggable={false}
              />
            )}
          </div>

          {/* Hinge container for next spread */}
          {!isLastSpread && (
            <div
              className={cn(
                "[transform-style:preserve-3d]",
                "transition-transform duration-500 ease-in-out"
              )}
              style={{
                // The hinge is at the LEFT edge, but we offset it slightly in Z
                // to prevent panels from occupying the exact same space when folded
                transformOrigin: 'left center',
                // Forward fold: push the hinge point forward so folded panel ends up in front
                // Backward fold: push the hinge point backward so folded panel ends up behind
                transform: `translateZ(${isForwardFold ? PAPER_THICKNESS : -PAPER_THICKNESS}px) rotateY(${foldAngle}deg)`,
              }}
            >
              {renderSpread(index + 1)}
            </div>
          )}
        </div>
      );
    };

    return renderSpread(0);
  };

  return (
    <Card className="w-full mt-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Card Preview</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFlip}
              className="gap-2"
            >
              <RotateCw className="h-4 w-4" />
              Flip
            </Button>
            <Button
              variant={foldAmount === 0 ? "default" : "outline"}
              size="sm"
              onClick={handleUnfold}
              className="gap-2"
            >
              <Maximize2 className="h-4 w-4" />
              Unfold
            </Button>
            <Button
              variant={foldAmount === 1 ? "default" : "outline"}
              size="sm"
              onClick={handleFold}
              className="gap-2"
            >
              <Minimize2 className="h-4 w-4" />
              Fold
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <p className="text-sm text-muted-foreground">
            Drag to rotate • Currently viewing: {isShowingBack ? 'Back' : 'Front'}
          </p>
          <div className="flex items-center gap-2 flex-1 max-w-xs">
            <span className="text-xs text-muted-foreground">Flat</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={foldAmount}
              onChange={(e) => setFoldAmount(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs text-muted-foreground">Folded</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Static background container */}
        <div className="flex justify-center p-8 bg-muted/30 rounded-lg min-h-[400px] items-center overflow-hidden">
          {/* 3D rotation container */}
          <div 
            ref={containerRef}
            className={cn(
              "relative select-none",
              isDragging ? "cursor-grabbing" : "cursor-grab"
            )}
            style={{ perspective: '2000px' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className={cn(
                "relative [transform-style:preserve-3d]",
                !isDragging && "transition-transform duration-300 ease-out"
              )}
              style={{
                transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
              }}
            >
              {/* Centering wrapper - compensates for fold offset */}
              <div 
                className={cn(
                  "[transform-style:preserve-3d]",
                  "transition-transform duration-500 ease-in-out"
                )}
                style={{
                  // Shift right to compensate for panels folding left
                  transform: `translateX(${centeringOffset}px)`,
                }}
              >
                {/* Unified foldable card - front and back are connected */}
                <div className="[transform-style:preserve-3d] inline-flex">
                  {renderFoldableSpreads()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
