import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plane, ArrowRight } from 'lucide-react';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';
import { fetchAirlinesBrowse, fetchManufacturersBrowse, type AirlineBrowse, type ManufacturerBrowse } from '@/lib/lookupService';
import { PublicCardTile } from './PublicCardTile';

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
    <div>
      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-primary/[0.03] to-transparent">
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-6">
            <Plane className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Seatback Safety Cards
          </h1>
          <p className="text-lg text-muted-foreground mt-4 max-w-xl mx-auto">
            A curated collection of airline safety cards spanning decades of aviation history.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {cards.length} cards and counting
          </p>
        </div>
      </section>

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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {airlines.map((airline) => (
              <EntityTile
                key={airline.id}
                to={`/airlines/${airline.id}`}
                name={airline.name}
                logoUrl={airline.logo_url}
                subtitle={`${airline.card_count} card${airline.card_count !== 1 ? 's' : ''}`}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {manufacturers.map((mfr) => (
              <EntityTile
                key={mfr.id}
                to={`/manufacturers/${mfr.id}`}
                name={mfr.name}
                logoUrl={mfr.logo_url}
                subtitle={`${mfr.card_count} card${mfr.card_count !== 1 ? 's' : ''}`}
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
  subtitle: string;
}> = ({ to, name, logoUrl, subtitle }) => (
  <Link
    to={to}
    className="flex items-center gap-3 rounded-lg border p-4 hover:bg-accent/50
               transition-colors group"
  >
    <div className="h-10 w-10 rounded-md bg-muted/60 flex items-center justify-center overflow-hidden flex-shrink-0">
      {logoUrl ? (
        <img src={logoUrl} alt={name} className="h-full w-full object-contain" />
      ) : (
        <span className="text-sm font-bold text-muted-foreground">
          {name.charAt(0)}
        </span>
      )}
    </div>
    <div className="min-w-0">
      <p className="text-sm font-medium truncate group-hover:text-foreground">{name}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  </Link>
);
