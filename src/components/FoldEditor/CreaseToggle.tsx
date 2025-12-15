import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FoldDirection } from './types';

interface CreaseToggleProps {
  creaseIndex: number;
  foldDirection: FoldDirection;
  onChange: (direction: FoldDirection) => void;
  disabled?: boolean;
}

export const CreaseToggle: React.FC<CreaseToggleProps> = ({
  creaseIndex,
  foldDirection,
  onChange,
  disabled = false,
}) => {
  const toggle = () => {
    onChange(foldDirection === 'forward' ? 'backward' : 'forward');
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        type="button"
        onClick={toggle}
        disabled={disabled}
        variant="outline"
        size="sm"
        className={cn(
          "min-w-[80px] gap-1.5",
          foldDirection === 'forward' 
            ? "bg-blue-50 hover:bg-blue-100 border-blue-200" 
            : "bg-orange-50 hover:bg-orange-100 border-orange-200"
        )}
        aria-label={`Crease ${creaseIndex} - Fold ${foldDirection}, click to toggle`}
      >
        {foldDirection === 'forward' ? (
          <ArrowRight className="h-3 w-3" />
        ) : (
          <ArrowLeft className="h-3 w-3" />
        )}
        <span className="text-xs uppercase font-medium">
          {foldDirection}
        </span>
      </Button>
      <span className="text-xs text-muted-foreground font-mono">
        #{creaseIndex}
      </span>
    </div>
  );
};

