import React from 'react';
import { cn } from '@/lib/utils';
import {
  LayoutGrid,
  Plane,
  Factory,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export type Section = 'cards' | 'airlines' | 'manufacturers' | 'social';

interface NavItem {
  id: Section;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'cards', label: 'Cards', icon: <LayoutGrid className="h-5 w-5" /> },
  { id: 'airlines', label: 'Airlines', icon: <Plane className="h-5 w-5" /> },
  { id: 'manufacturers', label: 'Manufacturers', icon: <Factory className="h-5 w-5" /> },
  { id: 'social', label: 'Social', icon: <Calendar className="h-5 w-5" /> },
];

interface AppShellProps {
  activeSection: Section;
  onSectionChange: (section: Section) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeSection,
  onSectionChange,
  children,
}) => {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="h-dvh flex bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex-shrink-0 bg-card border-r flex flex-col transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-[52px]' : 'w-[200px]'
        )}
      >
        {/* Logo / brand area */}
        <div className={cn(
          'flex items-center border-b h-[61px] px-3',
          collapsed ? 'justify-center' : 'gap-2.5'
        )}>
          <div className="flex-shrink-0 h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <img src="/logo.png" alt="Seatback Safety" className="h-5 w-5" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-sm tracking-tight truncate">Seatback</span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-2 px-2 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                activeSection === item.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t px-2 py-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground',
              'hover:bg-accent hover:text-accent-foreground transition-colors w-full',
              collapsed && 'justify-center px-0'
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {children}
      </div>
    </div>
  );
};
