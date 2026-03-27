import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Search, X } from 'lucide-react';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';

interface LibraryPageProps {
  onNewCard: () => void;
  onSelectCard: (cardId: string) => void;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({ onNewCard, onSelectCard }) => {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchCards({ includeUnpublished: true }).then((data) => {
      setCards(data);
      setLoading(false);
    });
  }, []);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return cards;
    const terms = q.split(/\s+/).filter(Boolean);
    return cards.filter((c) => {
      const haystack = [c.title, c.airline_name, c.aircraft_label, c.published_year != null ? String(c.published_year) : null]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [cards, searchQuery]);

  return (
    <>
      <header className="flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 pt-8 pb-4">
          <h1 className="text-sm font-medium tracking-widest uppercase text-black/60">Cards</h1>
          <Button onClick={onNewCard} size="sm" variant="outline" className="gap-1.5 border-black/20 text-black/60 hover:text-black hover:bg-gray-50">
            <Plus className="h-4 w-4" />
            New Card
          </Button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Loading library...</p>
            </div>
          ) : cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="text-center">
                <h2 className="text-lg font-medium">No cards yet</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first safety card to get started.
                </p>
              </div>
              <Button onClick={onNewCard} className="gap-2 mt-2" variant="outline">
                <Plus className="h-4 w-4" />
                New Card
              </Button>
            </div>
          ) : (
            <>
              <div className="relative mb-6" style={{ backgroundColor: '#ebeaef' }}>
                <div className="flex items-center gap-2 px-5 py-3">
                  <Search className="h-4 w-4 opacity-40 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by title, airline, aircraft..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="text-black/30 hover:text-black/60 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {filteredCards.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <p className="text-muted-foreground text-sm">No cards match your search.</p>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-3 text-xs text-foreground underline underline-offset-2 hover:no-underline"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                  {filteredCards.map((card) => (
                    <CardTile key={card.id} card={card} onClick={() => onSelectCard(card.id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
};

// ─── Card Tile ───────────────────────────────────────────────────

const CardTile: React.FC<{ card: CardSummary; onClick: () => void }> = ({ card, onClick }) => {
  const fallbacks = [card.og_url, card.thumbnail_url].filter(Boolean) as string[];
  const [imgSrc, setImgSrc] = React.useState<string | null>(fallbacks[0] ?? null);
  const fallbackIdx = React.useRef(0);

  return (
    <button
      onClick={onClick}
      className="flex flex-col overflow-hidden focus-visible:outline-none text-left"
    >
      <div className="aspect-square bg-[#ebeaef] relative overflow-hidden">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={card.title || 'Safety card'}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => {
              fallbackIdx.current += 1;
              if (fallbackIdx.current < fallbacks.length) {
                setImgSrc(fallbacks[fallbackIdx.current]);
              } else {
                setImgSrc(null);
              }
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
            No image
          </div>
        )}
      </div>
    </button>
  );
};
