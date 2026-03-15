import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, Info } from 'lucide-react';
import { fetchCardDetail, type CardDetailData } from '@/lib/safetyCardService';
import { CardVisualizer3D } from '@/components/FoldEditor/CardVisualizer3D';
import { useBreadcrumbs, type Breadcrumb } from './BreadcrumbContext';

export const PublicCardDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { setBreadcrumbs, clearBreadcrumbs } = useBreadcrumbs();

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

  useEffect(() => {
    if (!card) return;

    const mfr = card.aircraft[0] || null;
    const manufacturerName = mfr?.manufacturerName || null;
    const manufacturerId = mfr?.manufacturerId || null;
    const modelParts = card.aircraft
      .map((a) => {
        const variantStr = a.variants.length > 0 ? a.variants.map((v) => v.name).join(', ') : a.variantName;
        return [a.modelName, variantStr].filter(Boolean).join(' ');
      })
      .filter(Boolean)
      .join(', ');

    const crumbs: Breadcrumb[] = [];
    if (card.airline_country) {
      crumbs.push({ label: 'Countries', to: '/countries' });
      crumbs.push({ label: card.airline_country, to: `/airlines?q=${encodeURIComponent(card.airline_country)}` });
    }
    if (card.airline_name) {
      crumbs.push({
        label: card.airline_name,
        to: card.airline_id ? `/airlines/${card.airline_id}` : undefined,
      });
    }
    if (manufacturerName) {
      crumbs.push({
        label: manufacturerName,
        to: manufacturerId ? `/manufacturers/${manufacturerId}` : undefined,
      });
    }
    if (modelParts) crumbs.push({ label: modelParts });
    if (card.published_year) {
      const decade = Math.floor(card.published_year / 10) * 10;
      crumbs.push({ label: String(card.published_year), to: `/decades/${decade}` });
    }

    setBreadcrumbs(crumbs);
    return () => clearBreadcrumbs();
  }, [card, setBreadcrumbs, clearBreadcrumbs]);

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
        <div className="inline-flex items-center justify-center bg-destructive/10 p-4 mb-4">
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
      {/* Title + Logos */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-5xl font-semibold tracking-tight">
            {card.title || 'Untitled Card'}
          </h1>
        </div>

        {(card.airline_logo_url || card.manufacturer_logo_url) && (
          <div className="flex items-center gap-3 flex-shrink-0">
            {card.manufacturer_logo_url && card.aircraft[0]?.manufacturerId && (
              <Link to={`/manufacturers/${card.aircraft[0].manufacturerId}`}>
                <div className="w-[144px] h-[144px] bg-muted flex items-center justify-center overflow-hidden hover:bg-muted/80 transition-colors">
                  <img
                    src={card.manufacturer_logo_url}
                    alt="Manufacturer"
                    className="w-[108px] h-[108px] object-contain"
                  />
                </div>
              </Link>
            )}
            {card.airline_logo_url && card.airline_id && (
              <Link to={`/airlines/${card.airline_id}`}>
                <div className="w-[144px] h-[144px] bg-muted flex items-center justify-center overflow-hidden hover:bg-muted/80 transition-colors">
                  <img
                    src={card.airline_logo_url}
                    alt="Airline"
                    className="w-[108px] h-[108px] object-contain"
                  />
                </div>
              </Link>
            )}
          </div>
        )}
      </div>

      {/* 3D Visualizer -- full width, golden ratio */}
      {has3D && (
        <div
          className="w-full overflow-hidden mb-8"
          style={{ aspectRatio: '1.618 / 1' }}
        >
          <div className="w-full h-full overflow-hidden bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
            <CardVisualizer3D
              panels={card.panels}
              creases={card.creases}
              cover={card.cover}
              pivotIndex={card.pivotIndex ?? undefined}
              minimal
              hintOnLoad
            />
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {metadataItems.length > 0 && (
          <div className="border divide-y">
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
            <div className="bg-muted/40 p-4">
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

    </div>
  );
};
