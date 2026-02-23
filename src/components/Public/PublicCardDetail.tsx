import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ArrowLeft, Info, ZoomIn } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { fetchCardDetail, type CardDetailData } from '@/lib/safetyCardService';
import { CardVisualizer3D } from '@/components/FoldEditor/CardVisualizer3D';
import { cn } from '@/lib/utils';
import type { Panel } from '@/components/FoldEditor/types';

export const PublicCardDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchCardDetail(id)
      .then((data) => {
        if (!data) setError(true);
        setCard(data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center justify-center rounded-full bg-destructive/10 p-4 mb-4">
          <Info className="h-8 w-8 text-destructive" />
        </div>
        <p className="font-medium">Card not found</p>
        <Link to="/" className="text-sm text-primary mt-4 inline-block hover:underline">
          Back to Home
        </Link>
      </div>
    );
  }

  const panelCount = card.panel_count ?? 0;
  const frontPanels = card.panels
    .filter((p) => p.side === 'front')
    .sort((a, b) => a.panel_index - b.panel_index);
  const backPanels = card.panels
    .filter((p) => p.side === 'back')
    .sort((a, b) => a.panel_index - b.panel_index);
  const hasPanels = frontPanels.length > 0 || backPanels.length > 0;
  const allCropsComplete = hasPanels && card.panels.length >= panelCount * 2;
  const has3D = allCropsComplete && card.creases.length > 0;

  const metadataItems = [
    { label: 'Airline', value: card.airline_name },
    { label: 'Aircraft', value: card.aircraft_label },
    { label: 'Languages', value: card.languages?.join(', ') || card.language },
    { label: 'Published', value: card.published_year ? String(card.published_year) : null },
    { label: 'Revision', value: card.revision },
    { label: 'Panels', value: panelCount ? `${panelCount} per side` : null },
  ].filter((i) => i.value);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground
                   transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      {/* Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {card.title || 'Untitled Card'}
        </h1>
        {card.aircraft_label && (
          <p className="text-muted-foreground mt-1">{card.aircraft_label}</p>
        )}
        {card.languages && card.languages.length > 0 && (
          <div className="flex gap-1.5 mt-2">
            {card.languages.map((lang) => (
              <Badge key={lang} variant="secondary" className="text-xs">{lang}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* 3D Visualizer -- full width, golden ratio */}
      {has3D && (
        <div
          className="w-full rounded-lg overflow-hidden mb-8"
          style={{ aspectRatio: '1.618 / 1' }}
        >
          <div className="w-full h-full rounded-lg overflow-hidden bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
            <CardVisualizer3D
              panels={card.panels}
              creases={card.creases}
              cover={card.cover}
              pivotIndex={card.pivotIndex ?? undefined}
              minimal
            />
          </div>
        </div>
      )}

      {/* Panel spreads */}
      {hasPanels && (
        <div className="flex flex-col gap-6 mb-8">
          {frontPanels.length > 0 && (
            <PanelSpread
              label="Front"
              panels={frontPanels}
              displayUrls={card.displayUrls}
              fullUrls={card.fullUrls}
              onZoom={setLightboxUrl}
            />
          )}
          {backPanels.length > 0 && (
            <PanelSpread
              label="Back"
              panels={backPanels}
              displayUrls={card.displayUrls}
              fullUrls={card.fullUrls}
              onZoom={setLightboxUrl}
            />
          )}
        </div>
      )}

      {/* Metadata below */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {metadataItems.length > 0 && (
          <div className="rounded-lg border divide-y">
            {metadataItems.map((item) => (
              <div key={item.label} className="flex items-baseline justify-between px-4 py-2.5">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <span className="text-sm font-medium text-right">{item.value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-5">
          {card.notes && (
            <div className="rounded-lg bg-muted/40 p-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
              <p className="text-sm leading-relaxed">{card.notes}</p>
            </div>
          )}

          {card.created_at && (
            <p className="text-xs text-muted-foreground">
              Added {new Date(card.created_at).toLocaleDateString(undefined, {
                month: 'long', day: 'numeric', year: 'numeric',
              })}
            </p>
          )}
        </div>
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Full resolution panel"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-6 right-6 text-white/70 hover:text-white text-sm
                       bg-black/40 rounded-full px-3 py-1.5 transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

const PanelSpread: React.FC<{
  label: string;
  panels: Panel[];
  displayUrls: Record<string, string>;
  fullUrls: Record<string, string>;
  onZoom: (url: string) => void;
}> = ({ label, panels, displayUrls, fullUrls, onZoom }) => (
  <div>
    <h2 className="text-sm font-medium text-muted-foreground mb-3">{label} Side</h2>
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${panels.length}, 1fr)`, maxHeight: 350 }}
    >
      {panels.map((panel) => {
        const displayUrl = displayUrls[panel.id] || panel.thumbnail_url;
        const fullUrl = fullUrls[panel.id] || displayUrl;

        return (
          <div
            key={panel.id}
            className={cn(
              'relative group rounded-sm overflow-hidden',
              displayUrl ? 'bg-muted/50' : 'bg-muted/30 border border-dashed border-muted-foreground/20',
            )}
            style={{ maxHeight: 350 }}
          >
            {displayUrl ? (
              <>
                <img
                  src={displayUrl}
                  alt={`${label} Panel ${panel.panel_index + 1}`}
                  className="w-full h-full object-contain block"
                  loading="lazy"
                />
                {fullUrl && (
                  <button
                    onClick={() => onZoom(fullUrl)}
                    className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors
                               flex items-center justify-center opacity-0 group-hover:opacity-100"
                  >
                    <div className="bg-black/60 rounded-full p-2">
                      <ZoomIn className="h-4 w-4 text-white" />
                    </div>
                  </button>
                )}
              </>
            ) : (
              <div className="aspect-[3/4] max-h-[350px] flex items-center justify-center">
                <span className="text-xs text-muted-foreground">
                  Panel {panel.panel_index + 1}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
    <div
      className="grid gap-1 mt-1"
      style={{ gridTemplateColumns: `repeat(${panels.length}, 1fr)` }}
    >
      {panels.map((panel) => (
        <div key={panel.id} className="text-center text-[11px] text-muted-foreground">
          Panel {panel.panel_index + 1}
        </div>
      ))}
    </div>
  </div>
);
