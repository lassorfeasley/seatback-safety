import React, { useMemo } from 'react';
import { animated, useSpring } from '@react-spring/three';
import { PanelMesh } from './PanelMesh';
import type { Panel, Crease } from './types';

interface Spread {
  index: number;
  frontPanel: Panel | undefined;
  backPanel: Panel | undefined;
}

interface FoldableCardProps {
  panels: Panel[];
  creases: Crease[];
  creaseFolds: Record<number, number>;
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
  baseZOffset: number; // Cumulative z-offset for stacking
}

// Z-spacing between panels to prevent z-fighting
// This needs to be large enough that after 180° rotation, panels don't overlap
const Z_SPACING = 15;

/**
 * SpreadGroup - Recursive component that creates the nested hinge structure
 * 
 * Key insight: z-offset must be applied BEFORE rotation to work correctly.
 * The hinge point is offset in z, then the rotation is applied.
 */
const SpreadGroup: React.FC<SpreadGroupProps> = ({
  spreads,
  frontCreases,
  creaseFolds,
  currentIndex,
  panelWidth,
  panelHeight,
  baseZOffset,
}) => {
  const spread = spreads[currentIndex];
  if (!spread) return null;

  const isLastSpread = currentIndex === spreads.length - 1;

  // Get the crease configuration for the fold after this spread
  const crease = frontCreases.find((c) => c.between_panel === currentIndex);
  const creaseFoldAmount = creaseFolds[currentIndex] ?? 0;
  
  // Calculate fold angle based on direction
  const maxAngle = Math.PI;
  const foldAngle = crease
    ? (crease.fold_direction === 'forward' ? -1 : 1) * creaseFoldAmount * maxAngle
    : 0;

  // Calculate z-offset for the hinge
  // Forward folds: hinge moves toward viewer (+Z)
  // Backward folds: hinge moves away (-Z)
  const targetZOffset = crease?.fold_direction === 'forward' 
    ? Z_SPACING * creaseFoldAmount
    : -Z_SPACING * creaseFoldAmount;

  // Use spring animation for smooth folding
  const { rotation, zOffset } = useSpring({
    rotation: foldAngle,
    zOffset: targetZOffset,
    config: { tension: 120, friction: 14 },
  });

  return (
    <group>
      {/* Current spread - positioned at its base z */}
      <group position={[panelWidth / 2, 0, 0]}>
        <PanelMesh
          frontPanel={spread.frontPanel}
          backPanel={spread.backPanel}
          width={panelWidth}
          height={panelHeight}
          thickness={2}
          renderOrder={currentIndex}
        />
      </group>

      {/* Hinge for next spread - z-offset is applied at hinge BEFORE rotation */}
      {!isLastSpread && (
        <animated.group 
          position-x={panelWidth} 
          position-z={zOffset}
        >
          <animated.group rotation-y={rotation}>
            <SpreadGroup
              spreads={spreads}
              frontCreases={frontCreases}
              creaseFolds={creaseFolds}
              currentIndex={currentIndex + 1}
              panelWidth={panelWidth}
              panelHeight={panelHeight}
              baseZOffset={baseZOffset}
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
  panelWidth = 180,
  panelHeight = 120,
}) => {
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

  const totalWidth = spreads.length * panelWidth;
  const foldedWidth = panelWidth;
  const currentWidth = totalWidth - (totalWidth - foldedWidth) * overallFoldProgress;
  const centeringOffset = -(currentWidth / 2) + (panelWidth / 2);

  if (spreads.length === 0) return null;

  return (
    <group position={[centeringOffset, 0, 0]}>
      <SpreadGroup
        spreads={spreads}
        frontCreases={frontCreases}
        creaseFolds={creaseFolds}
        currentIndex={0}
        panelWidth={panelWidth}
        panelHeight={panelHeight}
        baseZOffset={0}
      />
    </group>
  );
};
