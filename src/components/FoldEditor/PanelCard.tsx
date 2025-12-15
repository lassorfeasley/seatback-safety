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
        alt={`Panel ${panel.panel_index}`}
        className="h-full w-auto object-contain"
        draggable={false}
      />
      <Badge
        variant="secondary"
        className="absolute bottom-0 left-0 right-0 rounded-none bg-black/60 text-white border-0 justify-center"
      >
        #{panel.panel_index}
      </Badge>
    </Card>
  );
};

