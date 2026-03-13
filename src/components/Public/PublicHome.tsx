import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowRight } from 'lucide-react';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';
import { fetchAirlinesBrowse, fetchManufacturersBrowse, fetchCollectionStats, type AirlineBrowse, type ManufacturerBrowse, type CollectionStats } from '@/lib/lookupService';
import { PublicCardTile } from './PublicCardTile';
import { CardCarousel } from './CardCarousel';

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

export const PublicHome: React.FC = () => {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [airlines, setAirlines] = useState<AirlineBrowse[]>([]);
  const [allAirlines, setAllAirlines] = useState<AirlineBrowse[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerBrowse[]>([]);
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchCards(),
      fetchAirlinesBrowse(),
      fetchManufacturersBrowse(),
      fetchCollectionStats(),
    ]).then(([c, a, m, s]) => {
      setCards(c);
      const airlinesWithCards = a.filter((x) => x.card_count > 0);
      setAllAirlines(airlinesWithCards);
      setAirlines(airlinesWithCards.slice(0, 8));
      setManufacturers(m.filter((x) => x.card_count > 0).slice(0, 8));
      setStats(s);
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

  const recentCards = cards.slice(0, 5);

  const cardCount = cards.length;
  const years = cards.map((c) => c.published_year).filter((y): y is number => y != null);
  const minYear = years.length > 0 ? Math.min(...years) : null;
  const maxYear = years.length > 0 ? Math.max(...years) : null;
  const yearSpan = minYear && maxYear ? maxYear - minYear : null;
  const airlineCount = allAirlines.length;
  const countryCount = new Set(allAirlines.map((a) => a.country).filter(Boolean)).size;

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-background">
      {/* Collection Description */}
      {stats && (stats.totalCards > 0 || stats.totalCountries > 0) && (
        <section className="max-w-6xl mx-auto px-6 pt-12 pb-4">
          <p className="text-base text-muted-foreground leading-relaxed">
            A curated collection of{' '}
            <span className="text-foreground font-medium">{stats.totalCards.toLocaleString()}</span>{' '}
            airline seatback safety cards from{' '}
            <span className="text-foreground font-medium">{stats.totalAirlines.toLocaleString()}</span>{' '}
            airline{stats.totalAirlines !== 1 ? 's' : ''}
            {stats.totalCountries > 0 && (
              <> representing{' '}
                <span className="text-foreground font-medium">{stats.totalCountries.toLocaleString()}</span>{' '}
                {stats.totalCountries === 1 ? 'country' : 'countries'}
              </>
            )}
            , spanning decades of aviation history.
          </p>
        </section>
      )}

      {/* Recent Additions */}
      {recentCards.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pt-12 pb-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
            <AutoSizeText className="col-span-2 sm:col-span-2 md:col-span-3 aspect-square md:aspect-auto bg-[#ebeaef]">
              <span className="text-foreground/70 font-medium">
                Seatback Safety is <a href="https://www.lassor.com" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline">Lassor Feasley's</a>
                {' '}personal collection of airline seatback safety procedure cards.
                The collection spans{yearSpan ? ` ${yearSpan} years` : ''}, {cardCount} examples, {airlineCount} airlines, and {countryCount} countries.
                The artifacts document the intersection of aviation, graphic design, and mass media.
              </span>
              {' '}
              <span className="text-muted-foreground">
                Lassor designed, developed, and maintains this digital showcase, which features a museum-grade database archive.
                He also personally acquires, documents, files, and maintains the specimens in his personal archive.
              </span>
            </AutoSizeText>
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
