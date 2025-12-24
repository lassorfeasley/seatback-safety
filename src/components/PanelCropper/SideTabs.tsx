import React from 'react';
import type { SideTabsProps } from './types';

export const SideTabs: React.FC<SideTabsProps> = ({
  activeSide,
  frontScanCount,
  backScanCount,
  onSideChange,
}) => {
  return (
    <div className="flex border-b border-border">
      <button
        className={`
          relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors
          ${activeSide === 'front'
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
          }
        `}
        onClick={() => onSideChange('front')}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        Front Side
        {frontScanCount > 0 && (
          <span className={`
            inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold rounded-full
            ${activeSide === 'front'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
            }
          `}>
            {frontScanCount}
          </span>
        )}
        {activeSide === 'front' && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
        )}
      </button>

      <button
        className={`
          relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors
          ${activeSide === 'back'
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
          }
        `}
        onClick={() => onSideChange('back')}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
          />
        </svg>
        Back Side
        {backScanCount > 0 && (
          <span className={`
            inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold rounded-full
            ${activeSide === 'back'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
            }
          `}>
            {backScanCount}
          </span>
        )}
        {activeSide === 'back' && (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
        )}
      </button>
    </div>
  );
};

