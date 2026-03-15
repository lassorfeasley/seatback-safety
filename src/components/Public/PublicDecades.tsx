import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';
import { PublicCardTile } from './PublicCardTile';
import { useBreadcrumbs, type Breadcrumb } from './BreadcrumbContext';

const DECADES = ['1960', '1970', '1980', '1990', '2000', '2010', '2020'];

export const PublicDecadesBrowse: React.FC = () => {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCards().then((data) => {
      setCards(data);
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

  const decadeCounts = DECADES.map((d) => {
    const start = parseInt(d);
    const count = cards.filter(
      (c) => c.published_year != null && c.published_year >= start && c.published_year < start + 10
    ).length;
    return { decade: d, count };
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Decades</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {decadeCounts.map(({ decade, count }) => (
          <Link
            key={decade}
            to={`/decades/${decade}`}
            className="flex flex-col items-center justify-center border p-6
                       hover:bg-accent/50 transition-colors"
          >
            <span className="text-2xl font-bold">{decade}'s</span>
            <span className="text-sm text-muted-foreground mt-1">
              {count} card{count !== 1 ? 's' : ''}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export const PublicDecadeDetail: React.FC = () => {
  const { decade } = useParams<{ decade: string }>();
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { setBreadcrumbs, clearBreadcrumbs } = useBreadcrumbs();

  const start = parseInt(decade ?? '0');
  const end = start + 10;

  useEffect(() => {
    fetchCards().then((data) => {
      setCards(
        data.filter(
          (c) => c.published_year != null && c.published_year >= start && c.published_year < end
        )
      );
      setLoading(false);
    });
  }, [start, end]);

  useEffect(() => {
    if (!decade) return;
    const crumbs: Breadcrumb[] = [
      { label: 'Decades', to: '/decades' },
      { label: `${decade}'s` },
    ];
    setBreadcrumbs(crumbs);
    return () => clearBreadcrumbs();
  }, [decade, setBreadcrumbs, clearBreadcrumbs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {cards.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">No cards from this decade yet.</p>
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
