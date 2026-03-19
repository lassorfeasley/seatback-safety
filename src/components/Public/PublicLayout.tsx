import { useState, useRef, useEffect, useCallback } from 'react';
import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { Search, Send, ChevronDown, Cloud, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BreadcrumbProvider, useBreadcrumbs } from './BreadcrumbContext';

const DECADES = [
  { label: "1960's", to: '/decades/1960' },
  { label: "1970's", to: '/decades/1970' },
  { label: "1980's", to: '/decades/1980' },
  { label: "1990's", to: '/decades/1990' },
  { label: "2000's", to: '/decades/2000' },
  { label: "2010's", to: '/decades/2010' },
  { label: "2020's", to: '/decades/2020' },
];

export const PublicLayout: React.FC = () => (
  <BreadcrumbProvider>
    <PublicLayoutInner />
  </BreadcrumbProvider>
);

const PublicLayoutInner: React.FC = () => {
  const [decadesOpen, setDecadesOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const decadesRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { breadcrumbs, toolbar } = useBreadcrumbs();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (decadesRef.current && !decadesRef.current.contains(e.target as Node)) {
        setDecadesOpen(false);
      }
      if (searchOpen && searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [searchOpen]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      navigate(`/search?q=${encodeURIComponent(q)}`);
      closeSearch();
    }
  }, [searchQuery, navigate, closeSearch]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') closeSearch();
  }, [closeSearch]);

  return (
    <div className="h-dvh flex flex-col bg-background overflow-x-clip overflow-y-auto">
      {/* Nav bar */}
      <header className="sticky top-0 z-40 backdrop-blur-xl" style={{ backgroundColor: 'oklch(50% 0.134 242.749 / 0.7)' }}>
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
                  <div className="absolute top-full left-0 mt-1 border bg-card shadow-lg py-1 min-w-[120px] z-50">
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

            {/* Right side: search or icons */}
            {searchOpen ? (
              <div ref={searchContainerRef} className="flex items-stretch gap-3 h-14">
                <form onSubmit={handleSearchSubmit} className="relative w-72 flex">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search cards..."
                    className="w-full bg-[#ebeaef] pl-10 pr-10 text-sm placeholder:opacity-60
                               focus:outline-none transition-colors"
                    style={{ color: 'oklch(50% 0.134 242.749)' }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </form>
                <button
                  onClick={closeSearch}
                  className="text-white/70 hover:text-white transition-colors"
                  aria-label="Close search"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={openSearch}
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
            )}
          </div>

        </div>

        {/* Tagline / Breadcrumb / Toolbar bar */}
        <div className="border-t border-white/20">
          <div className={`max-w-6xl mx-auto min-h-10 py-2 sm:py-0 sm:h-10 flex items-center gap-3
                          text-xs text-white tracking-wide uppercase ${toolbar ? '' : 'px-6'}`}
          >
            {toolbar ? (
              <div className="flex items-stretch w-full h-full">{toolbar}</div>
            ) : breadcrumbs.length > 0 ? (
              breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-white/30">→</span>}
                  {crumb.to ? (
                    <Link to={crumb.to} className="hover:text-white/90 transition-colors">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                </span>
              ))
            ) : (
              <a href="https://www.lassor.com" target="_blank" rel="noopener noreferrer" className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 hover:text-white/80 transition-colors">
                <span>✈️ We collect seatback safety cards.</span>
                <span>🧳 Created by Lassor Feasley.</span>
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="relative z-40 border-t backdrop-blur-xl bg-background/70">
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
          <span className="absolute left-0 right-0 -bottom-[14px] h-[3px] bg-red-500" />
        )}
      </>
    )}
  </NavLink>
);
