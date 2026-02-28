import { Link } from 'react-router-dom';
import { Plane } from 'lucide-react';

export const AboutPage: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 bg-primary/10 flex items-center justify-center">
          <Plane className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">About This Collection</h1>
      </div>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <p className="text-base leading-relaxed text-muted-foreground">
          Seatback safety cards are one of the most recognizable artifacts of commercial aviation.
          Found in every seat pocket, they communicate critical safety information through
          universally understood illustrations -- transcending language barriers at 35,000 feet.
        </p>

        <p className="text-base leading-relaxed text-muted-foreground">
          This collection catalogs safety cards from airlines around the world, spanning
          decades of aviation history. Each card is carefully scanned at high resolution,
          with individual panels cropped, fold structures mapped, and metadata recorded
          including airline, aircraft type, publication year, and language.
        </p>

        <h2 className="text-lg font-semibold mt-10 mb-3">Why Collect Safety Cards?</h2>

        <p className="text-base leading-relaxed text-muted-foreground">
          Safety cards reflect the design sensibilities of their era, the identity of
          their airline, and the engineering of their aircraft. They're miniature
          pieces of graphic design history -- each one a snapshot of how an airline
          chose to communicate with its passengers at a specific moment in time.
        </p>

        <p className="text-base leading-relaxed text-muted-foreground">
          As airlines merge, rebrand, and retire aircraft, these cards become
          historical documents. Many of the cards in this collection come from
          airlines and aircraft types that no longer exist.
        </p>

        <h2 className="text-lg font-semibold mt-10 mb-3">The Collector</h2>

        <p className="text-base leading-relaxed text-muted-foreground">
          This collection was created and is maintained by Lassor Feasley.
          Cards are sourced from personal flights, estate sales, dealer purchases,
          and trades with fellow collectors.
        </p>

        <div className="border-t pt-6 mt-10">
          <p className="text-sm text-muted-foreground">
            Want to see the cards?{' '}
            <Link to="/" className="text-primary hover:underline">
              Browse the collection
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
