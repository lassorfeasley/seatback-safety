import React, { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { SRGBColorSpace, FrontSide, LinearMipmapLinearFilter, LinearFilter } from 'three';
import type { Panel } from './types';

interface PanelMeshProps {
  frontPanel?: Panel;
  backPanel?: Panel;
  width: number;  // Target width - height will be calculated from image aspect ratio
  height: number; // Fallback height if no image
  thickness?: number;
  renderOrder?: number; // For controlling draw order
}

// Placeholder component for when textures are loading
const PlaceholderPanel: React.FC<{ 
  width: number; 
  height: number; 
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
  renderOrder?: number;
}> = ({ 
  width, 
  height, 
  color,
  position,
  rotation,
  renderOrder = 0,
}) => (
  <mesh position={position} rotation={rotation} renderOrder={renderOrder}>
    <planeGeometry args={[width, height]} />
    <meshBasicMaterial 
      color={color} 
      side={FrontSide}
      depthWrite={true}
      polygonOffset={true}
      polygonOffsetFactor={-renderOrder}
      polygonOffsetUnits={-1}
    />
  </mesh>
);

// Component that loads and displays a textured panel face
// Dimensions are derived from the actual image aspect ratio
const TexturedFace: React.FC<{
  url: string;
  targetWidth: number;
  fallbackHeight: number;
  position: [number, number, number];
  rotation: [number, number, number];
  renderOrder?: number;
}> = ({ url, targetWidth, fallbackHeight, position, rotation, renderOrder = 0 }) => {
  const texture = useTexture(url);
  const { gl } = useThree();
  
  // Configure texture for correct color and high quality
  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    // Use mipmapping for smooth scaling at different distances
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    // Enable anisotropic filtering for crisper textures at angles
    texture.anisotropy = gl.capabilities.getMaxAnisotropy();
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }, [texture, gl]);

  // Calculate dimensions from actual image aspect ratio
  const { width, height } = useMemo(() => {
    const img = texture.image;
    if (img && img.width && img.height) {
      const aspectRatio = img.width / img.height;
      return {
        width: targetWidth,
        height: targetWidth / aspectRatio,
      };
    }
    return { width: targetWidth, height: fallbackHeight };
  }, [texture.image, targetWidth, fallbackHeight]);

  return (
    <mesh position={position} rotation={rotation} renderOrder={renderOrder}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial 
        map={texture} 
        side={FrontSide}
        toneMapped={false}
        depthWrite={true}
        depthTest={true}
      />
    </mesh>
  );
};

/**
 * PanelMesh - A 3D panel with front and back textures
 * 
 * Creates a double-sided plane that represents a physical card panel.
 * The front texture faces +Z and the back texture faces -Z.
 */
export const PanelMesh: React.FC<PanelMeshProps> = ({
  frontPanel,
  backPanel,
  width,
  height,
  thickness = 0.01,
  renderOrder = 0,
}) => {
  const halfThickness = thickness / 2;

  return (
    <group>
      {/* Front face - facing +Z */}
      {frontPanel ? (
        <React.Suspense 
          key={`front-${frontPanel.id}-${frontPanel.panel_index}`}
          fallback={
            <PlaceholderPanel 
              width={width} 
              height={height} 
              color="#6366F1" 
              position={[0, 0, halfThickness]}
              rotation={[0, 0, 0]}
              renderOrder={renderOrder}
            />
          }
        >
          <TexturedFace
            key={`front-tex-${frontPanel.id}-${frontPanel.panel_index}`}
            url={frontPanel.thumbnail_url}
            targetWidth={width}
            fallbackHeight={height}
            position={[0, 0, halfThickness]}
            rotation={[0, 0, 0]}
            renderOrder={renderOrder}
          />
        </React.Suspense>
      ) : (
        <PlaceholderPanel 
          key="front-placeholder"
          width={width} 
          height={height} 
          color="#6366F1" 
          position={[0, 0, halfThickness]}
          rotation={[0, 0, 0]}
          renderOrder={renderOrder}
        />
      )}

      {/* Back face - facing -Z (rotated 180° on Y axis) */}
      {backPanel ? (
        <React.Suspense 
          key={`back-${backPanel.id}-${backPanel.panel_index}`}
          fallback={
            <PlaceholderPanel 
              width={width} 
              height={height} 
              color="#8B5CF6" 
              position={[0, 0, -halfThickness]}
              rotation={[0, Math.PI, 0]}
              renderOrder={renderOrder}
            />
          }
        >
          <TexturedFace
            key={`back-tex-${backPanel.id}-${backPanel.panel_index}`}
            url={backPanel.thumbnail_url}
            targetWidth={width}
            fallbackHeight={height}
            position={[0, 0, -halfThickness]}
            rotation={[0, Math.PI, 0]}
            renderOrder={renderOrder}
          />
        </React.Suspense>
      ) : (
        <PlaceholderPanel 
          key="back-placeholder"
          width={width} 
          height={height} 
          color="#8B5CF6" 
          position={[0, 0, -halfThickness]}
          rotation={[0, Math.PI, 0]}
          renderOrder={renderOrder}
        />
      )}
    </group>
  );
};
