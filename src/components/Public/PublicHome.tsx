import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';
import { fetchAirlinesBrowse, fetchManufacturersBrowse, type AirlineBrowse, type ManufacturerBrowse } from '@/lib/lookupService';
import { PublicCardTile } from './PublicCardTile';
import { countryToFlag } from '@/lib/countryFlags';

function AutoSizeText({ className, children }: { className?: string; children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [fontSize, setFontSize] = useState(16);

  const fit = useCallback(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const pad = 20;
    const maxH = container.offsetHeight - pad * 2;
    if (maxH <= 0) return;

    let lo = 8;
    let hi = 80;
    let best = lo;

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      text.style.fontSize = `${mid}px`;
      text.style.lineHeight = '1.35';

      if (text.scrollHeight <= maxH) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    setFontSize(best);
  }, []);

  useEffect(() => {
    fit();
    const ro = new ResizeObserver(fit);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [fit, children]);

  return (
    <div ref={containerRef} className={`${className ?? ''} relative overflow-hidden h-full`}>
      <p
        ref={textRef}
        style={{ fontSize: `${fontSize}px`, lineHeight: '1.35', padding: 20 }}
      >
        {children}
      </p>
    </div>
  );
}

const TICK_MS = 3000;
const DISSOLVE_MS = 400;

function useTicker(length: number, delayMs = 0) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (length === 0) return;
    let intervalId: ReturnType<typeof setInterval>;
    const advance = () => setIndex((i) => (i + 1) % length);
    const timeoutId = setTimeout(() => {
      advance();
      intervalId = setInterval(advance, TICK_MS);
    }, delayMs);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [length, delayMs]);
  return index;
}

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => { ref.current = value; });
  return ref.current;
}

function CrossfadeShell({ itemKey, children }: { itemKey: string; children: React.ReactNode }) {
  const [layers, setLayers] = useState<Array<{ key: string; content: React.ReactNode }>>([]);
  const prevKey = usePrevious(itemKey);

  useEffect(() => {
    setLayers((prev) => {
      const next = prev.filter((l) => l.key !== itemKey);
      next.push({ key: itemKey, content: children });
      return next;
    });

    if (prevKey && prevKey !== itemKey) {
      const timer = setTimeout(() => {
        setLayers((prev) => prev.filter((l) => l.key !== prevKey));
      }, DISSOLVE_MS);
      return () => clearTimeout(timer);
    }
  }, [itemKey, children, prevKey]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {layers.map((layer) => (
        <div
          key={layer.key}
          className="absolute inset-0 flex items-center justify-center"
          style={{
            animation: layer.key === itemKey
              ? `dissolveIn ${DISSOLVE_MS}ms ease-in-out forwards`
              : `dissolveOut ${DISSOLVE_MS}ms ease-in-out forwards`,
          }}
        >
          <div className="w-2/3 h-2/3 flex items-center justify-center">
            {layer.content}
          </div>
        </div>
      ))}
    </div>
  );
}

function AirlineLogoTicker({ airlines, delayMs = 0 }: { airlines: AirlineBrowse[]; delayMs?: number }) {
  const withLogos = useMemo(() => airlines.filter((a) => a.logo_url), [airlines]);
  const index = useTicker(withLogos.length, delayMs);
  if (withLogos.length === 0) return null;
  const current = withLogos[index];
  return (
    <CrossfadeShell itemKey={current.id}>
      <img src={current.logo_url!} alt={current.name} className="w-full h-full object-contain" />
    </CrossfadeShell>
  );
}

function CardThumbnailTicker({ cards, delayMs = 0 }: { cards: CardSummary[]; delayMs?: number }) {
  const withThumbs = useMemo(() => cards.filter((c) => c.thumbnail_url), [cards]);
  const index = useTicker(withThumbs.length, delayMs);
  if (withThumbs.length === 0) return null;
  const current = withThumbs[index];
  return (
    <CrossfadeShell itemKey={current.id}>
      <img src={current.thumbnail_url!} alt={current.title ?? 'Card'} className="w-full h-full object-contain" />
    </CrossfadeShell>
  );
}

function CountryFlagTicker({ countries, delayMs = 0 }: { countries: string[]; delayMs?: number }) {
  const index = useTicker(countries.length, delayMs);
  if (countries.length === 0) return null;
  const current = countries[index];
  return (
    <CrossfadeShell itemKey={current}>
      <span className="text-8xl leading-none">{countryToFlag(current)}</span>
    </CrossfadeShell>
  );
}

function ManufacturerLogoTicker({ manufacturers, delayMs = 0 }: { manufacturers: ManufacturerBrowse[]; delayMs?: number }) {
  const withLogos = useMemo(() => manufacturers.filter((m) => m.logo_url), [manufacturers]);
  const index = useTicker(withLogos.length, delayMs);
  if (withLogos.length === 0) return null;
  const current = withLogos[index];
  return (
    <CrossfadeShell itemKey={current.id}>
      <img src={current.logo_url!} alt={current.name} className="w-full h-full object-contain" />
    </CrossfadeShell>
  );
}

function DecadeTicker({ years, delayMs = 0 }: { years: number[]; delayMs?: number }) {
  const decades = useMemo(() => {
    const set = new Set(years.map((y) => Math.floor(y / 10) * 10));
    return [...set].sort();
  }, [years]);
  const [randomOrder, setRandomOrder] = useState<number[]>([]);
  useEffect(() => {
    if (decades.length === 0) return;
    const shuffled = [...decades].sort(() => Math.random() - 0.5);
    setRandomOrder(shuffled);
  }, [decades]);
  const index = useTicker(randomOrder.length, delayMs);
  if (randomOrder.length === 0) return null;
  const decade = randomOrder[index];
  const label = `'${String(decade).slice(-2)}s`;
  return (
    <CrossfadeShell itemKey={String(decade)}>
      <span className="text-7xl md:text-8xl font-bold tracking-tight text-black/20">{label}</span>
    </CrossfadeShell>
  );
}

export const PublicHome: React.FC = () => {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [allAirlines, setAllAirlines] = useState<AirlineBrowse[]>([]);
  const [allManufacturers, setAllManufacturers] = useState<ManufacturerBrowse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchCards(),
      fetchAirlinesBrowse(),
      fetchManufacturersBrowse(),
    ]).then(([c, a, m]) => {
      setCards(c);
      const airlinesWithCards = a.filter((x) => x.card_count > 0);
      const manufacturersWithCards = m.filter((x) => x.card_count > 0);
      setAllAirlines(airlinesWithCards);
      setAllManufacturers(manufacturersWithCards);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const recentCards = cards.slice(0, 30);

  const cardCount = cards.length;
  const years = cards.map((c) => c.published_year).filter((y): y is number => y != null);
  const minYear = years.length > 0 ? Math.min(...years) : null;
  const maxYear = years.length > 0 ? Math.max(...years) : null;
  const yearSpan = minYear && maxYear ? maxYear - minYear : null;
  const airlineCount = allAirlines.length;
  const countries = [...new Set(allAirlines.map((a) => a.country).filter((c): c is string => !!c))];
  const countryCount = countries.length;

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-background">
      {/* Recent Additions */}
      {recentCards.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pt-12 pb-0 relative min-h-dvh">
          <div
            className="fixed overflow-hidden"
            style={{ left: '50%', right: '50%', marginLeft: '-66vw', marginRight: '-66vw', top: '-6rem', bottom: '-6rem' }}
          >
            <div className="marquee-scroll grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-3">
              {Array.from({ length: 10 }, () => recentCards).flat().map((card, i) => (
                <PublicCardTile key={`${card.id}-${i}`} card={card} />
              ))}
            </div>
          </div>
          <div className="fixed inset-0 bg-white/50 backdrop-blur-[2px] pointer-events-none" style={{ zIndex: 5 }} />
          <div className="relative z-10 grid grid-cols-2 sm:grid-cols-6 md:grid-cols-8 md:grid-rows-[repeat(5,1fr)] gap-3 auto-rows-auto md:auto-rows-fr pointer-events-none">
            <AutoSizeText className="col-span-2 row-start-1 sm:col-span-4 md:col-span-4 md:col-start-1 md:row-start-1 md:row-span-2 bg-white/70 backdrop-blur-xl rounded-lg border border-gray-200 pointer-events-auto">
              <span className="text-black font-medium">
                Seatback Safety is <a href="https://www.lassor.com" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline">Lassor Feasley's</a>
                {' '}personal collection of airline seatback safety procedure cards.
                The artifacts document the intersection of aviation, graphic design, and mass media.
              </span>
            </AutoSizeText>
            <div className="col-span-2 row-start-4 sm:col-span-3 md:col-start-6 md:row-start-3 md:row-span-1 bg-white/70 backdrop-blur-xl rounded-lg border border-gray-200 relative overflow-hidden h-full flex items-center p-5 pointer-events-auto">
              <p className="text-black text-sm leading-relaxed">
                Lassor designed, developed, and maintains this digital showcase, which features a museum-grade database archive.
                He also personally acquires, documents, files, and maintains the specimens in his personal archive.
              </p>
            </div>
            <Link
              to="/airlines"
              className="col-start-2 row-start-2 md:col-start-6 md:row-start-1 group relative pointer-events-auto
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="aspect-square w-full bg-white/70 backdrop-blur-xl rounded-lg border border-gray-200 relative overflow-visible transition-all duration-150 group-hover:scale-[1.02] group-hover:bg-white/80">
                <div className="absolute inset-0 overflow-hidden">
                  <AirlineLogoTicker airlines={allAirlines} delayMs={0} />
                </div>
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-3 px-4 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/20 text-[11px] font-semibold text-white tracking-wide whitespace-nowrap z-10">
                  {airlineCount} Airlines
                </span>
              </div>
            </Link>
            <Link
              to="/search"
              className="col-start-1 row-start-3 md:col-start-3 md:row-start-4 group relative pointer-events-auto
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="aspect-square w-full bg-white/70 backdrop-blur-xl rounded-lg border border-gray-200 relative overflow-visible transition-all duration-150 group-hover:scale-[1.02] group-hover:bg-white/80">
                <div className="absolute inset-0 overflow-hidden">
                  <CardThumbnailTicker cards={cards} delayMs={1200} />
                </div>
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-3 px-4 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/20 text-[11px] font-semibold text-white tracking-wide whitespace-nowrap z-10">
                  {cardCount} Cards
                </span>
              </div>
            </Link>
            <Link
              to="/decades"
              className="col-start-2 row-start-5 md:col-start-8 md:row-start-2 group relative pointer-events-auto
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="aspect-square w-full bg-white/70 backdrop-blur-xl rounded-lg border border-gray-200 relative overflow-visible transition-all duration-150 group-hover:scale-[1.02] group-hover:bg-white/80">
                <div className="absolute inset-0 overflow-hidden">
                  <DecadeTicker years={years} delayMs={600} />
                </div>
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-3 px-4 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/20 text-[11px] font-semibold text-white tracking-wide whitespace-nowrap z-10">
                  {yearSpan ?? 0} Years
                </span>
              </div>
            </Link>
            <Link
              to="/countries"
              className="col-start-1 row-start-6 md:col-start-5 md:row-start-4 group relative pointer-events-auto
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="aspect-square w-full bg-white/70 backdrop-blur-xl rounded-lg border border-gray-200 relative overflow-visible transition-all duration-150 group-hover:scale-[1.02] group-hover:bg-white/80">
                <div className="absolute inset-0 overflow-hidden">
                  <CountryFlagTicker countries={countries} delayMs={1800} />
                </div>
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-3 px-4 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/20 text-[11px] font-semibold text-white tracking-wide whitespace-nowrap z-10">
                  {countryCount} Countries
                </span>
              </div>
            </Link>
            <Link
              to="/manufacturers"
              className="col-start-2 row-start-7 md:col-start-6 md:row-start-5 group relative pointer-events-auto
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="aspect-square w-full bg-white/70 backdrop-blur-xl rounded-lg border border-gray-200 relative overflow-visible transition-all duration-150 group-hover:scale-[1.02] group-hover:bg-white/80">
                <div className="absolute inset-0 overflow-hidden">
                  <ManufacturerLogoTicker manufacturers={allManufacturers} delayMs={2400} />
                </div>
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-3 px-4 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/20 text-[11px] font-semibold text-white tracking-wide whitespace-nowrap z-10">
                  {allManufacturers.length} Makes
                </span>
              </div>
            </Link>
            <div className="col-span-2 md:hidden" aria-hidden="true">&nbsp;</div>
          </div>
        </section>
      )}
    </div>
  );
};
