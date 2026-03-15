import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowRight } from 'lucide-react';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';
import { fetchAirlinesBrowse, fetchManufacturersBrowse, type AirlineBrowse, type ManufacturerBrowse } from '@/lib/lookupService';
import { PublicCardTile } from './PublicCardTile';
import { CardCarousel } from './CardCarousel';
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
    <div ref={containerRef} className={`${className ?? ''} relative overflow-hidden`}>
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
          <div className="w-3/4 h-3/4 flex items-center justify-center">
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
      <span className="text-7xl md:text-8xl font-bold tracking-tight text-foreground/20">{label}</span>
    </CrossfadeShell>
  );
}

export const PublicHomeLegacy: React.FC = () => {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [airlines, setAirlines] = useState<AirlineBrowse[]>([]);
  const [allAirlines, setAllAirlines] = useState<AirlineBrowse[]>([]);
  const [allManufacturers, setAllManufacturers] = useState<ManufacturerBrowse[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerBrowse[]>([]);
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
      setAirlines(airlinesWithCards.slice(0, 8));
      setManufacturers(manufacturersWithCards.slice(0, 8));
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

  const recentCards = cards.slice(0, 4);

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
        <section className="max-w-6xl mx-auto px-6 pt-12 pb-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
            <AutoSizeText className="col-span-2 aspect-[2/1] bg-[#ebeaef]">
              <span className="text-foreground/70 font-medium">
                Seatback Safety is <a href="https://www.lassor.com" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline">Lassor Feasley's</a>
                {' '}personal collection of airline seatback safety procedure cards.
                The artifacts document the intersection of aviation, graphic design, and mass media.
              </span>
            </AutoSizeText>
            <AutoSizeText className="col-span-2 aspect-[2/1] bg-[#ebeaef]">
              <span className="text-muted-foreground">
                Lassor designed, developed, and maintains this digital showcase, which features a museum-grade database archive.
                He also personally acquires, documents, files, and maintains the specimens in his personal archive.
              </span>
            </AutoSizeText>
            <Link
              to="/airlines"
              className="group flex flex-col overflow-hidden
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="aspect-square bg-[#ebeaef] relative overflow-hidden">
                <AirlineLogoTicker airlines={allAirlines} delayMs={0} />
                <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-0.5">
                  <span className="text-lg font-bold tracking-tight text-foreground">
                    {airlineCount}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    Airlines
                  </span>
                </div>
              </div>
            </Link>
            <Link
              to="/decades"
              className="group flex flex-col overflow-hidden
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="aspect-square bg-[#ebeaef] relative overflow-hidden">
                <DecadeTicker years={years} delayMs={600} />
                <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-0.5">
                  <span className="text-lg font-bold tracking-tight text-foreground">
                    {yearSpan ?? 0}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    Years
                  </span>
                </div>
              </div>
            </Link>
            <Link
              to="/search"
              className="group flex flex-col overflow-hidden
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="aspect-square bg-[#ebeaef] relative overflow-hidden">
                <CardThumbnailTicker cards={cards} delayMs={1200} />
                <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-0.5">
                  <span className="text-lg font-bold tracking-tight text-foreground">
                    {cardCount}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    Cards
                  </span>
                </div>
              </div>
            </Link>
            <Link
              to="/countries"
              className="group flex flex-col overflow-hidden
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="aspect-square bg-[#ebeaef] relative overflow-hidden">
                <CountryFlagTicker countries={countries} delayMs={1800} />
                <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-0.5">
                  <span className="text-lg font-bold tracking-tight text-foreground">
                    {countryCount}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    Countries
                  </span>
                </div>
              </div>
            </Link>
            <Link
              to="/manufacturers"
              className="group flex flex-col overflow-hidden
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="aspect-square bg-[#ebeaef] relative overflow-hidden">
                <ManufacturerLogoTicker manufacturers={allManufacturers} delayMs={2400} />
                <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-0.5">
                  <span className="text-lg font-bold tracking-tight text-foreground">
                    {allManufacturers.length}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    Manufacturers
                  </span>
                </div>
              </div>
            </Link>
            {recentCards.map((card) => (
              <PublicCardTile key={card.id} card={card} />
            ))}
          </div>
        </section>
      )}

      {/* Hero Carousel */}
      <CardCarousel />

      {/* Featured Airlines */}
      {airlines.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold tracking-tight">Airlines</h2>
            <Link
              to="/airlines"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {airlines.map((airline) => (
              <EntityTile
                key={airline.id}
                to={`/airlines/${airline.id}`}
                name={airline.name}
                logoUrl={airline.logo_url}
              />
            ))}
          </div>
        </section>
      )}

      {/* Featured Manufacturers */}
      {manufacturers.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold tracking-tight">Manufacturers</h2>
            <Link
              to="/manufacturers"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {manufacturers.map((mfr) => (
              <EntityTile
                key={mfr.id}
                to={`/manufacturers/${mfr.id}`}
                name={mfr.name}
                logoUrl={mfr.logo_url}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const EntityTile: React.FC<{
  to: string;
  name: string;
  logoUrl: string | null;
}> = ({ to, name, logoUrl }) => (
  <Link
    to={to}
    className="group flex flex-col overflow-hidden
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
  >
    <div className="aspect-square bg-[#ebeaef] relative overflow-hidden flex items-center justify-center">
      {logoUrl ? (
        <img src={logoUrl} alt={name} className="w-3/4 h-3/4 object-contain" />
      ) : (
        <span className="text-4xl font-bold text-muted-foreground">
          {name.charAt(0)}
        </span>
      )}
    </div>
    <div className="pt-2 px-0.5">
      <p className="text-sm font-medium truncate">{name}</p>
    </div>
  </Link>
);
