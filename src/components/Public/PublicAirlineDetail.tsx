import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { fetchAirlineDetail, type AirlineDetail } from '@/lib/lookupService';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';
import { PublicCardTile } from './PublicCardTile';

export const PublicAirlineDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [airline, setAirline] = useState<AirlineDetail | null>(null);
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetchAirlineDetail(id),
      fetchCards(),
    ]).then(([a, allCards]) => {
      setAirline(a);
      setCards(allCards.filter((c) => c.airline_name === a?.name));
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!airline) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <p className="text-muted-foreground">Airline not found.</p>
        <Link to="/airlines" className="text-sm text-primary mt-4 inline-block hover:underline">
          Back to Airlines
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <Link
        to="/airlines"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground
                   transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Airlines
      </Link>

      <div className="flex items-center gap-4 mb-8">
        {airline.logo_url && (
          <div className="h-14 w-14 bg-muted/60 flex items-center justify-center
                          overflow-hidden flex-shrink-0">
            <img src={airline.logo_url} alt={airline.name}
                 className="h-full w-full object-contain" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{airline.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[airline.country, airline.iata_code ? `IATA: ${airline.iata_code}` : null]
              .filter(Boolean)
              .join(' · ') || 'Airline'}
          </p>
        </div>
      </div>

      {airline.description && (
        <p className="text-sm text-muted-foreground mb-8 max-w-2xl">{airline.description}</p>
      )}

      {cards.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">No cards for this airline yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {cards.map((card) => (
            <PublicCardTile key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
};
