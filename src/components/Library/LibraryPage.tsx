import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';

interface LibraryPageProps {
  onNewCard: () => void;
  onSelectCard: (cardId: string) => void;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({ onNewCard, onSelectCard }) => {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCards().then((data) => {
      setCards(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="h-dvh flex flex-col bg-background">
      <header className="flex-shrink-0 bg-card border-b">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-5">
          <h1 className="text-2xl font-semibold tracking-tight">Safety Card Library</h1>
          <Button onClick={onNewCard} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Card
          </Button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
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
              <Button onClick={onNewCard} className="gap-2 mt-2">
                <Plus className="h-4 w-4" />
                New Card
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {cards.map((card) => (
                <CardTile key={card.id} card={card} onClick={() => onSelectCard(card.id)} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// ─── Card Tile ───────────────────────────────────────────────────

const CardTile: React.FC<{ card: CardSummary; onClick: () => void }> = ({ card, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col rounded-lg overflow-hidden
                 transition-all hover:shadow-lg focus-visible:outline-none
                 focus-visible:ring-2 focus-visible:ring-primary text-left"
    >
      <div className="aspect-[3/4] bg-muted/60 relative overflow-hidden rounded-lg">
        {card.thumbnail_url ? (
          <img
            src={card.thumbnail_url}
            alt={card.title || 'Safety card'}
            className="absolute inset-0 w-full h-full object-cover
                       transition-transform group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
            No image
          </div>
        )}
      </div>
      <div className="pt-2 px-0.5">
        <p className="text-sm font-medium truncate">
          {card.title || card.airline_name || 'Untitled Card'}
        </p>
        {card.aircraft_label && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{card.aircraft_label}</p>
        )}
      </div>
    </button>
  );
};
