import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft, Info, X } from 'lucide-react';
import { fetchCardDetail, type CardDetailData } from '@/lib/safetyCardService';
import { CardVisualizer3D } from '@/components/FoldEditor/CardVisualizer3D';
import { countryToFlag } from '@/lib/countryFlags';

function useViewportScale() {
  const getScale = useCallback(() => {
    const w = window.innerWidth;
    if (w < 480) return 0.6;
    if (w < 768) return 0.65;
    return 0.7;
  }, []);

  const [scale, setScale] = useState(getScale);

  useEffect(() => {
    const onResize = () => setScale(getScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [getScale]);

  return scale;
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground/60">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

export const PublicCardDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [card, setCard] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const detailScale = useViewportScale();

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
    const prev = document.title;
    document.title = card.title
      ? `${card.title} — Seatback Safety`
      : 'Seatback Safety Card';
    return () => { document.title = prev; };
  }, [card]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showInfo) setShowInfo(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showInfo]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Card not found</p>
      </div>
    );
  }

  const panelCount = card.panel_count ?? 0;
  const hasPanels = card.panels.filter((p) => p.side === 'front').length > 0 || card.panels.filter((p) => p.side === 'back').length > 0;
  const allCropsComplete = hasPanels && card.panels.length >= panelCount * 2;
  const has3D = allCropsComplete && card.creases.length > 0;

  const manufacturers = [...new Set(card.aircraft.map((a) => a.manufacturerName).filter(Boolean))];
  const models = [...new Set(card.aircraft.map((a) => a.modelName).filter(Boolean))];
  const variants = [...new Set(card.aircraft.flatMap((a) => a.variants.map((v) => v.name)).filter(Boolean))];

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 touch-none">
      <button
        onClick={() => navigate(-1)}
        className="fixed top-3 left-3 z-50 flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 bg-white hover:bg-gray-50 transition-colors border border-black/20"
        aria-label="Go back"
      >
        <ArrowLeft className="h-6 w-6 sm:h-4 sm:w-4 text-foreground" />
      </button>

      <button
        onClick={() => setShowInfo((v) => !v)}
        className={`fixed bottom-3 right-3 z-50 flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 transition-colors border border-black/20 ${
          showInfo
            ? 'bg-black text-white hover:bg-black/90'
            : 'bg-white text-black hover:bg-gray-50'
        }`}
        aria-label="Card info"
      >
        {showInfo
          ? <X className="h-6 w-6 sm:h-4 sm:w-4" />
          : <Info className="h-6 w-6 sm:h-4 sm:w-4" />}
      </button>

      {has3D ? (
        <div className="w-full h-full" style={{ transform: `scale(${detailScale})`, transformOrigin: 'center center' }}>
          <CardVisualizer3D
            panels={card.panels}
            creases={card.creases}
            cover={card.cover}
            pivotIndex={card.pivotIndex ?? undefined}
            minimal
            hintOnLoad
          />
        </div>
      ) : (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground text-sm">No 3D visualizer available for this card.</p>
        </div>
      )}

      <div
        className={`fixed top-0 right-0 h-full z-40 transition-transform duration-300 ease-out ${
          showInfo ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width: 'min(320px, 85vw)' }}
      >
        <div className="h-full bg-white/95 backdrop-blur-xl border-l border-black/20 overflow-y-auto">
          <div className="p-5 pt-6">
            {card.title && (
              <h2 className="text-base font-semibold text-foreground leading-snug mb-5">{card.title}</h2>
            )}

            <div className="flex flex-col gap-4">
              {card.airline_name && (
                <InfoRow label="Airline">
                  <span className="flex items-center gap-2">
                    {card.airline_logo_url && (
                      <img src={card.airline_logo_url} alt="" className="h-5 w-auto object-contain shrink-0" />
                    )}
                    {card.airline_name}
                    {card.airline_country && (
                      <span className="text-base leading-none">{countryToFlag(card.airline_country)}</span>
                    )}
                  </span>
                </InfoRow>
              )}

              {manufacturers.length > 0 && (
                <InfoRow label="Manufacturer">
                  <span className="flex items-center gap-2">
                    {card.manufacturer_logo_url && (
                      <img src={card.manufacturer_logo_url} alt="" className="h-5 w-auto object-contain shrink-0" />
                    )}
                    {manufacturers.join(', ')}
                  </span>
                </InfoRow>
              )}

              {models.length > 0 && (
                <InfoRow label="Model">
                  {models.join(', ')}
                </InfoRow>
              )}

              {variants.length > 0 && (
                <InfoRow label="Variant">
                  {variants.join(', ')}
                </InfoRow>
              )}

              {card.published_year && (
                <InfoRow label="Year">
                  {card.published_year}
                </InfoRow>
              )}

              {card.revision && (
                <InfoRow label="Revision">
                  {card.revision}
                </InfoRow>
              )}

              {card.languages.length > 0 && (
                <InfoRow label={card.languages.length === 1 ? 'Language' : 'Languages'}>
                  {card.languages.join(', ')}
                </InfoRow>
              )}

              {panelCount > 0 && (
                <InfoRow label="Panels">
                  {panelCount}
                </InfoRow>
              )}

              {card.notes && (
                <InfoRow label="Notes">
                  <span className="text-xs text-muted-foreground leading-relaxed">{card.notes}</span>
                </InfoRow>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
