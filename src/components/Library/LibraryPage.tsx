import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Library, Loader2 } from 'lucide-react';
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
      {/* Header */}
      <header className="border-b bg-card flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Library className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Safety Card Library</h1>
          </div>
          <Button onClick={onNewCard} className="gap-2">
            <Plus className="h-4 w-4" />
            New Card
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Loading library...</p>
            </div>
          ) : cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="rounded-full bg-muted p-6">
                <Library className="h-10 w-10 text-muted-foreground" />
              </div>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
  const date = new Date(card.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <button
      onClick={onClick}
      className="group flex flex-col rounded-lg border bg-card overflow-hidden
                 transition-all hover:shadow-md hover:border-primary/40 focus-visible:outline-none
                 focus-visible:ring-2 focus-visible:ring-primary text-left"
    >
      {/* Thumbnail */}
      <div className="aspect-[3/4] bg-muted relative overflow-hidden">
        {card.thumbnail_url ? (
          <img
            src={card.thumbnail_url}
            alt={card.title || 'Safety card'}
            className="absolute inset-0 w-full h-full object-cover
                       transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Library className="h-8 w-8" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1">
        <p className="text-sm font-medium truncate">
          {card.title || 'Untitled Card'}
        </p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{card.panel_count ?? '?'} panels</span>
          <span>{date}</span>
        </div>
      </div>
    </button>
  );
};
