import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fetchManufacturerDetail, type ManufacturerDetail } from '@/lib/lookupService';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';
import { PublicCardTile } from './PublicCardTile';
import { useBreadcrumbs, type Breadcrumb } from './BreadcrumbContext';

export const PublicManufacturerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [manufacturer, setManufacturer] = useState<ManufacturerDetail | null>(null);
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { setBreadcrumbs, clearBreadcrumbs } = useBreadcrumbs();

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

  useEffect(() => {
    if (!manufacturer) return;
    const crumbs: Breadcrumb[] = [
      { label: 'Manufacturers', to: '/manufacturers' },
      { label: manufacturer.name },
    ];
    setBreadcrumbs(crumbs);
    return () => clearBreadcrumbs();
  }, [manufacturer, setBreadcrumbs, clearBreadcrumbs]);

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
