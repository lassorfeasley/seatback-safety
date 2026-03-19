import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, X, ChevronDown, Info, Search } from 'lucide-react';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';
import {
  fetchManufacturersBrowse, fetchModelsBrowse, fetchVariantsBrowse,
  fetchAirlinesBrowse, fetchDistinctLanguageCount,
  type ManufacturerBrowse, type ModelBrowse, type VariantBrowse,
  type AirlineBrowse,
} from '@/lib/lookupService';

const TILE_SIZE = 140;
const GAP = 8;
const CELL = TILE_SIZE + GAP;
const BUFFER = 3;
const MAX_SPEED = 350;
const DEAD_ZONE = 0.08;
const LERP_FACTOR = 0.04;
const SEARCH_COLS_MAX = 5;

function hashCoord(row: number, col: number): number {
  let h = ((row * 2654435761) ^ (col * 2246822519)) >>> 0;
  h = ((h >> 16) ^ h) * 0x45d9f3b >>> 0;
  return h;
}

function InfiniteCardTile({ card }: { card: CardSummary }) {
  const fallbacks = [card.og_url, card.thumbnail_url].filter(Boolean) as string[];
  const [imgSrc, setImgSrc] = useState<string | null>(fallbacks[0] ?? null);
  const fallbackIdx = useRef(0);

  return (
    <Link
      to={`/cards/${card.id}`}
      className="block w-full h-full cursor-[inherit]"
    >
      <div className="w-full h-full bg-[#ebeaef] relative overflow-hidden">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={card.title || 'Safety card'}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={() => {
              fallbackIdx.current += 1;
              if (fallbackIdx.current < fallbacks.length) {
                setImgSrc(fallbacks[fallbackIdx.current]);
              } else {
                setImgSrc(null);
              }
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
            No image
          </div>
        )}
      </div>
    </Link>
  );
}

function computeSearchCols(): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  return Math.min(SEARCH_COLS_MAX, Math.max(2, Math.floor((vw - 40) / CELL)));
}

function FilterDropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = query
    ? options.filter((opt) => opt.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center justify-between w-full px-4 py-2.5 text-xs transition-colors ${
          value
            ? 'text-foreground font-medium'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <span className="truncate">{value ? `${label}: ${value}` : label}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 shadow-xl min-w-[160px]">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setOpen(false); setQuery(''); }
                if (e.key === 'Enter' && filtered.length === 1) {
                  onChange(filtered[0]);
                  setOpen(false);
                  setQuery('');
                }
              }}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50 min-w-0"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {value && (
              <button
                onClick={() => { onChange(null); setOpen(false); setQuery(''); }}
                className="block w-full text-left px-4 py-1.5 text-xs text-red-500 hover:bg-gray-50 transition-colors"
              >
                Clear
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-4 py-2 text-xs text-muted-foreground">No matches</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt}
                  onClick={() => { onChange(opt); setOpen(false); setQuery(''); }}
                  className={`block w-full text-left px-4 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
                    value === opt ? 'font-semibold text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {opt}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const PublicHome: React.FC = () => {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'explore' | 'search'>('explore');
  const [showInfo, setShowInfo] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAirline, setFilterAirline] = useState<string | null>(null);
  const [filterDecade, setFilterDecade] = useState<number | null>(null);

  const [manufacturers, setManufacturers] = useState<ManufacturerBrowse[]>([]);
  const [allAirlines, setAllAirlines] = useState<AirlineBrowse[]>([]);
  const [languageCount, setLanguageCount] = useState(0);
  const [models, setModels] = useState<ModelBrowse[]>([]);
  const [variants, setVariants] = useState<VariantBrowse[]>([]);
  const [filterMfr, setFilterMfr] = useState<string | null>(null);
  const [filterModel, setFilterModel] = useState<string | null>(null);
  const [filterVariant, setFilterVariant] = useState<string | null>(null);
  const selectedMfr = useMemo(() => manufacturers.find((m) => m.name === filterMfr) ?? null, [manufacturers, filterMfr]);
  const selectedModel = useMemo(() => models.find((m) => m.name === filterModel) ?? null, [models, filterModel]);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const targetVelocityRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const modeRef = useRef<'explore' | 'search'>('explore');
  const isTouchDevice = useRef(false);
  const touchDragRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const transitioningRef = useRef(false);
  const autoPanRef = useRef(true);

  const [exploreTiles, setExploreTiles] = useState<{ row: number; col: number; x: number; y: number; cardIdx: number }[]>([]);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    Promise.all([fetchCards(), fetchManufacturersBrowse(), fetchAirlinesBrowse(), fetchDistinctLanguageCount()]).then(([c, m, a, lc]) => {
      setCards(c);
      setManufacturers(m.filter((x) => x.card_count > 0));
      setAllAirlines(a.filter((x) => x.card_count > 0));
      setLanguageCount(lc);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedMfr) { setModels([]); return; }
    fetchModelsBrowse(selectedMfr.id).then((m) => setModels(m.filter((x) => x.card_count > 0)));
  }, [selectedMfr]);

  useEffect(() => {
    if (!selectedModel) { setVariants([]); return; }
    fetchVariantsBrowse(selectedModel.id).then((v) => setVariants(v.filter((x) => x.card_count > 0)));
  }, [selectedModel]);

  useEffect(() => {
    isTouchDevice.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }, []);

  useEffect(() => {
    targetVelocityRef.current = { x: 40, y: -25 };
  }, []);

  const applyFilters = useCallback((excludeFilter?: string) => {
    return cards.filter((c) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const haystack = [c.title, c.airline_name, c.aircraft_label, c.published_year != null ? String(c.published_year) : null]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (excludeFilter !== 'airline' && filterAirline && c.airline_name !== filterAirline) return false;

      if (excludeFilter !== 'aircraft') {
        if (filterMfr || filterModel || filterVariant) {
          const label = (c.aircraft_label ?? '').toLowerCase();
          if (filterVariant && !label.includes(filterVariant.toLowerCase())) return false;
          else if (filterModel && !label.includes(filterModel.toLowerCase())) return false;
          else if (filterMfr && !label.includes(filterMfr.toLowerCase())) return false;
        }
      }

      if (excludeFilter !== 'decade' && filterDecade) {
        if (!c.published_year) return false;
        if (c.published_year < filterDecade || c.published_year >= filterDecade + 10) return false;
      }
      return true;
    });
  }, [cards, searchQuery, filterAirline, filterMfr, filterModel, filterVariant, filterDecade]);

  const filteredCards = useMemo(() => applyFilters(), [applyFilters]);

  const airlines = useMemo(() => {
    const pool = applyFilters('airline');
    return [...new Set(pool.map((c) => c.airline_name).filter(Boolean) as string[])].sort();
  }, [applyFilters]);

  const availableMfrNames = useMemo(() => {
    const pool = applyFilters('aircraft');
    const names = new Set<string>();
    for (const c of pool) {
      if (!c.aircraft_label) continue;
      for (const m of manufacturers) {
        if (c.aircraft_label.toLowerCase().includes(m.name.toLowerCase())) names.add(m.name);
      }
    }
    return [...names].sort();
  }, [applyFilters, manufacturers]);

  const mfrNames = useMemo(() => filterMfr ? manufacturers.map((m) => m.name).sort() : availableMfrNames, [filterMfr, manufacturers, availableMfrNames]);
  const modelNames = useMemo(() => models.map((m) => m.name).sort(), [models]);
  const variantNames = useMemo(() => variants.map((v) => v.name).sort(), [variants]);

  const availableDecades = useMemo(() => {
    const pool = applyFilters('decade');
    const decades = new Set<number>();
    for (const c of pool) {
      if (c.published_year) decades.add(Math.floor(c.published_year / 10) * 10);
    }
    return [...decades].sort();
  }, [applyFilters]);

  const hasActiveFilters = filterAirline || filterMfr || filterModel || filterVariant || filterDecade;

  const computeVisible = useCallback((cx: number, cy: number, cardCount: number) => {
    if (cardCount === 0) return [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const startCol = Math.floor(cx / CELL) - BUFFER;
    const endCol = Math.ceil((cx + vw) / CELL) + BUFFER;
    const startRow = Math.floor(cy / CELL) - BUFFER;
    const endRow = Math.ceil((cy + vh) / CELL) + BUFFER;

    const tiles: { row: number; col: number; x: number; y: number; cardIdx: number }[] = [];
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        tiles.push({
          row: r,
          col: c,
          x: c * CELL - cx,
          y: r * CELL - cy,
          cardIdx: hashCoord(r, c) % cardCount,
        });
      }
    }
    return tiles;
  }, []);

  useEffect(() => {
    if (cards.length === 0) return;
    const cam = cameraRef.current;
    cam.x = -(window.innerWidth / 2) / CELL * CELL;
    cam.y = -(window.innerHeight / 2) / CELL * CELL;
    setExploreTiles(computeVisible(cam.x, cam.y, cards.length));
  }, [cards, computeVisible]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isTouchDevice.current) return;
    if (modeRef.current !== 'explore') return;
    autoPanRef.current = false;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let dx = (e.clientX - vw / 2) / (vw / 2);
    let dy = (e.clientY - vh / 2) / (vh / 2);

    dx = Math.abs(dx) < DEAD_ZONE ? 0 : dx;
    dy = Math.abs(dy) < DEAD_ZONE ? 0 : dy;

    targetVelocityRef.current = { x: dx * MAX_SPEED, y: dy * MAX_SPEED };
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (isTouchDevice.current) return;
    targetVelocityRef.current = { x: 0, y: 0 };
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    document.documentElement.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseLeave]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (modeRef.current !== 'explore') return;
    autoPanRef.current = false;
    const t = e.touches[0];
    touchDragRef.current = { lastX: t.clientX, lastY: t.clientY };
    targetVelocityRef.current = { x: 0, y: 0 };
    velocityRef.current = { x: 0, y: 0 };
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!touchDragRef.current || modeRef.current !== 'explore') return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - touchDragRef.current.lastX;
    const dy = t.clientY - touchDragRef.current.lastY;
    touchDragRef.current = { lastX: t.clientX, lastY: t.clientY };
    cameraRef.current.x -= dx;
    cameraRef.current.y -= dy;
    setExploreTiles(computeVisible(cameraRef.current.x, cameraRef.current.y, cards.length));
  }, [cards.length, computeVisible]);

  const handleTouchEnd = useCallback(() => {
    touchDragRef.current = null;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  useEffect(() => {
    if (cards.length === 0) return;
    const cardCount = cards.length;

    const tick = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;

      if (modeRef.current === 'explore' && !transitioningRef.current) {
        if (isTouchDevice.current && !autoPanRef.current) {
          setExploreTiles(computeVisible(cameraRef.current.x, cameraRef.current.y, cardCount));
        } else {
          const vel = velocityRef.current;
          const target = targetVelocityRef.current;
          vel.x += (target.x - vel.x) * LERP_FACTOR;
          vel.y += (target.y - vel.y) * LERP_FACTOR;

          const cam = cameraRef.current;
          cam.x += vel.x * dt;
          cam.y += vel.y * dt;

          setExploreTiles(computeVisible(cam.x, cam.y, cardCount));
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cards, computeVisible]);

  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setFilterAirline(null);
    setFilterMfr(null);
    setFilterModel(null);
    setFilterVariant(null);
    setFilterDecade(null);
  }, []);

  const enterSearchMode = useCallback(() => {
    setMode('search');
    clearAllFilters();
    targetVelocityRef.current = { x: 0, y: 0 };
    velocityRef.current = { x: 0, y: 0 };
    transitioningRef.current = true;
    setTimeout(() => {
      transitioningRef.current = false;
      searchInputRef.current?.focus();
    }, 600);
  }, [clearAllFilters]);

  const exitSearchMode = useCallback(() => {
    setMode('explore');
    clearAllFilters();
    transitioningRef.current = true;
    setTimeout(() => {
      transitioningRef.current = false;
    }, 600);
  }, [clearAllFilters]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') exitSearchMode();
  }, [exitSearchMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showInfo) setShowInfo(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showInfo]);

  const filteredSet = useMemo(() => new Set(filteredCards.map((c) => c.id)), [filteredCards]);

  const dissolveDurationsRef = useRef(new Map<string, number>());
  const dissolvingRef = useRef(new Set<string>());
  const enteringRef = useRef(new Set<string>());
  const prevFilteredRef = useRef<Set<string>>(new Set());
  const dissolveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [animTick, setAnimTick] = useState(0);

  useEffect(() => {
    const prev = prevFilteredRef.current;
    const curr = filteredSet;
    const changed = prev.size !== curr.size || [...curr].some((id) => !prev.has(id));
    if (!changed) return;

    const newlyHidden: string[] = [];
    for (const id of prev) {
      if (!curr.has(id)) newlyHidden.push(id);
    }
    const newlyVisible: string[] = [];
    for (const id of curr) {
      if (!prev.has(id)) newlyVisible.push(id);
      dissolvingRef.current.delete(id);
      dissolveDurationsRef.current.delete(id);
      const t = dissolveTimersRef.current.get(id);
      if (t) { clearTimeout(t); dissolveTimersRef.current.delete(id); }
    }

    if (newlyHidden.length > 0) {
      for (const id of newlyHidden) {
        const dur = 500 + Math.random() * 2500;
        dissolveDurationsRef.current.set(id, dur);
        dissolvingRef.current.add(id);
        const timer = setTimeout(() => {
          dissolvingRef.current.delete(id);
          dissolveDurationsRef.current.delete(id);
          dissolveTimersRef.current.delete(id);
          setAnimTick((g) => g + 1);
        }, dur + 50);
        dissolveTimersRef.current.set(id, timer);
      }
    }

    if (newlyVisible.length > 0 && prev.size > 0) {
      for (const id of newlyVisible) enteringRef.current.add(id);
      setAnimTick((g) => g + 1);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          enteringRef.current.clear();
          setAnimTick((g) => g + 1);
        });
      });
    }

    prevFilteredRef.current = new Set(curr);
  }, [filteredSet]);

  const isSearch = mode === 'search';
  const cols = computeSearchCols();

  const cardColumns = useMemo(() => {
    const colMap = new Map<string, number>();
    for (let i = 0; i < cards.length; i++) {
      colMap.set(cards[i].id, i % cols);
    }
    return colMap;
  }, [cards, cols]);

  const tilePositions = useMemo(() => {
    const colCounters = new Array(cols).fill(0);
    const positions = new Map<string, { col: number; row: number }>();
    const visibleOrDissolving = new Set([...filteredSet, ...dissolvingRef.current]);

    for (const card of cards) {
      if (!visibleOrDissolving.has(card.id)) continue;
      const c = cardColumns.get(card.id)!;
      positions.set(card.id, { col: c, row: colCounters[c] });
      colCounters[c]++;
    }
    return { positions, maxRow: Math.max(...colCounters, 0) };
  }, [cards, filteredSet, cols, animTick, cardColumns]);

  const lastPositionsRef = useRef(new Map<string, { col: number; row: number }>());

  useEffect(() => {
    for (const [id, pos] of tilePositions.positions) {
      lastPositionsRef.current.set(id, pos);
    }
  }, [tilePositions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {!isSearch && (
        <div
          ref={containerRef}
          className="fixed inset-0 overflow-hidden bg-background"
          style={{ cursor: 'crosshair' }}
        >
          {exploreTiles.map((tile) => {
            return (
              <div
                key={`${tile.row},${tile.col}`}
                className="absolute"
                style={{
                  transform: `translate(${tile.x}px, ${tile.y}px)`,
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  willChange: 'transform',
                }}
              >
                <InfiniteCardTile card={cards[tile.cardIdx]} />
              </div>
            );
          })}
        </div>
      )}

      {isSearch && (
        <div className="fixed inset-0 overflow-y-auto bg-background">
          <button
            onClick={exitSearchMode}
            className="fixed z-50 bg-black/70 hover:bg-black/90 text-white px-3.5 py-3 sm:px-2.5 sm:py-2 transition-colors backdrop-blur-md border-b border-white/20"
            style={{ top: 'calc(0.5rem + env(safe-area-inset-top, 0px))', right: 'calc(0.5rem + env(safe-area-inset-right, 0px))' }}
            aria-label="Close search"
          >
            <X className="h-6 w-6 sm:h-4 sm:w-4" />
          </button>
          <div className="sticky top-0 z-10" style={{ overflow: 'visible' }}>
            <div className="h-[75px]" />
            <div
              className="mx-auto backdrop-blur-xl relative outline outline-2 outline-white"
              style={{ width: cols * CELL - GAP, backgroundColor: '#ebeaef' }}
            >
              <div className="flex items-center gap-2 pt-4 pb-3 px-5">
                <Search className="h-4 w-4 opacity-40 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search by title, airline, aircraft..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                />
                {(searchQuery || hasActiveFilters) && (
                  <button
                    onClick={clearAllFilters}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="w-full h-px bg-white/60" />

              <div className="flex flex-col sm:flex-row sm:items-center">
                <FilterDropdown
                  label="Airline"
                  options={airlines}
                  value={filterAirline}
                  onChange={setFilterAirline}
                />

                <div className="h-px w-full sm:h-auto sm:w-px sm:self-stretch bg-white/60" />

                <FilterDropdown
                  label="Manufacturer"
                  options={mfrNames}
                  value={filterMfr}
                  onChange={(v) => {
                    setFilterMfr(v);
                    setFilterModel(null);
                    setFilterVariant(null);
                  }}
                />

                {filterMfr && modelNames.length > 0 && (
                  <>
                    <div className="h-px w-full sm:h-auto sm:w-px sm:self-stretch bg-white/60" />
                    <FilterDropdown
                      label="Model"
                      options={modelNames}
                      value={filterModel}
                      onChange={(v) => {
                        setFilterModel(v);
                        setFilterVariant(null);
                      }}
                    />
                  </>
                )}

                {filterModel && variantNames.length > 0 && (
                  <>
                    <div className="h-px w-full sm:h-auto sm:w-px sm:self-stretch bg-white/60" />
                    <FilterDropdown
                      label="Variant"
                      options={variantNames}
                      value={filterVariant}
                      onChange={setFilterVariant}
                    />
                  </>
                )}

                <div className="h-px w-full sm:h-auto sm:w-px sm:self-stretch bg-white/60" />

                <FilterDropdown
                  label="Decade"
                  options={availableDecades.map((d) => `${d}s`)}
                  value={filterDecade ? `${filterDecade}s` : null}
                  onChange={(v) => {
                    setFilterDecade(v ? parseInt(v) : null);
                  }}
                />
              </div>
            </div>
          </div>

          <div className="py-6">
            {filteredCards.length > 0 || (searchQuery.trim() === '' && !hasActiveFilters) ? (
              <div
                className="mx-auto relative"
                style={{
                  width: cols * CELL - GAP,
                  height: tilePositions.maxRow * CELL + TILE_SIZE,
                  transition: 'height 500ms cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                {cards.map((card) => {
                  const match = filteredSet.has(card.id);
                  const isDissolving = dissolvingRef.current.has(card.id);
                  const isEntering = enteringRef.current.has(card.id);
                  const pos = tilePositions.positions.get(card.id)
                    || (isDissolving ? lastPositionsRef.current.get(card.id) : undefined);

                  if (!pos) return null;
                  if (!match && !isDissolving) return null;

                  const x = pos.col * CELL;
                  const targetY = pos.row * CELL;
                  const enterFromY = (tilePositions.maxRow + 2) * CELL;
                  const y = isEntering ? enterFromY : targetY;
                  const dissolveDur = dissolveDurationsRef.current.get(card.id) ?? 500;

                  return (
                    <div
                      key={card.id}
                      style={{
                        position: 'absolute',
                        left: x,
                        width: TILE_SIZE,
                        height: TILE_SIZE,
                        transform: `translateY(${y}px)`,
                        opacity: (match && !isDissolving && !isEntering) ? 1 : 0,
                        transition: isDissolving
                          ? `opacity ${dissolveDur}ms cubic-bezier(0.4,0,0.2,1)`
                          : isEntering
                            ? 'none'
                            : 'transform 600ms cubic-bezier(0.4,0,0.2,1), opacity 400ms cubic-bezier(0.4,0,0.2,1)',
                        pointerEvents: match ? 'auto' : 'none',
                      }}
                    >
                      <InfiniteCardTile card={card} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <p className="text-muted-foreground text-sm">No cards match your filters.</p>
                <button
                  onClick={clearAllFilters}
                  className="mt-3 text-xs text-foreground underline underline-offset-2 hover:no-underline"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>

          <div className="h-12" />
        </div>
      )}

      {!isSearch && (
        <div
          className="fixed top-2 right-2 z-50 flex"
          style={{ top: 'calc(0.5rem + env(safe-area-inset-top, 0px))', right: 'calc(0.5rem + env(safe-area-inset-right, 0px))' }}
        >
          <button
            onClick={() => setShowInfo((v) => !v)}
            className={`flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 transition-colors border border-black/20 ${
              showInfo
                ? 'bg-black text-white hover:bg-black/90'
                : 'bg-white text-black hover:bg-gray-100'
            }`}
            aria-label="About"
          >
            <Info className="h-6 w-6 sm:h-4 sm:w-4" />
          </button>
          <button
            onClick={enterSearchMode}
            className="flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-white text-black hover:bg-gray-100 transition-colors border border-black/20 border-l-0"
            aria-label="Search"
          >
            <Search className="h-6 w-6 sm:h-4 sm:w-4" />
          </button>
        </div>
      )}

      <a
        href="https://www.lassor.com"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed z-50 bg-red-600 hover:bg-red-700 text-white text-[10px] font-medium tracking-widest px-2 py-1.5 transition-colors"
        style={{ bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))', right: 'calc(1.25rem + env(safe-area-inset-right, 0px))' }}
      >
        developed by lassor
      </a>

      {showInfo && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          onClick={() => setShowInfo(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <button
            onClick={() => setShowInfo(false)}
            className="fixed z-[70] bg-black/70 hover:bg-black/90 text-white px-3.5 py-3 sm:px-2.5 sm:py-2 transition-colors backdrop-blur-md border-b border-white/20"
            style={{ top: 'calc(0.5rem + env(safe-area-inset-top, 0px))', right: 'calc(0.5rem + env(safe-area-inset-right, 0px))' }}
            aria-label="Close"
          >
            <X className="h-6 w-6 sm:h-4 sm:w-4" />
          </button>
          <div
            className="relative max-w-md mx-6 p-5 sm:p-6 shadow-2xl"
            style={{ backgroundColor: '#ebeaef' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-4">
              <p className="text-sm sm:text-base font-medium text-foreground/80 leading-relaxed">
                <span className="font-semibold text-foreground">Seatback Safety</span> is{' '}
                <a href="https://www.lassor.com" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline">
                  Lassor Feasley's
                </a>{' '}
                personal collection of airline seatback safety procedure cards.
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                The artifacts document the intersection of aviation, graphic design, and mass media.
                Lassor designed, developed, and maintains this digital showcase, which features a museum-grade database archive.
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                He also personally acquires, documents, files, and maintains the specimens in his personal archive.
              </p>
              <div className="grid grid-cols-3 gap-x-6 gap-y-2 pt-1">
                {[
                  { value: cards.length, label: 'Cards' },
                  { value: allAirlines.length, label: 'Airlines' },
                  { value: manufacturers.length, label: 'Manufacturers' },
                  { value: new Set(allAirlines.map((a) => a.country).filter(Boolean)).size, label: 'Countries' },
                  { value: languageCount, label: 'Languages' },
                  { value: (() => { const yrs = cards.map((c) => c.published_year).filter((y): y is number => y != null); return yrs.length > 0 ? Math.max(...yrs) - Math.min(...yrs) : 0; })(), label: 'Years span' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">{stat.value}</div>
                    <div className="text-[10px] text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
