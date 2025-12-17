import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
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

// Animation timing constants
const FOLD_DURATION_PER_CREASE = 400; // ms per crease animation
const FOLD_STAGGER_DELAY = 100; // ms overlap between sequential folds

export const CardVisualizer: React.FC<CardVisualizerProps> = ({ panels, creases }) => {
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const rotationStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Target state: 0 = all unfolded, 1 = all folded
  // Start folded so front panel 0 is visible as the "cover"
  const [targetFoldState, setTargetFoldState] = useState<0 | 1>(1);
  
  // Animation refs
  const animationTimeouts = useRef<NodeJS.Timeout[]>([]);

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

  // Sort creases by unfold_sequence for animation ordering
  const creasesByUnfoldOrder = useMemo(() => {
    return [...frontCreases].sort((a, b) => 
      (a.unfold_sequence ?? a.between_panel) - (b.unfold_sequence ?? b.between_panel)
    );
  }, [frontCreases]);

  // Per-crease fold amounts (keyed by between_panel index)
  const [creaseFolds, setCreaseFolds] = useState<Record<number, number>>({});

  // Initialize and update crease folds when frontCreases change
  // Default to folded (1) so front panel 0 is visible as the "cover"
  useEffect(() => {
    setCreaseFolds((prev) => {
      const updated: Record<number, number> = {};
      frontCreases.forEach((c) => {
        // Preserve existing value or default to 1 (folded)
        updated[c.between_panel] = prev[c.between_panel] ?? 1;
      });
      return updated;
    });
  }, [frontCreases]);

  // Clear any pending animations on unmount
  useEffect(() => {
    return () => {
      animationTimeouts.current.forEach(clearTimeout);
    };
  }, []);

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

  // Sequential fold animation
  const handleFold = useCallback(() => {
    // Clear any existing animations
    animationTimeouts.current.forEach(clearTimeout);
    animationTimeouts.current = [];
    
    setTargetFoldState(1);
    
    // Fold in REVERSE unfold order (outer creases first for folding)
    const foldOrder = [...creasesByUnfoldOrder].reverse();
    
    foldOrder.forEach((crease, orderIndex) => {
      const delay = orderIndex * (FOLD_DURATION_PER_CREASE - FOLD_STAGGER_DELAY);
      
      const timeout = setTimeout(() => {
        setCreaseFolds((prev) => ({
          ...prev,
          [crease.between_panel]: 1,
        }));
      }, delay);
      
      animationTimeouts.current.push(timeout);
    });
  }, [creasesByUnfoldOrder]);

  // Sequential unfold animation
  const handleUnfold = useCallback(() => {
    // Clear any existing animations
    animationTimeouts.current.forEach(clearTimeout);
    animationTimeouts.current = [];
    
    setTargetFoldState(0);
    
    // Unfold in unfold_sequence order (inner creases first)
    creasesByUnfoldOrder.forEach((crease, orderIndex) => {
      const delay = orderIndex * (FOLD_DURATION_PER_CREASE - FOLD_STAGGER_DELAY);
      
      const timeout = setTimeout(() => {
        setCreaseFolds((prev) => ({
          ...prev,
          [crease.between_panel]: 0,
        }));
      }, delay);
      
      animationTimeouts.current.push(timeout);
    });
  }, [creasesByUnfoldOrder]);

  // Calculate overall fold progress for UI display
  const overallFoldProgress = useMemo(() => {
    const values = Object.values(creaseFolds);
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }, [creaseFolds]);

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
  const panelCount = spreads.length;
  const estimatedPanelWidth = 150; // Approximate panel width in pixels
  
  // When folded, panels stack - visible width is roughly 1 panel
  // The reduction in width creates an offset that needs compensation
  const widthReduction = (panelCount - 1) * estimatedPanelWidth * overallFoldProgress;
  const centeringOffset = widthReduction / 2;

  // Get fold angle for a specific crease (using per-crease fold amount)
  const getCreaseFoldAngle = useCallback((creaseIndex: number): number => {
    const crease = frontCreases.find((c) => c.between_panel === creaseIndex);
    if (!crease) return 0;
    
    // Get the fold amount for this specific crease
    const creaseFoldAmount = creaseFolds[creaseIndex] ?? 0;
    
    const maxAngle = 180;
    const angle = creaseFoldAmount * maxAngle;
    
    // Forward = folds toward viewer = negative rotation
    // Backward = folds away from viewer = positive rotation
    return crease.fold_direction === 'forward' ? -angle : angle;
  }, [frontCreases, creaseFolds]);

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
        const creaseFoldAmount = creaseFolds[i - 1] ?? 0;
        const foldAngle = crease 
          ? (crease.fold_direction === 'forward' ? -1 : 1) * creaseFoldAmount * 180
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
        const xOffset = flatXOffset + (foldedXOffset - flatXOffset) * creaseFoldAmount;
        
        // Z offset for stacking - increases with depth
        // Forward folds go toward viewer (+Z), backward folds go away (-Z)
        const zSign = crease?.fold_direction === 'forward' ? 1 : -1;
        const zOffset = prevTransform.zOffset + (zSign * creaseFoldAmount * 2);
        
        transforms.push({
          xOffset,
          yRotation: cumulativeRotation,
          zOffset,
          isFlipped,
        });
      }
    }
    
    return transforms;
  }, [spreads.length, frontCreases, creaseFolds, estimatedPanelWidth]);

  // Render spreads with nested structure for proper hinge behavior
  const renderFoldableSpreads = useCallback(() => {
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
      
      // Get fold direction and amount to determine stacking
      const crease = frontCreases.find((c) => c.between_panel === index);
      const isForwardFold = crease?.fold_direction === 'forward';
      const creaseFoldAmount = creaseFolds[index] ?? 0;

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
                "[transform-style:preserve-3d]"
              )}
              style={{
                // The hinge is at the LEFT edge, offset slightly in Z for stacking
                transformOrigin: 'left center',
                // Smooth transition for each crease independently
                transition: `transform ${FOLD_DURATION_PER_CREASE}ms ease-in-out`,
                // Forward fold: push the hinge point forward so folded panel ends up in front
                // Backward fold: push the hinge point backward so folded panel ends up behind
                transform: `translateZ(${isForwardFold ? PAPER_THICKNESS * creaseFoldAmount : -PAPER_THICKNESS * creaseFoldAmount}px) rotateY(${foldAngle}deg)`,
              }}
            >
              {renderSpread(index + 1)}
            </div>
          )}
        </div>
      );
    };

    return renderSpread(0);
  }, [spreads, frontCreases, creaseFolds, getCreaseFoldAngle]);

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
              variant={targetFoldState === 0 ? "default" : "outline"}
              size="sm"
              onClick={handleUnfold}
              className="gap-2"
            >
              <Maximize2 className="h-4 w-4" />
              Unfold
            </Button>
            <Button
              variant={targetFoldState === 1 ? "default" : "outline"}
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
              value={overallFoldProgress}
              onChange={(e) => {
                // Sequential slider control - unfolds/folds in unfold_sequence order
                const sliderValue = parseFloat(e.target.value);
                const n = creasesByUnfoldOrder.length;
                
                if (n === 0) return;
                
                const newFolds: Record<number, number> = {};
                
                creasesByUnfoldOrder.forEach((crease, orderIndex) => {
                  // Each crease gets a segment of the slider range
                  // Crease at orderIndex i unfolds during slider range [(n-i-1)/n, (n-i)/n]
                  // This means lower unfold_sequence unfolds first (as slider goes 1→0)
                  const rangeStart = (n - orderIndex - 1) / n; // Fully unfolded threshold
                  const rangeEnd = (n - orderIndex) / n; // Fully folded threshold
                  
                  if (sliderValue >= rangeEnd) {
                    // Slider is above this crease's range - fully folded
                    newFolds[crease.between_panel] = 1;
                  } else if (sliderValue <= rangeStart) {
                    // Slider is below this crease's range - fully unfolded
                    newFolds[crease.between_panel] = 0;
                  } else {
                    // Slider is within this crease's range - interpolate
                    const foldAmount = (sliderValue - rangeStart) / (rangeEnd - rangeStart);
                    newFolds[crease.between_panel] = foldAmount;
                  }
                });
                
                setCreaseFolds(newFolds);
                setTargetFoldState(sliderValue > 0.5 ? 1 : 0);
              }}
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
