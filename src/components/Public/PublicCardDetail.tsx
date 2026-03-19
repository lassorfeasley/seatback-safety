import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import { fetchCardDetail, type CardDetailData } from '@/lib/safetyCardService';
import { CardVisualizer3D } from '@/components/FoldEditor/CardVisualizer3D';

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

export const PublicCardDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [card, setCard] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
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

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
      <button
        onClick={() => navigate(-1)}
        className="fixed top-0 left-0 z-50 bg-white hover:bg-gray-50 transition-colors p-2 shadow-sm"
        aria-label="Go back"
      >
        <ArrowLeft className="h-5 w-5 text-foreground" />
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
    </div>
  );
};
