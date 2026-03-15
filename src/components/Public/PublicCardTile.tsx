import { Link } from 'react-router-dom';
import { useState, useRef } from 'react';
import type { CardSummary } from '@/lib/safetyCardService';

export const PublicCardTile: React.FC<{ card: CardSummary }> = ({ card }) => {
  const fallbacks = [card.og_url, card.thumbnail_url].filter(Boolean) as string[];
  const [imgSrc, setImgSrc] = useState<string | null>(fallbacks[0] ?? null);
  const fallbackIdx = useRef(0);

  return (
    <Link
      to={`/cards/${card.id}`}
      className="group flex flex-col overflow-hidden
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="aspect-square bg-[#ebeaef] relative overflow-hidden transition-transform duration-200 group-hover:scale-110">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={card.title || 'Safety card'}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
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
    </Link>
  );
};
