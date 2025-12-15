import React, { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  CollisionDetection,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { PanelRow } from './PanelRow';
import { PanelCard } from './PanelCard';
import { CardVisualizer } from './CardVisualizer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Minus } from 'lucide-react';
import type { Panel, Crease, Side, FoldDirection, FoldEditorProps } from './types';

export const FoldEditor: React.FC<FoldEditorProps> = ({
  cardId,
  initialPanels,
  initialCreases,
  onSave,
}) => {
  // Validate initial data has equal front/back panels
  const frontCount = initialPanels.filter((p) => p.side === 'front').length;
  const backCount = initialPanels.filter((p) => p.side === 'back').length;
  if (frontCount !== backCount) {
    console.warn(
      `FoldEditor: Initial panels must have equal front/back counts. Found ${frontCount} front and ${backCount} back.`
    );
  }

  // Normalize creases to ensure opposite directions for front/back at same position
  // and include unfold_sequence
  const normalizeCreasesToOppositeDirections = useCallback((
    currentPanels: Panel[],
    currentCreases: Crease[]
  ): Crease[] => {
    const normalized: Crease[] = [];
    const frontPanels = currentPanels
      .filter((p) => p.side === 'front')
      .sort((a, b) => a.panel_index - b.panel_index);
    const backPanels = currentPanels
      .filter((p) => p.side === 'back')
      .sort((a, b) => a.panel_index - b.panel_index);

    // Process each crease position (0, 1, 2, etc.)
    const maxCreases = Math.max(frontPanels.length - 1, backPanels.length - 1);
    
    for (let creaseIndex = 0; creaseIndex < maxCreases; creaseIndex++) {
      // Find front crease at this position
      const frontCrease = currentCreases.find(
        (c) => c.side === 'front' && c.between_panel === creaseIndex
      );

      // Find back crease at this position
      const backCrease = currentCreases.find(
        (c) => c.side === 'back' && c.between_panel === creaseIndex
      );

      // Determine front direction (use existing or default to forward)
      const frontDirection: FoldDirection = frontCrease?.fold_direction || 'forward';
      
      // Back must be opposite of front
      const backDirection: FoldDirection = frontDirection === 'forward' ? 'backward' : 'forward';

      // Determine unfold sequence (use existing or default to crease index)
      // Front and back creases at the same position share the same sequence
      const unfoldSequence: number = frontCrease?.unfold_sequence ?? backCrease?.unfold_sequence ?? creaseIndex;

      // Add front crease if panels exist
      if (creaseIndex < frontPanels.length - 1) {
        normalized.push({
          id: frontCrease?.id,
          side: 'front',
          between_panel: creaseIndex,
          fold_direction: frontDirection,
          unfold_sequence: unfoldSequence,
        });
      }

      // Add back crease if panels exist
      if (creaseIndex < backPanels.length - 1) {
        normalized.push({
          id: backCrease?.id,
          side: 'back',
          between_panel: creaseIndex,
          fold_direction: backDirection,
          unfold_sequence: unfoldSequence,
        });
      }
    }

    return normalized;
  }, []);

  // Normalize initial creases to ensure opposite directions
  const normalizedInitialCreases = useMemo(() => {
    return normalizeCreasesToOppositeDirections(initialPanels, initialCreases);
  }, [initialPanels, initialCreases, normalizeCreasesToOppositeDirections]);

  const [panels, setPanels] = useState<Panel[]>(initialPanels);
  const [creases, setCreases] = useState<Crease[]>(normalizedInitialCreases);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Custom collision detection that prefers panels over droppable areas
  const collisionDetection: CollisionDetection = (args) => {
    // First check for pointer within collisions (panels)
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      // Filter out droppable containers, prefer panels
      const panelCollisions = pointerCollisions.filter(
        (c) => !String(c.id).startsWith('droppable-')
      );
      if (panelCollisions.length > 0) {
        return panelCollisions;
      }
      return pointerCollisions;
    }
    
    // Fall back to rect intersection
    return rectIntersection(args);
  };

  // Separate panels by side
  const frontPanels = useMemo(
    () => panels.filter((p) => p.side === 'front'),
    [panels]
  );
  const backPanels = useMemo(
    () => panels.filter((p) => p.side === 'back'),
    [panels]
  );

  // Get creases for a specific side
  const getCreasesForSide = useCallback(
    (side: Side): Crease[] => {
      return creases.filter((crease) => crease.side === side);
    },
    [creases]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    const activePanel = panels.find((p) => p.id === active.id);
    if (!activePanel) {
      setActiveId(null);
      return;
    }

    const overId = over.id as string;

    // Check if dropping on a side (droppable area)
    if (overId === 'droppable-front' || overId === 'droppable-back') {
      const newSide = overId === 'droppable-front' ? 'front' : 'back';
      const oldSide = activePanel.side;
      
      // If moving to the same side, do nothing
      if (newSide === oldSide) {
        setActiveId(null);
        return;
      }

      // Enforce equal panels: swap with panel at same index on other side
      const oldSidePanels = panels
        .filter((p) => p.side === oldSide)
        .sort((a, b) => a.panel_index - b.panel_index);
      const newSidePanels = panels
        .filter((p) => p.side === newSide)
        .sort((a, b) => a.panel_index - b.panel_index);

      const activePanelIndex = oldSidePanels.findIndex((p) => p.id === activePanel.id);
      
      // Find the panel at the same index on the other side to swap with
      const swapPanel = newSidePanels[activePanelIndex];
      
      if (swapPanel) {
        // Swap both panels
        const updatedPanels = panels.map((p) => {
          if (p.id === activePanel.id) {
            return { ...p, side: newSide };
          } else if (p.id === swapPanel.id) {
            return { ...p, side: oldSide };
          }
          return p;
        });

        // Reindex all panels
        const reindexedPanels = reindexPanels(updatedPanels);
        setPanels(reindexedPanels);
        setHasChanges(true);

        // Remap creases based on new adjacency
        const remappedCreases = remapCreases(reindexedPanels, creases);
        setCreases(remappedCreases);
      } else {
        // If no panel to swap with, just move (shouldn't happen with equal counts)
        const updatedPanels = panels.map((p) =>
          p.id === activePanel.id ? { ...p, side: newSide } : p
        );
        const reindexedPanels = reindexPanels(updatedPanels);
        setPanels(reindexedPanels);
        setHasChanges(true);
        const remappedCreases = remapCreases(reindexedPanels, creases);
        setCreases(remappedCreases);
      }
    }
    // Check if dropping on another panel
    else {
      const overPanel = panels.find((p) => p.id === overId);
      if (!overPanel) {
        setActiveId(null);
        return;
      }

      // If dropping on a panel from a different side, swap the panels
      if (activePanel.side !== overPanel.side) {
        // Swap the two panels
        const updatedPanels = panels.map((p) => {
          if (p.id === activePanel.id) {
            return { ...p, side: overPanel.side, panel_index: overPanel.panel_index };
          } else if (p.id === overPanel.id) {
            return { ...p, side: activePanel.side, panel_index: activePanel.panel_index };
          }
          return p;
        });

        // Reindex all panels
        const reindexedPanels = reindexPanels(updatedPanels);
        setPanels(reindexedPanels);
        setHasChanges(true);

        // Remap creases based on new adjacency
        const remappedCreases = remapCreases(reindexedPanels, creases);
        setCreases(remappedCreases);
      } else {
        // Reorder within the same side
        const sidePanels = panels
          .filter((p) => p.side === activePanel.side)
          .sort((a, b) => a.panel_index - b.panel_index);

        const oldIndex = sidePanels.findIndex((p) => p.id === active.id);
        const newIndex = sidePanels.findIndex((p) => p.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(sidePanels, oldIndex, newIndex);
          
          // Update panel indices based on new order
          const updatedPanels = panels.map((p) => {
            const reorderedPanel = reordered.find((rp) => rp.id === p.id);
            if (reorderedPanel) {
              const newIndex = reordered.indexOf(reorderedPanel);
              return { ...p, panel_index: newIndex };
            }
            return p;
          });

          // Reindex all panels to ensure continuous indices per side
          const reindexedPanels = reindexPanels(updatedPanels);
          setPanels(reindexedPanels);
          setHasChanges(true);

          // Remap creases
          const remappedCreases = remapCreases(reindexedPanels, creases);
          setCreases(remappedCreases);
        }
      }
    }

    setActiveId(null);
  };

  // Reindex panels so indices are continuous per side (0, 1, 2, ...)
  const reindexPanels = (panelsToIndex: Panel[]): Panel[] => {
    const front = panelsToIndex
      .filter((p) => p.side === 'front')
      .sort((a, b) => a.panel_index - b.panel_index);
    const back = panelsToIndex
      .filter((p) => p.side === 'back')
      .sort((a, b) => a.panel_index - b.panel_index);

    return panelsToIndex.map((p) => {
      if (p.side === 'front') {
        const index = front.findIndex((fp) => fp.id === p.id);
        return { ...p, panel_index: index };
      } else {
        const index = back.findIndex((bp) => bp.id === p.id);
        return { ...p, panel_index: index };
      }
    });
  };


  // Remap creases based on current panel adjacency
  // Enforces opposite fold directions for corresponding front/back creases
  const remapCreases = (
    currentPanels: Panel[],
    currentCreases: Crease[]
  ): Crease[] => {
    return normalizeCreasesToOppositeDirections(currentPanels, currentCreases);
  };

  const handleCreaseChange = useCallback(
    (betweenPanel: number, direction: FoldDirection, side: Side) => {
      setCreases((prev) => {
        // Find the crease on the clicked side
        const clickedCrease = prev.find(
          (c) => c.side === side && c.between_panel === betweenPanel
        );

        // Find the corresponding crease on the opposite side
        const oppositeSide: Side = side === 'front' ? 'back' : 'front';
        const oppositeCrease = prev.find(
          (c) => c.side === oppositeSide && c.between_panel === betweenPanel
        );

        // The clicked side becomes the source of truth
        // The opposite side must be opposite direction
        const oppositeDirection: FoldDirection = direction === 'forward' ? 'backward' : 'forward';

        // Update both creases
        let updated = [...prev];
        
        // Update or create the clicked crease
        if (clickedCrease) {
          updated = updated.map((c) =>
            c.side === side && c.between_panel === betweenPanel
              ? { ...c, fold_direction: direction }
              : c
          );
        } else {
          updated.push({
            id: undefined,
            side: side,
            between_panel: betweenPanel,
            fold_direction: direction,
            unfold_sequence: betweenPanel, // Default to position
          });
        }

        // Update or create the opposite crease
        if (oppositeCrease) {
          updated = updated.map((c) =>
            c.side === oppositeSide && c.between_panel === betweenPanel
              ? { ...c, fold_direction: oppositeDirection }
              : c
          );
        } else {
          updated.push({
            id: undefined,
            side: oppositeSide,
            between_panel: betweenPanel,
            fold_direction: oppositeDirection,
            unfold_sequence: betweenPanel, // Default to position
          });
        }

        return updated;
      });
      setHasChanges(true);
    },
    []
  );

  // Handle changing the unfold sequence for a crease
  // Both front and back creases at the same position share the same sequence
  // When changing to a sequence that's already taken, swap with that crease
  const handleSequenceChange = useCallback(
    (betweenPanel: number, newSequence: number, _side: Side) => {
      setCreases((prev) => {
        // Find the current sequence of the crease being changed
        const currentCrease = prev.find(
          (c) => c.side === 'front' && c.between_panel === betweenPanel
        );
        const oldSequence = currentCrease?.unfold_sequence ?? betweenPanel;

        // Find the crease that currently has the target sequence (if any)
        const swapCrease = prev.find(
          (c) => c.side === 'front' && c.unfold_sequence === newSequence && c.between_panel !== betweenPanel
        );

        // Swap sequences: the target crease gets our old sequence
        return prev.map((c) => {
          // Update the crease being changed (both front and back)
          if (c.between_panel === betweenPanel) {
            return { ...c, unfold_sequence: newSequence };
          }
          // Swap with the crease that had the target sequence (both front and back)
          if (swapCrease && c.between_panel === swapCrease.between_panel) {
            return { ...c, unfold_sequence: oldSequence };
          }
          return c;
        });
      });
      setHasChanges(true);
    },
    []
  );

  const handleSave = useCallback(() => {
    if (onSave) {
      onSave({
        panels,
        creases,
      });
      setHasChanges(false);
    }
  }, [panels, creases, onSave]);

  // Calculate current number of spreads (front panels = back panels = spreads)
  const spreadCount = frontPanels.length;

  // Add a new spread (one panel to front, one to back)
  const handleAddSpread = useCallback(() => {
    const newIndex = spreadCount;
    
    // Generate unique IDs for new panels
    const newFrontPanel: Panel = {
      id: `panel-front-${Date.now()}`,
      side: 'front',
      panel_index: newIndex,
      thumbnail_url: `https://via.placeholder.com/120x160/6366F1/FFFFFF?text=Front+${newIndex}`,
    };
    
    const newBackPanel: Panel = {
      id: `panel-back-${Date.now()}`,
      side: 'back',
      panel_index: newIndex,
      thumbnail_url: `https://via.placeholder.com/120x160/8B5CF6/FFFFFF?text=Back+${newIndex}`,
    };

    setPanels((prev) => [...prev, newFrontPanel, newBackPanel]);

    // Add creases if we now have more than 1 panel per side
    if (spreadCount >= 1) {
      const newCreaseIndex = spreadCount - 1;
      setCreases((prev) => [
        ...prev,
        {
          id: undefined,
          side: 'front',
          between_panel: newCreaseIndex,
          fold_direction: 'forward',
          unfold_sequence: newCreaseIndex, // Default sequence based on position
        },
        {
          id: undefined,
          side: 'back',
          between_panel: newCreaseIndex,
          fold_direction: 'backward',
          unfold_sequence: newCreaseIndex, // Same sequence as front
        },
      ]);
    }

    setHasChanges(true);
  }, [spreadCount]);

  // Remove the last spread (last panel from front and back)
  const handleRemoveSpread = useCallback(() => {
    if (spreadCount <= 1) return; // Need at least 1 spread

    const lastIndex = spreadCount - 1;

    // Remove last panel from each side
    setPanels((prev) =>
      prev.filter((p) => p.panel_index !== lastIndex)
    );

    // Remove creases that reference the removed panels
    const creaseToRemove = lastIndex - 1;
    if (creaseToRemove >= 0) {
      setCreases((prev) =>
        prev.filter((c) => c.between_panel !== creaseToRemove)
      );
    }

    setHasChanges(true);
  }, [spreadCount]);

  return (
    <>
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Fold Editor</CardTitle>
        <p className="text-sm text-muted-foreground">
          Each spread contains a front and back panel. Drag panels to reorder or swap between sides.
          Click crease toggles to change fold direction — front and back creases always fold in opposite directions.
        </p>
      </CardHeader>
      <CardContent>
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <PanelRow
            side="front"
            panels={frontPanels}
            creases={getCreasesForSide('front')}
            totalCreases={spreadCount - 1}
            onCreaseChange={(betweenPanel, direction) =>
              handleCreaseChange(betweenPanel, direction, 'front')
            }
            onSequenceChange={(betweenPanel, sequence) =>
              handleSequenceChange(betweenPanel, sequence, 'front')
            }
          />
          <PanelRow
            side="back"
            panels={backPanels}
            creases={getCreasesForSide('back')}
            totalCreases={spreadCount - 1}
            onCreaseChange={(betweenPanel, direction) =>
              handleCreaseChange(betweenPanel, direction, 'back')
            }
            onSequenceChange={(betweenPanel, sequence) =>
              handleSequenceChange(betweenPanel, sequence, 'back')
            }
          />
          <DragOverlay>
            {activeId ? (
              <PanelCard
                panel={panels.find((p) => p.id === activeId) || panels[0]}
              />
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Spread controls */}
        <div className="mt-6 flex items-center gap-4 border-t pt-4">
          <span className="text-sm font-medium">Spreads:</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRemoveSpread}
              disabled={spreadCount <= 1}
              aria-label="Remove spread"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center font-mono text-lg">{spreadCount}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={handleAddSpread}
              aria-label="Add spread"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            ({spreadCount} front + {spreadCount} back panels)
          </span>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setPanels(initialPanels);
              setCreases(normalizedInitialCreases);
              setHasChanges(false);
            }}
            disabled={!hasChanges}
          >
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || !onSave}
          >
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>

    {/* Card Visualizer */}
    <CardVisualizer panels={panels} creases={creases} />
    </>
  );
};

