import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Minus, Check, LayoutGrid } from 'lucide-react';
import type { PanelCountStepProps } from './types';

export const PanelCountStep: React.FC<PanelCountStepProps> = ({
  panelCount,
  onConfirm,
}) => {
  const [count, setCount] = useState(panelCount > 0 ? panelCount : 3);

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Safety Card Setup</CardTitle>
          <p className="text-sm text-muted-foreground">
            Start by telling us how many panels your safety card has. Each panel has a front and a back side.
          </p>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <LayoutGrid className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              How many panels does this card have?
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mb-8">
              Count the total number of individual panels in your safety card.
              A typical tri-fold card has 3 panels.
            </p>

            <div className="flex items-center gap-4 mb-8">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => setCount(Math.max(1, count - 1))}
                disabled={count <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>

              <div className="flex flex-col items-center">
                <span className="text-4xl font-bold tabular-nums w-16 text-center">
                  {count}
                </span>
                <span className="text-xs text-muted-foreground mt-1">
                  panel{count !== 1 ? 's' : ''}
                </span>
              </div>

              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => setCount(count + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Visual preview of panels */}
            <div className="flex items-center gap-1 mb-2">
              {Array.from({ length: count }, (_, i) => (
                <div
                  key={i}
                  className="w-10 h-14 rounded border-2 border-primary/30 bg-primary/5 flex items-center justify-center text-xs font-medium text-primary/60"
                >
                  {i + 1}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mb-8">
              {count} panel{count !== 1 ? 's' : ''} &times; 2 sides = {count * 2} images to crop
            </p>

            <Button
              size="lg"
              onClick={() => onConfirm(count)}
              className="gap-2"
            >
              Continue
              <Check className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
