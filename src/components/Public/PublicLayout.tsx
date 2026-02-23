import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { Search, Send, ChevronDown, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCENT = 'oklch(50% 0.134 242.749)';

const DECADES = [
  { label: "1960's", to: '/decades/1960' },
  { label: "1970's", to: '/decades/1970' },
  { label: "1980's", to: '/decades/1980' },
  { label: "1990's", to: '/decades/1990' },
  { label: "2000's", to: '/decades/2000' },
  { label: "2010's", to: '/decades/2010' },
  { label: "2020's", to: '/decades/2020' },
];

export const PublicLayout: React.FC = () => {
  const [decadesOpen, setDecadesOpen] = useState(false);
  const decadesRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (decadesRef.current && !decadesRef.current.contains(e.target as Node)) {
        setDecadesOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Nav bar */}
      <header className="sticky top-0 z-40" style={{ backgroundColor: ACCENT }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="h-14 flex items-center justify-between">
            {/* Left nav links */}
            <nav className="flex items-center gap-1">
              <NavItem to="/" end>Home</NavItem>
              <NavItem to="/airlines">Airlines</NavItem>
              <NavItem to="/manufacturers">Manufacturers</NavItem>

              {/* Decades dropdown */}
              <div ref={decadesRef} className="relative">
                <button
                  onClick={() => setDecadesOpen(!decadesOpen)}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors',
                    decadesOpen ? 'text-white' : 'text-white/70 hover:text-white'
                  )}
                >
                  Decades <ChevronDown className="h-3 w-3" />
                </button>
                {decadesOpen && (
                  <div className="absolute top-full left-0 mt-1 rounded-md border bg-card shadow-lg py-1 min-w-[120px] z-50">
                    <Link
                      to="/decades"
                      onClick={() => setDecadesOpen(false)}
                      className="block px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      All Decades
                    </Link>
                    <div className="border-t my-1" />
                    {DECADES.map((d) => (
                      <Link
                        key={d.to}
                        to={d.to}
                        onClick={() => setDecadesOpen(false)}
                        className="block px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        {d.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </nav>

            {/* Right icons */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/search')}
                className="text-white/70 hover:text-white transition-colors"
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </button>
              <Link
                to="/about"
                className="text-white/70 hover:text-white transition-colors"
                aria-label="About"
              >
                <Send className="h-5 w-5" />
              </Link>
            </div>
          </div>

          {/* Active link underline accent */}
          <div className="h-[3px] -mt-[3px] bg-red-500/80 rounded-full"
               style={{ opacity: 0 }} />
        </div>

        {/* Tagline bar */}
        <div className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-6 py-2 flex items-center justify-center gap-3
                          text-xs text-white/60 tracking-wide uppercase">
            <span>We collect seatback safety cards.</span>
            <span>Created by Lassor Feasley.</span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-start justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm text-muted-foreground">Developed by Lassor</p>
            <a href="https://www.lassor.com" target="_blank" rel="noopener noreferrer"
               className="text-xs text-muted-foreground/70 hover:text-foreground transition-colors">
              www.Lassor.com
            </a>
            <a href="mailto:Feasley@Lassor.com"
               className="text-xs text-muted-foreground/70 hover:text-foreground transition-colors">
              Feasley@Lassor.com
            </a>
          </div>
          <Link to="/admin" className="text-muted-foreground/40 hover:text-muted-foreground transition-colors mt-1">
            <Cloud className="h-5 w-5" />
          </Link>
        </div>
      </footer>
    </div>
  );
};

const NavItem: React.FC<{ to: string; end?: boolean; children: React.ReactNode }> = ({ to, end, children }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) =>
      cn(
        'relative px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors',
        isActive ? 'text-white' : 'text-white/70 hover:text-white'
      )
    }
  >
    {({ isActive }) => (
      <>
        {children}
        {isActive && (
          <span className="absolute left-0 right-0 -bottom-[7px] h-[3px] rounded-full bg-red-500" />
        )}
      </>
    )}
  </NavLink>
);
