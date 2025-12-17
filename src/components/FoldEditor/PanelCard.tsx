import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Panel } from './types';

interface PanelCardProps {
  panel: Panel;
}

// Get spread label: F-S1, B-S1, etc.
const getSpreadLabel = (side: 'front' | 'back', panelIndex: number): string => {
  const prefix = side === 'front' ? 'F' : 'B';
  const spreadNumber = panelIndex + 1; // 0-indexed to 1-indexed
  return `${prefix}-S${spreadNumber}`;
};

export const PanelCard: React.FC<PanelCardProps> = ({ panel }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: panel.id,
    data: { panel },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const spreadLabel = getSpreadLabel(panel.side, panel.panel_index);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "h-[200px] w-auto overflow-hidden cursor-grab active:cursor-grabbing",
        "relative flex flex-col shrink-0",
        isDragging && "shadow-lg z-50"
      )}
      {...listeners}
      {...attributes}
    >
      <img
        src={panel.thumbnail_url}
        alt={`${panel.side === 'front' ? 'Front' : 'Back'} Spread ${panel.panel_index + 1}`}
        className="h-full w-auto object-contain"
        draggable={false}
      />
      <Badge
        variant="secondary"
        className="absolute bottom-0 left-0 right-0 rounded-none bg-black/60 text-white border-0 justify-center font-mono"
      >
        {spreadLabel}
      </Badge>
    </Card>
  );
};

