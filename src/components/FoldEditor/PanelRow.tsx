import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { Card } from '@/components/ui/card';
import { PanelCard } from './PanelCard';
import { CreaseToggle } from './CreaseToggle';
import { cn } from '@/lib/utils';
import type { Panel, Crease, Side, FoldDirection } from './types';

interface PanelRowProps {
  side: Side;
  panels: Panel[];
  creases: Crease[];
  totalCreases: number; // Total number of creases for sequence numbering
  onCreaseChange: (betweenPanel: number, direction: FoldDirection, side: Side) => void;
  onSequenceChange: (betweenPanel: number, sequence: number, side: Side) => void;
}

export const PanelRow: React.FC<PanelRowProps> = ({
  side,
  panels,
  creases,
  totalCreases,
  onCreaseChange,
  onSequenceChange,
}) => {
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `droppable-${side}`,
  });

  // Sort panels by panel_index
  // For back side, reverse the display order so it matches physical position when card is flipped
  const sortedPanels = [...panels].sort((a, b) => {
    if (side === 'back') {
      return b.panel_index - a.panel_index; // Reverse order for back
    }
    return a.panel_index - b.panel_index;
  });

  // Get creases for this row (only between panels on the same side)
  // For back side, creases are displayed between reversed panels
  const getCreaseBetween = (panelIndex: number): Crease | undefined => {
    if (side === 'back') {
      // For reversed back panels, crease between display positions corresponds to
      // the crease at (panelIndex - 1) since we're going in reverse
      return creases.find((c) => c.between_panel === panelIndex - 1);
    }
    // Crease exists between panel_index N and N+1
    return creases.find((c) => c.between_panel === panelIndex);
  };

  // Get display label for the side
  const sideLabel = side === 'front' ? 'Front Side' : 'Back Side';

  return (
    <div className="mb-6">
      <h3 className="mb-3 text-lg font-semibold">
        {sideLabel}
      </h3>
      <Card
        ref={setDroppableRef}
        className={cn(
          "flex items-center gap-3 min-h-[220px] p-4 overflow-x-auto",
          "border-2 border-dashed transition-colors",
          isOver 
            ? "bg-green-50 border-green-300" 
            : "bg-muted/30 border-border"
        )}
      >
        <SortableContext
          items={sortedPanels.map((p) => p.id)}
          strategy={horizontalListSortingStrategy}
        >
          {sortedPanels.length === 0 ? (
            <div className="w-full text-center text-muted-foreground py-10">
              Drop panels here
            </div>
          ) : (
            sortedPanels.map((panel, idx) => {
              const panelIndex = panel.panel_index;
              const crease = getCreaseBetween(panelIndex);
              
              // For back side, the crease index shown is based on the physical position
              // which is reversed relative to the panel_index
              const creaseDisplayIndex = side === 'back' 
                ? panelIndex - 1  // Crease to the left of this panel in original indexing
                : panelIndex;     // Crease to the right of this panel

              return (
                <React.Fragment key={panel.id}>
                  <PanelCard panel={panel} />
                  {idx < sortedPanels.length - 1 && crease && (
                    <CreaseToggle
                      creaseIndex={creaseDisplayIndex}
                      foldDirection={crease.fold_direction || 'forward'}
                      unfoldSequence={crease.unfold_sequence ?? creaseDisplayIndex}
                      maxSequence={totalCreases - 1}
                      onChange={(direction) =>
                        onCreaseChange(crease.between_panel, direction, side)
                      }
                      onSequenceChange={(sequence) =>
                        onSequenceChange(crease.between_panel, sequence, side)
                      }
                    />
                  )}
                </React.Fragment>
              );
            })
          )}
        </SortableContext>
      </Card>
    </div>
  );
};

