import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, X, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import type { Panel, CoverDesignation } from '@/components/FoldEditor/types';

interface OgBuilderProps {
  id?: string;
  defaultOpen?: boolean;
  panels: Panel[];
  cover: CoverDesignation;
  displayUrls: Record<string, string>;
  ogImageUrl: string | null;
  ogExists: boolean;
  generatingOg: boolean;
  onGenerate: (secondPanel?: { panelId: string; offsetX: number }) => void;
}

const BG_COLOR = '#ebeaef';
const SHADOW_COLOR = '#a8a7b2';

export const OgBuilder: React.FC<OgBuilderProps> = ({
  id, defaultOpen, panels, cover, displayUrls, ogImageUrl, ogExists, generatingOg, onGenerate,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [secondPanelId, setSecondPanelId] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0.5);
  const previewRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartOffset = useRef(0);

  const coverSidePanels = useMemo(
    () => panels.filter((p) => p.side === cover.side).sort((a, b) => a.panel_index - b.panel_index),
    [panels, cover.side],
  );

  const coverPanel = useMemo(
    () => coverSidePanels.find((p) => p.panel_index === cover.spreadIndex) ?? coverSidePanels[0],
    [coverSidePanels, cover.spreadIndex],
  );

  const secondPanel = useMemo(
    () => (secondPanelId ? panels.find((p) => p.id === secondPanelId) ?? null : null),
    [panels, secondPanelId],
  );

  const panelOptions = useMemo(() => {
    return panels
      .filter((p) => p.id !== coverPanel?.id)
      .map((p) => ({
        id: p.id,
        side: p.side,
        label: `${p.side === 'front' ? 'Front' : 'Back'} ${p.panel_index + 1}`,
        url: displayUrls[p.id] || p.thumbnail_url,
      }));
  }, [panels, coverPanel, displayUrls]);

  const frontOptions = useMemo(() => panelOptions.filter((o) => o.side === 'front'), [panelOptions]);
  const backOptions = useMemo(() => panelOptions.filter((o) => o.side === 'back'), [panelOptions]);

  const coverUrl = coverPanel ? (displayUrls[coverPanel.id] || coverPanel.thumbnail_url) : null;
  const secondUrl = secondPanel ? (displayUrls[secondPanel.id] || secondPanel.thumbnail_url) : null;

  const [coverAspect, setCoverAspect] = useState(0.6);
  const [secondAspect, setSecondAspect] = useState(0.6);

  useEffect(() => {
    if (!coverUrl) return;
    const img = new Image();
    img.onload = () => setCoverAspect(img.naturalWidth / img.naturalHeight);
    img.src = coverUrl;
  }, [coverUrl]);

  useEffect(() => {
    if (!secondUrl) { setSecondAspect(0.6); return; }
    const img = new Image();
    img.onload = () => setSecondAspect(img.naturalWidth / img.naturalHeight);
    img.src = secondUrl;
  }, [secondUrl]);

  const panelH = 0.75;
  const coverW = panelH * coverAspect;
  const secondW = secondPanel ? panelH * secondAspect : 0;
  const maxShift = (coverW + secondW) / 2;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!secondPanel) return;
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartOffset.current = offsetX;
  }, [secondPanel, offsetX]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !previewRef.current) return;
      const rect = previewRef.current.getBoundingClientRect();
      const deltaPx = e.clientX - dragStartX.current;
      const deltaFrac = deltaPx / rect.width;
      const newOffset = Math.max(-1, Math.min(1,
        dragStartOffset.current + (maxShift > 0 ? deltaFrac / maxShift : 0)
      ));
      setOffsetX(newOffset);
    };
    const handleMouseUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [maxShift]);

  const handleRegenerate = useCallback(() => {
    onGenerate();
  }, [onGenerate]);

  const openSecondPanelDialog = useCallback(() => {
    setSecondPanelId(null);
    setOffsetX(0.5);
    setDialogOpen(true);
  }, []);

  const handlePickPanel = useCallback((id: string) => {
    setSecondPanelId(id);
    setOffsetX(0.5);
  }, []);

  const handleGenerateWithSecond = useCallback(() => {
    if (secondPanel) {
      onGenerate({ panelId: secondPanel.id, offsetX });
    }
    setDialogOpen(false);
  }, [secondPanel, offsetX, onGenerate]);

  // Centered composition positions
  const shadowOff = 0.04;
  const shiftFrac = secondPanel ? offsetX * maxShift : 0;
  const rawCoverL = -coverW / 2;
  const rawCoverR = coverW / 2;
  const rawSecondL = secondPanel ? shiftFrac - secondW / 2 : rawCoverL;
  const rawSecondR = secondPanel ? shiftFrac + secondW / 2 : rawCoverR;
  const compL = Math.min(rawCoverL, rawSecondL);
  const compR = Math.max(rawCoverR, rawSecondR);
  const compW = compR - compL;
  const compCenter = (compL + compR) / 2;
  const centerShift = 0.5 - compCenter;
  const coverLeft = centerShift + rawCoverL;
  const secondLeft = secondPanel ? centerShift + rawSecondL : 0;
  const shadowLeft = centerShift + compL;
  const topY = 0.5 - (panelH + shadowOff) / 2;

  const secondPanelLabel = secondPanel
    ? `${secondPanel.side === 'front' ? 'Front' : 'Back'} ${secondPanel.panel_index + 1}`
    : null;

  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <section id={id} className="border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left"
      >
        <span className="text-sm font-medium flex-1">OG Image</span>
        {ogExists && (
          <span className="text-[11px] text-muted-foreground/70 flex-shrink-0">Generated</span>
        )}
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0">
          <div className="flex gap-1.5 mb-3">
            {panelOptions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={openSecondPanelDialog}
                disabled={generatingOg}
                className="h-7 px-2 text-xs gap-1.5"
              >
                <Layers className="h-3 w-3" />
                With second panel
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={generatingOg}
              className="h-7 px-2 text-xs gap-1.5"
            >
              <RefreshCw className="h-3 w-3" />
              {ogExists ? 'Regenerate' : 'Generate'}
            </Button>
          </div>

      <div className="border bg-card overflow-hidden max-w-[280px]">
        {generatingOg ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating OG image…
          </div>
        ) : ogExists && ogImageUrl ? (
          <img src={ogImageUrl} alt="Generated Open Graph image" className="w-full h-auto" />
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            No OG image yet
          </div>
        )}
      </div>

        </div>
      )}

      {/* Second panel dialog */}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDialogOpen(false)}
        >
          <div
            className="bg-card rounded-xl border shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b shrink-0">
              <h3 className="text-sm font-medium">
                {secondPanel ? 'Position second panel' : 'Select second panel'}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)} className="h-6 w-6 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {!secondPanel ? (
              /* Panel picker */
              <div className="p-4 overflow-y-auto flex flex-col gap-4">
                {frontOptions.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-medium text-muted-foreground mb-2">Front</h4>
                    <div className="flex gap-3 items-end">
                      {frontOptions.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => handlePickPanel(opt.id)}
                          className="group flex flex-col gap-1.5 text-left shrink-0"
                          style={{ height: 160 }}
                        >
                          <div className="h-full bg-muted rounded overflow-hidden border border-transparent group-hover:border-primary transition-colors">
                            {opt.url ? (
                              <img src={opt.url} alt={opt.label} className="h-full w-auto object-contain" />
                            ) : (
                              <div className="h-full aspect-[3/4] flex items-center justify-center text-xs text-muted-foreground">
                                No image
                              </div>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
                            {opt.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {backOptions.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-medium text-muted-foreground mb-2">Back</h4>
                    <div className="flex gap-3 items-end">
                      {backOptions.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => handlePickPanel(opt.id)}
                          className="group flex flex-col gap-1.5 text-left shrink-0"
                          style={{ height: 160 }}
                        >
                          <div className="h-full bg-muted rounded overflow-hidden border border-transparent group-hover:border-primary transition-colors">
                            {opt.url ? (
                              <img src={opt.url} alt={opt.label} className="h-full w-auto object-contain" />
                            ) : (
                              <div className="h-full aspect-[3/4] flex items-center justify-center text-xs text-muted-foreground">
                                No image
                              </div>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
                            {opt.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Compose view */
              <div className="flex flex-col overflow-hidden">
                <div className="px-4 py-2 border-b flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    Second panel: {secondPanelLabel}
                  </span>
                  <button
                    onClick={() => setSecondPanelId(null)}
                    className="text-xs text-muted-foreground hover:text-foreground ml-auto underline underline-offset-2"
                  >
                    Change
                  </button>
                </div>

                <div
                  ref={previewRef}
                  className="relative w-full select-none overflow-hidden shrink-0"
                  style={{
                    aspectRatio: '1 / 1',
                    backgroundColor: BG_COLOR,
                    cursor: 'ew-resize',
                  }}
                  onMouseDown={handleMouseDown}
                >
                  <div
                    className="absolute"
                    style={{
                      left: `${(shadowLeft + shadowOff) * 100}%`,
                      top: `${(topY + shadowOff) * 100}%`,
                      width: `${compW * 100}%`,
                      height: `${panelH * 100}%`,
                      backgroundColor: SHADOW_COLOR,
                    }}
                  />

                  {secondUrl && (
                    <img
                      src={secondUrl}
                      alt="Second panel"
                      className="absolute pointer-events-none"
                      style={{
                        left: `${secondLeft * 100}%`,
                        top: `${topY * 100}%`,
                        width: `${secondW * 100}%`,
                        height: `${panelH * 100}%`,
                        objectFit: 'cover',
                      }}
                      draggable={false}
                    />
                  )}

                  {coverUrl && (
                    <img
                      src={coverUrl}
                      alt="Cover panel"
                      className="absolute pointer-events-none"
                      style={{
                        left: `${coverLeft * 100}%`,
                        top: `${topY * 100}%`,
                        width: `${coverW * 100}%`,
                        height: `${panelH * 100}%`,
                        objectFit: 'cover',
                      }}
                      draggable={false}
                    />
                  )}

                  <div className="absolute bottom-2 left-0 right-0 text-center">
                    <span className="text-[10px] text-muted-foreground/60 bg-white/60 px-2 py-0.5 rounded">
                      Drag to reposition
                    </span>
                  </div>
                </div>

                <div className="p-4 border-t flex items-center justify-end gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialogOpen(false)}
                    className="h-8 px-3 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleGenerateWithSecond}
                    disabled={generatingOg}
                    className="h-8 px-4 text-xs gap-1.5"
                  >
                    {generatingOg && <Loader2 className="h-3 w-3 animate-spin" />}
                    Generate
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
