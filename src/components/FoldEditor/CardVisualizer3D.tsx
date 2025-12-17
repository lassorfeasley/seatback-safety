import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RotateCw, RotateCcw, Maximize2, Minimize2 } from 'lucide-react';
import { FoldableCard } from './FoldableCard';
import type { Panel, Crease } from './types';

interface CardVisualizer3DProps {
  panels: Panel[];
  creases: Crease[];
}

// Animation timing constants
const FOLD_DURATION_PER_CREASE = 400; // ms per crease animation
const FOLD_STAGGER_DELAY = 100; // ms overlap between sequential folds

export const CardVisualizer3D: React.FC<CardVisualizer3DProps> = ({ panels, creases }) => {
  // Target state: 0 = all unfolded, 1 = all folded
  // Start folded so front panel 0 is visible as the "cover"
  const [targetFoldState, setTargetFoldState] = useState<0 | 1>(1);
  
  // OrbitControls ref for reset functionality
  const controlsRef = useRef<any>(null);
  
  // Animation refs
  const animationTimeouts = useRef<NodeJS.Timeout[]>([]);

  // Get front creases for fold direction reference
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

  // Reset camera view
  const handleReset = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  }, []);

  // Flip to back view (180° on Y axis)
  const handleFlip = useCallback(() => {
    // OrbitControls doesn't have a direct flip, so we'll rotate around
    if (controlsRef.current) {
      const controls = controlsRef.current;
      const currentAzimuth = controls.getAzimuthalAngle();
      controls.setAzimuthalAngle(currentAzimuth + Math.PI);
    }
  }, []);

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

  // Handle slider change - sequential unfolding based on slider position
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const sliderValue = parseFloat(e.target.value);
    const n = creasesByUnfoldOrder.length;
    
    if (n === 0) return;
    
    const newFolds: Record<number, number> = {};
    
    creasesByUnfoldOrder.forEach((crease, orderIndex) => {
      // Each crease gets a segment of the slider range
      // Crease at orderIndex i unfolds during slider range [(n-i-1)/n, (n-i)/n]
      const rangeStart = (n - orderIndex - 1) / n;
      const rangeEnd = (n - orderIndex) / n;
      
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
  }, [creasesByUnfoldOrder]);

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
            Drag to rotate • Scroll to zoom
          </p>
          <div className="flex items-center gap-2 flex-1 max-w-xs">
            <span className="text-xs text-muted-foreground">Flat</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={overallFoldProgress}
              onChange={handleSliderChange}
              className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs text-muted-foreground">Folded</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg overflow-hidden bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900" style={{ height: '400px' }}>
          <Canvas
            camera={{ position: [0, 50, 400], fov: 50 }}
            shadows
            dpr={[1, 2]}
            gl={{ 
              logarithmicDepthBuffer: true,
              antialias: true,
            }}
          >
            {/* Soft ambient lighting */}
            <ambientLight intensity={0.6} />
            
            {/* Main key light */}
            <directionalLight
              position={[150, 200, 150]}
              intensity={1.2}
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-camera-far={500}
              shadow-camera-left={-200}
              shadow-camera-right={200}
              shadow-camera-top={200}
              shadow-camera-bottom={-200}
              shadow-bias={-0.0001}
            />
            
            {/* Fill light from opposite side */}
            <directionalLight
              position={[-100, 80, -100]}
              intensity={0.4}
            />
            
            {/* Rim light for edge definition */}
            <directionalLight
              position={[0, -50, -150]}
              intensity={0.2}
            />

            {/* Environment for subtle reflections */}
            <Environment preset="studio" />

            {/* The foldable card */}
            <FoldableCard
              panels={panels}
              creases={creases}
              creaseFolds={creaseFolds}
              panelWidth={180}
              panelHeight={120}
            />

            {/* Soft contact shadow on ground */}
            <ContactShadows
              position={[0, -90, 0]}
              opacity={0.5}
              scale={400}
              blur={2.5}
              far={150}
              color="#1a1a2e"
            />

            {/* Orbit controls for rotation/zoom */}
            <OrbitControls
              ref={controlsRef}
              enablePan={false}
              minDistance={150}
              maxDistance={600}
              target={[0, 0, 0]}
              autoRotate={false}
              enableDamping
              dampingFactor={0.05}
            />
          </Canvas>
        </div>
      </CardContent>
    </Card>
  );
};
