import React, { useMemo } from 'react';
import { animated, useSpring } from '@react-spring/three';
import { PanelMesh } from './PanelMesh';
import type { Panel, Crease, CoverDesignation } from './types';

interface Spread {
  index: number;
  frontPanel: Panel | undefined;
  backPanel: Panel | undefined;
}

interface FoldableCardProps {
  panels: Panel[];
  creases: Crease[];
  creaseFolds: Record<number, number>;
  cover?: CoverDesignation;
  panelWidth?: number;
  panelHeight?: number;
}

interface SpreadGroupProps {
  spreads: Spread[];
  frontCreases: Crease[];
  creaseFolds: Record<number, number>;
  currentIndex: number;
  panelWidth: number;
  panelHeight: number;
  cumulativeZOffset: number; // World-space z-offset passed from parent
}

// Z-spacing between panels to prevent z-fighting
// Small value since we now use time-based easing without overshoot
const Z_SPACING = 0.5;

/**
 * SpreadGroup - Recursive component that creates the nested hinge structure
 * 
 * F-S1 is always the cover - it stays at z=0 while other panels get pushed back (-z).
 */
const SpreadGroup: React.FC<SpreadGroupProps> = ({
  spreads,
  frontCreases,
  creaseFolds,
  currentIndex,
  panelWidth,
  panelHeight,
  cumulativeZOffset,
}) => {
  const spread = spreads[currentIndex];
  if (!spread) return null;

  const isLastSpread = currentIndex === spreads.length - 1;

  // Get the crease configuration for the fold after this spread
  const crease = frontCreases.find((c) => c.between_panel === currentIndex);
  const creaseFoldAmount = creaseFolds[currentIndex] ?? 0;
  
  // Calculate fold angle based on direction
  // When fully unfolded (creaseFoldAmount=0), maintain a 30° angle to show the card's volume
  // When fully folded (creaseFoldAmount=1), angle is 180° (π radians)
  const minAngle = 30 * Math.PI / 180; // 30 degrees - angle when unfolded
  const maxAngle = Math.PI; // 180 degrees - fully folded
  const angleRange = maxAngle - minAngle;
  
  // Apply angle: when unfolded (0) -> minAngle, when folded (1) -> maxAngle
  // If no crease exists (last spread), angle is 0 (no rotation needed)
  const foldAngle = crease
    ? (crease.fold_direction === 'forward' ? -1 : 1) * (minAngle + creaseFoldAmount * angleRange)
    : 0;

  // Calculate the z-offset this crease contributes to subsequent spreads
  // All folded panels should go BEHIND F-S1 (negative z in world space)
  // The key: we apply this offset BEFORE rotation, at the hinge point
  const creaseZContribution = -Z_SPACING * creaseFoldAmount;

  // Use time-based easing for smooth, predictable folding (no overshoot)
  // 1.5 second duration with strong easeInOutCubic for smooth acceleration/deceleration
  const { rotation, zPos } = useSpring({
    rotation: foldAngle,
    zPos: creaseZContribution,
    config: { 
      duration: 1500,
      easing: (t: number) => t < 0.5 
        ? 4 * t * t * t 
        : 1 - Math.pow(-2 * t + 2, 3) / 2, // easeInOutCubic
    },
  });

  // F-S1 (currentIndex=0) gets highest render priority
  const renderPriority = (spreads.length - currentIndex) * 10;

  // Generate a unique key based on the actual panel content
  const spreadKey = `${spread.frontPanel?.id ?? 'no-front'}-${spread.backPanel?.id ?? 'no-back'}`;

  return (
    <group>
      {/* Current spread - at the cumulative z-offset from previous folds */}
      <group position={[panelWidth / 2, 0, cumulativeZOffset]}>
        <PanelMesh
          key={spreadKey}
          frontPanel={spread.frontPanel}
          backPanel={spread.backPanel}
          width={panelWidth}
          height={panelHeight}
          thickness={0.01}
          renderOrder={renderPriority}
        />
      </group>

      {/* Hinge for next spread - z-offset is applied at hinge BEFORE rotation */}
      {!isLastSpread && (
        <animated.group position-x={panelWidth} position-z={zPos}>
          <animated.group rotation-y={rotation}>
            <SpreadGroup
              spreads={spreads}
              frontCreases={frontCreases}
              creaseFolds={creaseFolds}
              currentIndex={currentIndex + 1}
              panelWidth={panelWidth}
              panelHeight={panelHeight}
              cumulativeZOffset={0} // Reset for child - each level contributes its own offset
            />
          </animated.group>
        </animated.group>
      )}
    </group>
  );
};

/**
 * FoldableCard - Main component that orchestrates the folding card visualization
 * 
 * Uses recursive nested groups for proper hinge behavior, with constant
 * z-offsets to prevent z-fighting when panels stack.
 */
export const FoldableCard: React.FC<FoldableCardProps> = ({
  panels,
  creases,
  creaseFolds,
  cover,
  panelWidth = 180,
  panelHeight = 120,
}) => {
  // Default cover is spread 0, front side
  const coverDesignation: CoverDesignation = cover || { spreadIndex: 0, side: 'front' };
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

  // Create spreads - each spread is a front/back pair at the same position
  // The UI displays back panels in reverse order to match their physical position when flipped
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

  // Generate a unique key for the entire card based on all panel IDs
  // This forces a complete re-render when any panel changes
  const cardKey = useMemo(() => {
    const frontIds = frontPanels.map(p => `${p.id}:${p.panel_index}`).join(',');
    const backIds = backPanels.map(p => `${p.id}:${p.panel_index}`).join(',');
    return `${frontIds}|${backIds}`;
  }, [frontPanels, backPanels]);

  // Get front creases for fold direction reference
  const frontCreases = useMemo(
    () => creases.filter((c) => c.side === 'front').sort((a, b) => a.between_panel - b.between_panel),
    [creases]
  );

  // Calculate centering offset based on fold progress
  const overallFoldProgress = useMemo(() => {
    const values = Object.values(creaseFolds);
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }, [creaseFolds]);

  // Calculate the current width of the card based on fold progress
  // When unfolded (progress=0): width = all panels side by side
  // When folded (progress=1): width = single panel width
  const totalWidth = spreads.length * panelWidth;
  const foldedWidth = panelWidth;
  const currentWidth = totalWidth - (totalWidth - foldedWidth) * overallFoldProgress;
  
  // Center the card by shifting left by half the current width
  // The card content starts at x=0 and extends to x=currentWidth
  const targetCenteringOffset = -currentWidth / 2;

  // Animate the centering offset to match the fold animation timing
  const { centeringOffset } = useSpring({
    centeringOffset: targetCenteringOffset,
    config: { 
      duration: 1500,
      easing: (t: number) => t < 0.5 
        ? 4 * t * t * t 
        : 1 - Math.pow(-2 * t + 2, 3) / 2, // easeInOutCubic
    },
  });

  if (spreads.length === 0) return null;

  // Calculate base rotation to show the designated cover when folded
  // If cover side is 'back', we need to flip the entire card 180° on Y
  
  // Base rotation: flip 180° if cover side is 'back'
  const sideFlipAngle = coverDesignation.side === 'back' ? Math.PI : 0;
  
  // For non-zero spread indices, when folded, we need to rotate based on 
  // the position of the cover spread in the stack
  // Each spread index adds 180° of rotation when folded (because of the fold directions)
  const spreadRotationAngle = overallFoldProgress > 0.5 && coverDesignation.spreadIndex > 0 
    ? Math.PI * coverDesignation.spreadIndex 
    : 0;
  
  const totalBaseRotation = sideFlipAngle + spreadRotationAngle;

  // Animate the base rotation
  const { baseRotation } = useSpring({
    baseRotation: totalBaseRotation,
    config: { 
      duration: 1500,
      easing: (t: number) => t < 0.5 
        ? 4 * t * t * t 
        : 1 - Math.pow(-2 * t + 2, 3) / 2,
    },
  });

  // The card content is built from x=0 extending to the right.
  // We need to center it by offsetting by half the current width.
  // The rotation should happen AROUND the center, so we:
  // 1. Offset the content to be centered at origin
  // 2. Apply rotation at origin
  // This way the rotation pivot is at the visual center of the card.

  return (
    <animated.group rotation-y={baseRotation}>
      {/* Centering group - shifts content so center is at origin */}
      <animated.group position-x={centeringOffset}>
        <SpreadGroup
          key={cardKey}
          spreads={spreads}
          frontCreases={frontCreases}
          creaseFolds={creaseFolds}
          currentIndex={0}
          panelWidth={panelWidth}
          panelHeight={panelHeight}
          cumulativeZOffset={0}
        />
      </animated.group>
    </animated.group>
  );
};

