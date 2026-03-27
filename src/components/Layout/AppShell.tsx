import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';

const NAV_ITEMS = [
  {
    label: 'Cards',
    to: '/admin',
    match: (p: string) => p === '/admin' || p.startsWith('/admin/cards'),
  },
  {
    label: 'Airlines',
    to: '/admin/airlines',
    match: (p: string) => p.startsWith('/admin/airlines'),
  },
  {
    label: 'Manufacturers',
    to: '/admin/manufacturers',
    match: (p: string) => p.startsWith('/admin/manufacturers'),
  },
  {
    label: 'Social',
    to: '/admin/social',
    match: (p: string) => p.startsWith('/admin/social'),
  },
];

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const location = useLocation();

  return (
    <div className="h-dvh flex flex-col bg-background">
      <header className="flex-shrink-0 flex items-stretch border-b border-black/10">
        <Link
          to="/admin"
          className="flex h-11 items-center bg-red-600 hover:bg-red-700 pr-4 text-white text-[10px] font-medium tracking-widest transition-colors"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center">
            <img src="/logo.png" alt="Seatback Safety" className="h-5 w-5" />
          </span>
          admin
        </Link>

        <nav className="flex-1 flex items-center px-6 gap-6">
          {NAV_ITEMS.map((item) => {
            const isActive = item.match(location.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'text-[10px] font-medium tracking-widest uppercase transition-colors',
                  isActive ? 'text-red-600' : 'text-black/40 hover:text-black/70'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link
          to="/"
          className="flex items-center justify-center w-11 h-11 text-black/40 hover:text-black/70 hover:bg-gray-50 transition-colors border-l border-black/10"
          aria-label="View public site"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        {children}
      </div>
    </div>
  );
};
