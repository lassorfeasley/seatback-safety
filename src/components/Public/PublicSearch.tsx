import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';
import { PublicCardTile } from './PublicCardTile';

export const PublicSearch: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [input, setInput] = useState(query);
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCards().then((data) => {
      setCards(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    setInput(query);
  }, [query]);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return cards.filter((c) => {
      const haystack = [
        c.title,
        c.airline_name,
        c.aircraft_label,
        c.published_year != null ? String(c.published_year) : null,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, cards]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams(input.trim() ? { q: input.trim() } : {});
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search cards by title, airline, aircraft..."
            autoFocus
            className="w-full border border-border bg-background pl-10 pr-4 py-2.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary/50
                       placeholder:text-muted-foreground/50"
          />
        </div>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !query ? (
        <p className="text-muted-foreground text-center py-12">
          Type a search term to find cards.
        </p>
      ) : results.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          No cards found for "{query}"
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-6">
            {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {results.map((card) => (
              <PublicCardTile key={card.id} card={card} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
