import React from 'react';
import { Check } from 'lucide-react';
import type { StepIndicatorProps } from './types';

const STEPS = [
  { step: 1 as const, label: 'Card Info' },
  { step: 2 as const, label: 'Image Library' },
  { step: 3 as const, label: 'Crop Panels' },
  { step: 4 as const, label: 'Fold Structure' },
];

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  currentStep,
  onStepClick,
}) => {
  return (
    <nav className="flex items-center justify-center gap-1 py-3 px-4" aria-label="Steps">
      {STEPS.map(({ step, label }, index) => {
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;
        const isClickable = step < currentStep;

        return (
          <React.Fragment key={step}>
            {index > 0 && (
              <div
                className={`hidden sm:block h-px w-6 mx-0.5 transition-colors ${
                  step <= currentStep ? 'bg-foreground/20' : 'bg-border'
                }`}
              />
            )}
            <button
              onClick={() => isClickable && onStepClick(step)}
              disabled={!isClickable}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all
                ${isActive
                  ? 'text-foreground font-medium'
                  : isCompleted
                  ? 'text-muted-foreground hover:text-foreground cursor-pointer'
                  : 'text-muted-foreground/50 cursor-default'
                }
              `}
              aria-current={isActive ? 'step' : undefined}
            >
              <span
                className={`
                  flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-medium
                  ${isActive
                    ? 'bg-foreground text-background'
                    : isCompleted
                    ? 'bg-foreground/10 text-foreground'
                    : 'bg-muted text-muted-foreground'
                  }
                `}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : step}
              </span>
              <span className={`${isActive ? '' : 'hidden sm:inline'}`}>
                {label}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
};
