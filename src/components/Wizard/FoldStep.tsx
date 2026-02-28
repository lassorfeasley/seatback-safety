import React, { useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Save, Loader2, Star, Anchor } from 'lucide-react';
import { CreaseToggle } from '@/components/FoldEditor/CreaseToggle';
import { CardVisualizer3D } from '@/components/FoldEditor/CardVisualizer3D';
import type { FoldStepProps } from './types';
import type { Panel, Side } from '@/components/FoldEditor/types';

export const FoldStep: React.FC<FoldStepProps> = ({
  panelCount,
  slots,
  creases,
  cover,
  pivotIndex,
  onCreaseChange,
  onSequenceChange,
  onCoverChange,
  onPivotChange,
  onBack,
  onExport,
  onSave,
  isSaving,
  saveProgress,
  saveLabel,
  hideExport,
}) => {
  const effectivePivot = pivotIndex ?? derivePivot(cover.spreadIndex, panelCount);

  const panels: Panel[] = useMemo(() => {
    return slots.map((slot) => ({
      id: `panel-${slot.side}-${slot.panelIndex}`,
      side: slot.side as Side,
      panel_index: slot.panelIndex,
      thumbnail_url: slot.thumbnailUrl || '',
      width_px: slot.cropRegion?.width ?? slot.widthPx,
      height_px: slot.cropRegion?.height ?? slot.heightPx,
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

  const getAspectRatio = useCallback(
    (panelIdx: number) => {
      const filledSlots = slots.filter((s) => s.cropRegion !== null);

      if (filledSlots.length > 0) {
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
      }

      const frontSlot = slots.find(
        (s) => s.panelIndex === panelIdx && s.side === 'front'
      );
      const backSlot = slots.find(
        (s) => s.panelIndex === panelIdx && s.side === 'back'
      );
      const w = frontSlot?.widthPx ?? backSlot?.widthPx;
      const h = frontSlot?.heightPx ?? backSlot?.heightPx;
      if (w && h) return w / h;

      return 3 / 4;
    },
    [slots]
  );

  const isCover = (panelIdx: number, side: Side) =>
    cover.spreadIndex === panelIdx && cover.side === side;
  const isPivot = (panelIdx: number) => panelIdx === effectivePivot;

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-center gap-3 flex-shrink-0">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight">Fold Structure</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Click a panel to set it as the cover or spine.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 items-start flex-1 min-h-0 overflow-auto">
        <div className="flex flex-col gap-6">
          <div className="rounded-lg bg-muted/40 p-5">
            <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Front Side
            </h4>
              <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
                {Array.from({ length: panelCount }, (_, i) => {
                  const slot = slots.find(
                    (s) => s.panelIndex === i && s.side === 'front'
                  );
                  const crease = frontCreases.find((c) => c.between_panel === i);
                  const aspect = getAspectRatio(i);
                  const coverActive = isCover(i, 'front');
                  const pivotActive = isPivot(i);

                  return (
                    <React.Fragment key={i}>
                      <FoldPanel
                        panelIndex={i}
                        side="front"
                        thumbnailUrl={slot?.thumbnailUrl || null}
                        aspectRatio={aspect}
                        isCover={coverActive}
                        isPivot={pivotActive}
                        onSetCover={() => onCoverChange(i, 'front')}
                        onSetPivot={() => onPivotChange(i)}
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
          </div>

          <div className="rounded-lg bg-muted/40 p-5">
            <h4 className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Back Side
            </h4>
            <p className="text-[11px] text-muted-foreground mb-3">
              Flipped — as if you turned the card over
            </p>
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
                  const pivotActive = isPivot(i);

                  return (
                    <React.Fragment key={i}>
                      <FoldPanel
                        panelIndex={i}
                        side="back"
                        thumbnailUrl={slot?.thumbnailUrl || null}
                        aspectRatio={aspect}
                        isCover={coverActive}
                        isPivot={pivotActive}
                        onSetCover={() => onCoverChange(i, 'back')}
                        onSetPivot={() => onPivotChange(i)}
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
          </div>
        </div>

        {/* Right column: 3D preview */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <CardVisualizer3D panels={panels} creases={creases} cover={cover} pivotIndex={effectivePivot} />
        </div>
      </div>

      <div className="flex justify-between items-center flex-shrink-0 pt-3 border-t">
        <Button variant="outline" onClick={onBack} disabled={isSaving} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          {isSaving && saveProgress && (
            <span className="text-xs text-muted-foreground">{saveProgress}</span>
          )}
          {!hideExport && (
            <Button variant="outline" onClick={onExport} disabled={isSaving} className="gap-2">
              <Download className="h-4 w-4" />
              Export ZIP
            </Button>
          )}
          <Button onClick={onSave} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? 'Saving...' : (saveLabel ?? 'Save to Library')}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Derive default pivot from cover position ─────────────────────

function derivePivot(coverIdx: number, panelCount: number): number {
  if (panelCount <= 1) return 0;
  if (coverIdx <= 0) return 1;
  if (coverIdx >= panelCount - 1) return panelCount - 2;
  return coverIdx - 1;
}

// ─── FoldPanel ─────────────────────────────────────────────────────

interface FoldPanelProps {
  panelIndex: number;
  side: Side;
  thumbnailUrl: string | null;
  aspectRatio: number;
  isCover: boolean;
  isPivot: boolean;
  onSetCover: () => void;
  onSetPivot: () => void;
}

const FoldPanel: React.FC<FoldPanelProps> = ({
  panelIndex,
  side,
  thumbnailUrl,
  aspectRatio,
  isCover,
  isPivot,
  onSetCover,
  onSetPivot,
}) => {
  const sideLabel = side === 'front' ? 'F' : 'B';

  const borderClass = isCover
    ? 'border-amber-400 ring-2 ring-amber-400/30'
    : isPivot
      ? 'border-emerald-400 ring-2 ring-emerald-400/30'
      : 'border-muted hover:border-primary/40';

  return (
    <div
      className="relative group"
      style={{ flex: `${aspectRatio} 0 0%`, minWidth: 80 }}
    >
      <div
        className={`relative rounded-lg overflow-hidden border-2 transition-all ${borderClass}`}
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

        {/* Spine badge */}
        {isPivot && !isCover && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-emerald-400 text-emerald-950 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full shadow-sm">
            <Anchor className="h-2.5 w-2.5" />
            Spine
          </div>
        )}

        {/* Hover overlay with two actions */}
        {!isCover && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSetCover(); }}
              className="text-white text-[10px] font-medium flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded-full px-2 py-1 transition-colors"
            >
              <Star className="h-2.5 w-2.5" />
              Set as cover
            </button>
            {!isPivot && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSetPivot(); }}
                className="text-white text-[10px] font-medium flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded-full px-2 py-1 transition-colors"
              >
                <Anchor className="h-2.5 w-2.5" />
                Set as spine
              </button>
            )}
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
