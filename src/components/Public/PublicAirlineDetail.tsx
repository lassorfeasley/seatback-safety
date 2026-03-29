import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fetchAirlineDetail, type AirlineDetail } from '@/lib/lookupService';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';
import { PublicCardTile } from './PublicCardTile';
import { useBreadcrumbs, type Breadcrumb } from './BreadcrumbContext';

export const PublicAirlineDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [airline, setAirline] = useState<AirlineDetail | null>(null);
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { setBreadcrumbs, clearBreadcrumbs } = useBreadcrumbs();

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

  useEffect(() => {
    if (!airline) return;
    const crumbs: Breadcrumb[] = [];
    if (airline.countries && airline.countries.length > 0) {
      crumbs.push({ label: 'Countries', to: '/countries' });
      crumbs.push({ label: airline.countries.join(', '), to: `/airlines?q=${encodeURIComponent(airline.countries[0])}` });
    }
    crumbs.push({ label: 'Airlines', to: '/airlines' });
    crumbs.push({ label: airline.name });
    setBreadcrumbs(crumbs);
    return () => clearBreadcrumbs();
  }, [airline, setBreadcrumbs, clearBreadcrumbs]);

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
