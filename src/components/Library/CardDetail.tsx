import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft,
  Trash2,
  Loader2,
  Calendar,
  Layers,
  ScanLine,
  Maximize,
  ZoomIn,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CardVisualizer3D } from '@/components/FoldEditor/CardVisualizer3D';
import {
  fetchCardDetail,
  deleteCard,
  type CardDetailData,
  type ScanInfo,
} from '@/lib/safetyCardService';
import type { Panel } from '@/components/FoldEditor/types';

interface CardDetailProps {
  cardId: string;
  onBack: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CardDetail: React.FC<CardDetailProps> = ({ cardId, onBack }) => {
  const [card, setCard] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showScans, setShowScans] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchCardDetail(cardId)
      .then((data) => {
        if (!data) setError('Card not found or failed to load.');
        setCard(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => setLoading(false));
  }, [cardId]);

  const handleDelete = async () => {
    if (!confirm('Delete this card and all its images? This cannot be undone.')) return;
    setDeleting(true);
    const result = await deleteCard(cardId);
    if (result.success) {
      onBack();
    } else {
      alert(`Delete failed: ${result.error}`);
      setDeleting(false);
    }
  };

  // ─── Loading / Error states ────────────────────────────────────

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading card...</p>
        </div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-background gap-4">
        <div className="rounded-full bg-destructive/10 p-4">
          <Info className="h-8 w-8 text-destructive" />
        </div>
        <div className="text-center">
          <p className="font-medium">Could not load card</p>
          <p className="text-sm text-muted-foreground mt-1">{error || 'Card not found.'}</p>
        </div>
        <Button variant="outline" onClick={onBack}>
          Back to Library
        </Button>
      </div>
    );
  }

  // ─── Computed values ───────────────────────────────────────────

  const date = new Date(card.created_at).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const frontPanels = card.panels
    .filter((p) => p.side === 'front')
    .sort((a, b) => a.panel_index - b.panel_index);
  const backPanels = card.panels
    .filter((p) => p.side === 'back')
    .sort((a, b) => a.panel_index - b.panel_index);

  const panelsPerSide = card.panel_count ? Math.ceil(card.panel_count / 2) : frontPanels.length;

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="border-b bg-card flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate">
                {card.title || 'Untitled Card'}
              </h1>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <Badge variant="secondary" className="gap-1 text-[11px]">
                  <Layers className="h-3 w-3" />
                  {card.panel_count ?? '?'} panels
                </Badge>
                <Badge variant="outline" className="gap-1 text-[11px]">
                  <Calendar className="h-3 w-3" />
                  {date}
                </Badge>
                {card.crop_width && card.crop_height && (
                  <Badge variant="outline" className="gap-1 text-[11px]">
                    <Maximize className="h-3 w-3" />
                    {card.crop_width} &times; {card.crop_height}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="gap-2 flex-shrink-0"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete
          </Button>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-8">

          {/* ── Full Spread View ────────────────────────────────── */}
          {(frontPanels.length > 0 || backPanels.length > 0) && (
            <section>
              <SpreadRow
                label="Front"
                panels={frontPanels}
                expectedCount={panelsPerSide}
                displayUrls={card.displayUrls}
                fullUrls={card.fullUrls}
                onZoom={setLightboxUrl}
              />
              <div className="my-4 border-t border-dashed" />
              <SpreadRow
                label="Back"
                panels={backPanels}
                expectedCount={panelsPerSide}
                displayUrls={card.displayUrls}
                fullUrls={card.fullUrls}
                onZoom={setLightboxUrl}
              />
            </section>
          )}

          {/* ── 3D Fold Preview ─────────────────────────────────── */}
          {card.panels.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                Fold Preview
              </h2>
              <CardVisualizer3D
                panels={card.panels}
                creases={card.creases}
                cover={card.cover}
              />
            </section>
          )}

          {/* ── Scan Archive ────────────────────────────────────── */}
          {card.scans.length > 0 && (
            <section>
              <button
                onClick={() => setShowScans(!showScans)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground
                           uppercase tracking-wider hover:text-foreground transition-colors w-full"
              >
                <ScanLine className="h-4 w-4" />
                Original Scans ({card.scans.length})
                {showScans ? (
                  <ChevronUp className="h-4 w-4 ml-auto" />
                ) : (
                  <ChevronDown className="h-4 w-4 ml-auto" />
                )}
              </button>
              {showScans && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {card.scans.map((scan) => (
                    <ScanCard key={scan.id} scan={scan} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── Empty state ─────────────────────────────────────── */}
          {card.panels.length === 0 && card.scans.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="rounded-full bg-muted p-6">
                <Layers className="h-10 w-10 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">
                This card has no panel images yet.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* ── Lightbox ──────────────────────────────────────────────── */}
      {lightboxUrl && (
        <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </div>
  );
};

// ─── Spread Row ──────────────────────────────────────────────────

interface SpreadRowProps {
  label: string;
  panels: Panel[];
  expectedCount: number;
  displayUrls: Record<string, string>;
  fullUrls: Record<string, string>;
  onZoom: (url: string) => void;
}

const SpreadRow: React.FC<SpreadRowProps> = ({
  label,
  panels,
  expectedCount,
  displayUrls,
  fullUrls,
  onZoom,
}) => {
  const slots = Array.from({ length: Math.max(expectedCount, panels.length) }, (_, i) => {
    return panels.find((p) => p.panel_index === i) ?? null;
  });

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
        {label} Side
      </h2>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${slots.length}, 1fr)` }}
      >
        {slots.map((panel, i) => {
          const displayUrl = panel ? (displayUrls[panel.id] || panel.thumbnail_url) : null;
          const fullUrl = panel ? (fullUrls[panel.id] || displayUrl) : null;

          return (
            <div
              key={panel?.id ?? `empty-${i}`}
              className="relative group bg-muted rounded-sm overflow-hidden border"
            >
              {displayUrl ? (
                <>
                  <img
                    src={displayUrl}
                    alt={`${label} Panel ${i + 1}`}
                    className="w-full h-auto block"
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
                <div className="aspect-[3/4] flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">Panel {i + 1}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Panel labels */}
      <div
        className="grid gap-1 mt-1"
        style={{ gridTemplateColumns: `repeat(${slots.length}, 1fr)` }}
      >
        {slots.map((_, i) => (
          <div key={i} className="text-center text-[11px] text-muted-foreground">
            Panel {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Scan Card ───────────────────────────────────────────────────

const ScanCard: React.FC<{ scan: ScanInfo }> = ({ scan }) => {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-muted p-2 flex-shrink-0">
            <ScanLine className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">
              {scan.original_filename || 'Unknown file'}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
              <span>{scan.width_px} &times; {scan.height_px} px</span>
              <span>{scan.dpi} DPI</span>
              {scan.file_size_bytes && <span>{formatBytes(scan.file_size_bytes)}</span>}
              {scan.mime_type && <span>{scan.mime_type}</span>}
              {scan.side && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {scan.side}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Lightbox ────────────────────────────────────────────────────

const Lightbox: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8 cursor-zoom-out"
      onClick={onClose}
    >
      <img
        src={url}
        alt="Full resolution panel"
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-white/70 hover:text-white text-sm
                   bg-black/40 rounded-full px-3 py-1.5 transition-colors"
      >
        Close
      </button>
    </div>
  );
};
