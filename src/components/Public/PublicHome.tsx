import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowRight } from 'lucide-react';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';
import { fetchAirlinesBrowse, fetchManufacturersBrowse, type AirlineBrowse, type ManufacturerBrowse } from '@/lib/lookupService';
import { PublicCardTile } from './PublicCardTile';
import { CardCarousel } from './CardCarousel';

export const PublicHome: React.FC = () => {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [airlines, setAirlines] = useState<AirlineBrowse[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerBrowse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchCards(),
      fetchAirlinesBrowse(),
      fetchManufacturersBrowse(),
    ]).then(([c, a, m]) => {
      setCards(c);
      setAirlines(a.filter((x) => x.card_count > 0).slice(0, 8));
      setManufacturers(m.filter((x) => x.card_count > 0).slice(0, 8));
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

  const recentCards = cards.slice(0, 8);

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-background">
      {/* Hero Carousel */}
      <CardCarousel />

      {/* Recent Additions */}
      {recentCards.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold tracking-tight">Recent Additions</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
            {recentCards.map((card) => (
              <PublicCardTile key={card.id} card={card} />
            ))}
          </div>
        </section>
      )}

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
