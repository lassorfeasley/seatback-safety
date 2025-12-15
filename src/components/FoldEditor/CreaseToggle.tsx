import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FoldDirection } from './types';

interface CreaseToggleProps {
  creaseIndex: number;
  foldDirection: FoldDirection;
  unfoldSequence: number;
  maxSequence: number; // total number of creases - 1
  onChange: (direction: FoldDirection) => void;
  onSequenceChange: (sequence: number) => void;
  disabled?: boolean;
}

export const CreaseToggle: React.FC<CreaseToggleProps> = ({
  creaseIndex,
  foldDirection,
  unfoldSequence,
  maxSequence,
  onChange,
  onSequenceChange,
  disabled = false,
}) => {
  const toggleDirection = () => {
    onChange(foldDirection === 'forward' ? 'backward' : 'forward');
  };

  const incrementSequence = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (unfoldSequence < maxSequence) {
      onSequenceChange(unfoldSequence + 1);
    }
  };

  const decrementSequence = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (unfoldSequence > 0) {
      onSequenceChange(unfoldSequence - 1);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Crease position label */}
      <span className="text-[10px] text-muted-foreground font-mono">
        pos #{creaseIndex}
      </span>
      
      {/* Direction toggle button */}
      <Button
        type="button"
        onClick={toggleDirection}
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
      
      {/* Unfold sequence control */}
      <div className="flex items-center gap-0.5 bg-muted/50 rounded px-1 py-0.5">
        <button
          type="button"
          onClick={decrementSequence}
          disabled={disabled || unfoldSequence <= 0}
          className="p-0.5 hover:bg-muted rounded disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Move earlier in unfold sequence"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <span 
          className="text-xs font-medium min-w-[40px] text-center"
          title="Unfold sequence (lower = unfolds first)"
        >
          {unfoldSequence + 1}{getOrdinalSuffix(unfoldSequence + 1)}
        </span>
        <button
          type="button"
          onClick={incrementSequence}
          disabled={disabled || unfoldSequence >= maxSequence}
          className="p-0.5 hover:bg-muted rounded disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Move later in unfold sequence"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

// Helper to get ordinal suffix (1st, 2nd, 3rd, etc.)
function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

