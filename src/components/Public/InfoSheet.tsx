import React from 'react';

export function InfoRow({
  label,
  children,
  variant = 'default',
}: {
  label: string;
  children: React.ReactNode;
  variant?: 'default' | 'stat';
}) {
  if (children == null) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground/60">{label}</span>
      <span
        className={
          variant === 'stat'
            ? 'text-2xl sm:text-3xl font-bold text-foreground leading-tight'
            : 'text-sm text-foreground'
        }
      >
        {children}
      </span>
    </div>
  );
}

interface InfoSheetProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function InfoSheet({ open, title, children, className }: InfoSheetProps) {
  return (
    <div
      className={`fixed top-0 right-0 h-full z-40 transition-transform duration-300 ease-out ${
        open ? 'translate-x-0' : 'translate-x-full'
      } ${className ?? ''}`}
      style={{ width: 'min(320px, 85vw)' }}
    >
      <div className="h-full bg-white/95 backdrop-blur-xl border-l border-black/20 overflow-y-auto flex flex-col cursor-default">
        <div className="h-11 sm:h-8 flex items-center px-4 shrink-0 border-b border-black/20">
          <span className="text-xs font-medium text-foreground tracking-wider truncate pr-2">
            {title}
          </span>
        </div>
        <div className="p-5 pt-5 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
