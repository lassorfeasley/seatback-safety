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
  const sortedPanels = [...panels].sort((a, b) => a.panel_index - b.panel_index);

  // Get creases for this row (only between panels on the same side)
  const getCreaseBetween = (index: number): Crease | undefined => {
    // Crease exists between panel_index N and N+1
    // So if we have panels at index 0, 1, 2, creases are at between_panel 0, 1
    return creases.find((c) => c.between_panel === index);
  };

  return (
    <div className="mb-6">
      <h3 className="mb-3 text-lg font-semibold capitalize">
        {side}
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

              return (
                <React.Fragment key={panel.id}>
                  <PanelCard panel={panel} />
                  {idx < sortedPanels.length - 1 && (
                    <CreaseToggle
                      creaseIndex={panelIndex}
                      foldDirection={crease?.fold_direction || 'forward'}
                      unfoldSequence={crease?.unfold_sequence ?? panelIndex}
                      maxSequence={totalCreases - 1}
                      onChange={(direction) =>
                        onCreaseChange(panelIndex, direction, side)
                      }
                      onSequenceChange={(sequence) =>
                        onSequenceChange(panelIndex, sequence, side)
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

