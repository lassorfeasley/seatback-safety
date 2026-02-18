import React from 'react';
import { Check } from 'lucide-react';
import type { StepIndicatorProps } from './types';

const STEPS = [
  { step: 1 as const, label: 'Panel Count' },
  { step: 2 as const, label: 'Image Library' },
  { step: 3 as const, label: 'Crop Panels' },
  { step: 4 as const, label: 'Fold Structure' },
];

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  currentStep,
  onStepClick,
}) => {
  return (
    <nav className="flex items-center justify-center gap-1 py-4 px-4" aria-label="Steps">
      {STEPS.map(({ step, label }, index) => {
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;
        const isClickable = step < currentStep; // can only go back

        return (
          <React.Fragment key={step}>
            {/* Connector line */}
            {index > 0 && (
              <div
                className={`hidden sm:block h-px w-8 mx-1 transition-colors ${
                  step <= currentStep ? 'bg-primary' : 'bg-border'
                }`}
              />
            )}

            {/* Step button */}
            <button
              onClick={() => isClickable && onStepClick(step)}
              disabled={!isClickable}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
                ${isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : isCompleted
                  ? 'bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer'
                  : 'bg-muted/50 text-muted-foreground cursor-default'
                }
              `}
              aria-current={isActive ? 'step' : undefined}
            >
              {/* Step number or check */}
              <span
                className={`
                  flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                  ${isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                  }
                `}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : step}
              </span>

              {/* Label (hidden on small screens for non-active steps) */}
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
