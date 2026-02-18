import React, { useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Save, Loader2, Star } from 'lucide-react';
import { CreaseToggle } from '@/components/FoldEditor/CreaseToggle';
import { CardVisualizer3D } from '@/components/FoldEditor/CardVisualizer3D';
import type { FoldStepProps } from './types';
import type { Panel, Side } from '@/components/FoldEditor/types';

export const FoldStep: React.FC<FoldStepProps> = ({
  panelCount,
  slots,
  creases,
  cover,
  onCreaseChange,
  onSequenceChange,
  onCoverChange,
  onBack,
  onExport,
  onSave,
  isSaving,
  saveProgress,
}) => {
  const panels: Panel[] = useMemo(() => {
    return slots.map((slot) => ({
      id: `panel-${slot.side}-${slot.panelIndex}`,
      side: slot.side as Side,
      panel_index: slot.panelIndex,
      thumbnail_url: slot.thumbnailUrl || '',
    }));
  }, [slots]);

  const frontCreases = useMemo(
    () =>
      creases
        .filter((c) => c.side === 'front')
        .sort((a, b) => a.between_panel - b.between_panel),
    [creases]
  );
  const backCreases = useMemo(
    () =>
      creases
        .filter((c) => c.side === 'back')
        .sort((a, b) => a.between_panel - b.between_panel),
    [creases]
  );

  const totalCreases = panelCount - 1;

  // Compute per-panel aspect ratios from crop regions
  const getAspectRatio = useCallback(
    (panelIdx: number) => {
      const filledSlots = slots.filter((s) => s.cropRegion !== null);
      if (filledSlots.length === 0) return 3 / 4;

      const refHeight = filledSlots[0].cropRegion!.height;
      const front = slots.find(
        (s) => s.panelIndex === panelIdx && s.side === 'front'
      )?.cropRegion;
      const back = slots.find(
        (s) => s.panelIndex === panelIdx && s.side === 'back'
      )?.cropRegion;
      const width = front?.width ?? back?.width;

      if (width && refHeight) return width / refHeight;

      const avgWidth =
        filledSlots.reduce((sum, s) => sum + (s.cropRegion?.width ?? 0), 0) /
        filledSlots.length;
      return avgWidth / refHeight;
    },
    [slots]
  );

  const isCover = (panelIdx: number, side: Side) =>
    cover.spreadIndex === panelIdx && cover.side === side;

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div>
          <h3 className="text-lg font-semibold">Fold Structure</h3>
          <p className="text-sm text-muted-foreground">
            Define how the card folds. Click a panel to designate it as the cover.
          </p>
        </div>
      </div>

      {/* Two-column layout: panels + creases on left, 3D preview on right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4 items-start flex-1 min-h-0 overflow-auto">
        {/* Left column: panel strips */}
        <div className="flex flex-col gap-4">
          {/* Front side */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Front Side
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
                {Array.from({ length: panelCount }, (_, i) => {
                  const slot = slots.find(
                    (s) => s.panelIndex === i && s.side === 'front'
                  );
                  const crease = frontCreases.find((c) => c.between_panel === i);
                  const aspect = getAspectRatio(i);
                  const coverActive = isCover(i, 'front');

                  return (
                    <React.Fragment key={i}>
                      <FoldPanel
                        panelIndex={i}
                        side="front"
                        thumbnailUrl={slot?.thumbnailUrl || null}
                        aspectRatio={aspect}
                        isCover={coverActive}
                        onSetCover={() => onCoverChange(i, 'front')}
                      />
                      {i < panelCount - 1 && crease && (
                        <div className="flex-shrink-0 flex items-center mx-1">
                          <CreaseToggle
                            creaseIndex={i}
                            foldDirection={crease.fold_direction}
                            unfoldSequence={crease.unfold_sequence}
                            maxSequence={totalCreases - 1}
                            onChange={(dir) => onCreaseChange(i, dir, 'front')}
                            onSequenceChange={(seq) => onSequenceChange(i, seq, 'front')}
                          />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Back side (reversed) */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Back Side
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Flipped — as if you turned the card over
              </p>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
                {Array.from({ length: panelCount }, (_, rawI) => {
                  const i = panelCount - 1 - rawI;
                  const slot = slots.find(
                    (s) => s.panelIndex === i && s.side === 'back'
                  );
                  const creaseIndex = panelCount - 2 - rawI;
                  const crease =
                    creaseIndex >= 0
                      ? backCreases.find((c) => c.between_panel === creaseIndex)
                      : null;
                  const aspect = getAspectRatio(i);
                  const coverActive = isCover(i, 'back');

                  return (
                    <React.Fragment key={i}>
                      <FoldPanel
                        panelIndex={i}
                        side="back"
                        thumbnailUrl={slot?.thumbnailUrl || null}
                        aspectRatio={aspect}
                        isCover={coverActive}
                        onSetCover={() => onCoverChange(i, 'back')}
                      />
                      {rawI < panelCount - 1 && crease && (
                        <div className="flex-shrink-0 flex items-center mx-1">
                          <CreaseToggle
                            creaseIndex={creaseIndex}
                            foldDirection={crease.fold_direction}
                            unfoldSequence={crease.unfold_sequence}
                            maxSequence={totalCreases - 1}
                            onChange={(dir) =>
                              onCreaseChange(creaseIndex, dir, 'back')
                            }
                            onSequenceChange={(seq) =>
                              onSequenceChange(creaseIndex, seq, 'back')
                            }
                          />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: 3D preview (sticky so it stays visible while scrolling) */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <CardVisualizer3D panels={panels} creases={creases} cover={cover} />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center flex-shrink-0 pt-2 border-t">
        <Button variant="outline" onClick={onBack} disabled={isSaving} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          {isSaving && saveProgress && (
            <span className="text-xs text-muted-foreground">{saveProgress}</span>
          )}
          <Button variant="outline" onClick={onExport} disabled={isSaving} className="gap-2">
            <Download className="h-4 w-4" />
            Export ZIP
          </Button>
          <Button onClick={onSave} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? 'Saving...' : 'Save to Library'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── FoldPanel ─────────────────────────────────────────────────────

interface FoldPanelProps {
  panelIndex: number;
  side: Side;
  thumbnailUrl: string | null;
  aspectRatio: number;
  isCover: boolean;
  onSetCover: () => void;
}

const FoldPanel: React.FC<FoldPanelProps> = ({
  panelIndex,
  side,
  thumbnailUrl,
  aspectRatio,
  isCover,
  onSetCover,
}) => {
  const sideLabel = side === 'front' ? 'F' : 'B';

  return (
    <div
      className="relative group cursor-pointer"
      style={{ flex: `${aspectRatio} 0 0%`, minWidth: 80 }}
      onClick={onSetCover}
      title={isCover ? 'Cover panel' : 'Click to set as cover'}
    >
      <div
        className={`
          relative rounded-lg overflow-hidden border-2 transition-all
          ${isCover
            ? 'border-amber-400 ring-2 ring-amber-400/30'
            : 'border-muted hover:border-primary/40'
          }
        `}
        style={{ aspectRatio: `${aspectRatio}` }}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`Panel ${panelIndex + 1} ${side}`}
            className="w-full h-full object-contain bg-muted/30"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}

        {/* Cover badge */}
        {isCover && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-amber-400 text-amber-950 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full shadow-sm">
            <Star className="h-2.5 w-2.5 fill-current" />
            Cover
          </div>
        )}

        {/* Hover overlay for non-cover panels */}
        {!isCover && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
            <span className="text-white text-xs font-medium flex items-center gap-1">
              <Star className="h-3 w-3" />
              Set as cover
            </span>
          </div>
        )}
      </div>

      {/* Label */}
      <div className="text-xs font-medium text-center mt-1 text-muted-foreground">
        {sideLabel}-S{panelIndex + 1}
      </div>
    </div>
  );
};
