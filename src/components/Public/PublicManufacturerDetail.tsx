import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { fetchManufacturerDetail, type ManufacturerDetail } from '@/lib/lookupService';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';
import { PublicCardTile } from './PublicCardTile';

export const PublicManufacturerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [manufacturer, setManufacturer] = useState<ManufacturerDetail | null>(null);
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetchManufacturerDetail(id),
      fetchCards(),
    ]).then(([m, allCards]) => {
      setManufacturer(m);
      if (m) {
        setCards(allCards.filter((c) =>
          c.aircraft_label?.toLowerCase().includes(m.name.toLowerCase())
        ));
      }
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

  if (!manufacturer) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <p className="text-muted-foreground">Manufacturer not found.</p>
        <Link to="/manufacturers" className="text-sm text-primary mt-4 inline-block hover:underline">
          Back to Manufacturers
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <Link
        to="/manufacturers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground
                   transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Manufacturers
      </Link>

      <div className="flex items-center gap-4 mb-8">
        {manufacturer.logo_url && (
          <div className="h-14 w-14 bg-muted/60 flex items-center justify-center
                          overflow-hidden flex-shrink-0">
            <img src={manufacturer.logo_url} alt={manufacturer.name}
                 className="h-full w-full object-contain" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{manufacturer.name}</h1>
          <p className="text-sm text-muted-foreground">
            {manufacturer.country || 'Manufacturer'}
          </p>
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">
          No cards for this manufacturer yet.
        </p>
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
