import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import {
  ArrowLeft,
  Trash2,
  Loader2,
  ZoomIn,
  Info,
  ChevronDown,
  ChevronUp,
  Download,
  Paperclip,
  Layers,
  Pencil,
  X as XIcon,
  Plus,
  Save,
  Scissors,
  FoldVertical,
  Sparkles,
  Printer,
  Check,
  Upload,
  Hash,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardVisualizer3D } from '@/components/FoldEditor/CardVisualizer3D';
import { generateAndUploadOgImage } from '@/lib/ogImageGenerator';
import { analyzeCardScans, type CardSuggestions } from '@/lib/aiService';
import { supabase } from '@/lib/supabase';
import {
  fetchCardDetail,
  deleteCard,
  updateCardMetadata,
  uploadScansToCard,
  updatePanelCount,
  addProvenanceEntry,
  deleteProvenanceEntry,
  addPriceObservation,
  deletePriceObservation,
  type AddDocumentInput,
  type CardDetailData,
  type CardMetadataUpdate,
  type ScanInfo,
  type DetailProvenanceEntry,
  type DetailPriceObservation,
  type DetailDocumentInfo,
} from '@/lib/safetyCardService';
import {
  fetchAirlines,
  createAirline,
  fetchManufacturers,
  createManufacturer,
  fetchModels,
  createModel,
  fetchVariants,
  createVariant,
} from '@/lib/lookupService';
import type { Panel } from '@/components/FoldEditor/types';

interface CardDetailProps {
  cardId: string;
  onBack: () => void;
  onEditCrops?: (panelIndex: number, side: string) => void;
  onEditFolds?: () => void;
  onPrintLabel?: () => void;
  isNew?: boolean;
  initialEditing?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Shared UI Components ────────────────────────────────────────

const SetupStep: React.FC<{
  id?: string;
  number: number;
  title: string;
  icon: React.ReactNode;
  complete?: boolean;
  disabled?: boolean;
  summary?: string;
  children: React.ReactNode;
}> = ({ id, number, title, icon, complete, disabled, summary, children }) => (
  <section id={id} className={`rounded-lg border p-4 ${disabled ? 'opacity-50' : ''}`}>
    <div className="flex items-center gap-2.5 mb-3">
      <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0 ${
        complete
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
          : 'bg-muted text-muted-foreground'
      }`}>
        {complete ? <Check className="h-3.5 w-3.5" /> : number}
      </div>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      {summary && (
        <span className="text-xs text-muted-foreground flex-shrink-0">{summary}</span>
      )}
    </div>
    <div className="pl-[34px]">{children}</div>
  </section>
);

const SectionHeading: React.FC<{ children: React.ReactNode; noMargin?: boolean }> = ({ children, noMargin }) => (
  <h2 className={`text-base font-medium text-muted-foreground ${noMargin ? '' : 'mb-4'}`}>{children}</h2>
);

const EditorField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-muted-foreground">{label}</label>
    {children}
  </div>
);

const InlineSuggestion: React.FC<{
  value: string | null | undefined;
  label?: string;
  accepted: boolean;
  onAccept: () => void;
}> = ({ value, label, accepted, onAccept }) => {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1 rounded-md bg-primary/5 border border-primary/15 px-2 py-1">
      <Sparkles className="h-3 w-3 text-primary/60 flex-shrink-0" />
      <span className="text-xs text-foreground/80 truncate flex-1">
        {label ? `${label}: ` : ''}{value}
      </span>
      {accepted ? (
        <span className="flex items-center gap-0.5 text-xs text-emerald-600 flex-shrink-0">
          <Check className="h-3 w-3" /> Applied
        </span>
      ) : (
        <button
          type="button"
          onClick={onAccept}
          className="flex items-center gap-0.5 text-xs text-primary hover:underline flex-shrink-0 font-medium"
        >
          Apply
        </button>
      )}
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────

export const CardDetail: React.FC<CardDetailProps> = ({ cardId, onBack, onEditCrops, onEditFolds, onPrintLabel, isNew, initialEditing }) => {
  const [card, setCard] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showScans, setShowScans] = useState(false);
  const [isEditing, setIsEditing] = useState(!!isNew || !!initialEditing);
  const [saving, setSaving] = useState(false);
  const [showAddProvenance, setShowAddProvenance] = useState(false);
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [uploadingScans, setUploadingScans] = useState(false);
  const scanFileInputRef = useRef<HTMLInputElement>(null);

  // Track which panel slot is being background-saved (from crop editor return)
  const [savingSlot, setSavingSlot] = useState<{ panelIndex: number; side: string } | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const savingParam = params.get('saving');
    if (!savingParam) return null;
    const [idx, side] = savingParam.split('-');
    return idx != null && side ? { panelIndex: parseInt(idx, 10), side } : null;
  });

  const refreshCard = useCallback(async () => {
    const data = await fetchCardDetail(cardId);
    if (data) setCard(data);
  }, [cardId]);

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
      .finally(() => {
        setLoading(false);
        if (window.location.hash) {
          setTimeout(() => {
            const el = document.querySelector(window.location.hash);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        }
      });
  }, [cardId]);

  // Poll for updates when panels are still processing or a background save is in flight
  useEffect(() => {
    if (!card) return;
    const hasProcessing = card.panels.some(
      (p) => !card.displayUrls[p.id] && !p.thumbnail_url
    );

    // Clear savingSlot once the panel appears with images
    if (savingSlot) {
      const panel = card.panels.find(
        (p) => p.panel_index === savingSlot.panelIndex && p.side === savingSlot.side
      );
      if (panel && (card.displayUrls[panel.id] || panel.thumbnail_url)) {
        setSavingSlot(null);
      }
    }

    if (!hasProcessing && !savingSlot) return;

    const interval = setInterval(() => {
      refreshCard();
    }, 2000);
    return () => clearInterval(interval);
  }, [card, refreshCard, savingSlot]);

  const handleScanUpload = useCallback(async (files: FileList) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    setUploadingScans(true);
    const result = await uploadScansToCard(cardId, imageFiles);
    if (result.success) {
      await refreshCard();
    } else {
      alert(`Upload failed: ${result.error}`);
    }
    setUploadingScans(false);
  }, [cardId, refreshCard]);

  const handlePanelCountChange = useCallback(async (count: number) => {
    const result = await updatePanelCount(cardId, count);
    if (result.success) {
      await refreshCard();
    } else {
      alert(`Failed to update panel count: ${result.error}`);
    }
  }, [cardId, refreshCard]);

  const handleSaveMetadata = useCallback(async (update: CardMetadataUpdate) => {
    setSaving(true);
    const result = await updateCardMetadata(cardId, update);
    if (result.success) {
      const refreshed = await fetchCardDetail(cardId);
      if (refreshed) setCard(refreshed);
      setIsEditing(false);
    } else {
      alert(`Save failed: ${result.error}`);
    }
    setSaving(false);
  }, [cardId]);

  const [generatingOg, setGeneratingOg] = useState(false);
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(() => {
    const { data } = supabase.storage.from('derivatives').getPublicUrl(`${cardId}/og.jpg`);
    return data.publicUrl;
  });
  const [ogExists, setOgExists] = useState(false);

  useEffect(() => {
    if (!ogImageUrl) return;
    const img = new Image();
    img.onload = () => setOgExists(true);
    img.onerror = () => setOgExists(false);
    img.src = ogImageUrl;
  }, [ogImageUrl]);

  const handleGenerateOg = useCallback(async () => {
    if (!card) return;
    setGeneratingOg(true);
    const result = await generateAndUploadOgImage(cardId, {
      panels: card.panels,
      creases: card.creases,
      cover: card.cover,
      pivotIndex: card.pivotIndex ?? undefined,
      displayUrls: card.displayUrls,
    });
    setGeneratingOg(false);
    if (result.success && result.url) {
      setOgImageUrl(result.url + '?t=' + Date.now());
      setOgExists(true);
    }
  }, [card, cardId]);

  // Auto-generate OG image when card has complete crops + folds
  const ogFingerprintRef = useRef<string>('');
  useEffect(() => {
    if (!card || generatingOg) return;
    const hasCrops = card.panels.length >= (card.panel_count ?? 0) * 2;
    const hasFolds = card.creases.length > 0;
    if (!hasCrops || !hasFolds) return;

    const fingerprint = [
      card.panels.map(p => p.id).join(','),
      card.creases.map(c => `${c.side}:${c.between_panel}:${c.fold_direction}:${c.unfold_sequence}`).join(','),
      `${card.cover.side}:${card.cover.spreadIndex}`,
    ].join('|');

    if (fingerprint === ogFingerprintRef.current) return;
    ogFingerprintRef.current = fingerprint;
    handleGenerateOg();
  }, [card, generatingOg, handleGenerateOg]);

  const handleBack = useCallback(async () => {
    if (isNew && card && card.panels.length === 0 && card.scans.length === 0 && !card.title) {
      await deleteCard(cardId);
    }
    onBack();
  }, [isNew, card, cardId, onBack]);

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

  const frontPanels = card.panels
    .filter((p) => p.side === 'front')
    .sort((a, b) => a.panel_index - b.panel_index);
  const backPanels = card.panels
    .filter((p) => p.side === 'back')
    .sort((a, b) => a.panel_index - b.panel_index);

  const panelCount = card.panel_count ?? 3;
  const panelsPerSide = card.panel_count || frontPanels.length || panelCount;
  const hasPanels = frontPanels.length > 0 || backPanels.length > 0;
  const hasScans = card.scans.length > 0;
  const allCropsComplete = hasPanels && card.panels.length >= panelCount * 2;
  const createdDate = card.created_at
    ? new Date(card.created_at).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      <header className="flex-shrink-0 bg-card border-b">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={handleBack}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-semibold tracking-tight truncate">
                {card.title || 'Untitled Card'}
              </h1>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {onPrintLabel && !isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPrintLabel}
                  className="gap-1.5"
                >
                  <Printer className="h-4 w-4" />
                  Print Label
                </Button>
              )}
              <Button
                variant={isEditing ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => {
                  const next = !isEditing;
                  setIsEditing(next);
                  if (!next) { setShowAddProvenance(false); setShowAddPrice(false); }
                }}
                disabled={saving}
                className="gap-1.5"
              >
                {isEditing ? <XIcon className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                {isEditing ? 'Cancel' : 'Edit'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={deleting || isEditing}
                className="text-muted-foreground hover:text-destructive gap-1.5"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-8">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-8">
            <div className="min-w-0 flex flex-col gap-6">
              {/* ── Card Visualizer (only when all crops are complete) ── */}
              {allCropsComplete && (
                <CardVisualizer3D
                  panels={card.panels}
                  creases={card.creases}
                  cover={card.cover}
                  pivotIndex={card.pivotIndex ?? undefined}
                />
              )}

              {/* ── Step 1: Upload Scans ────────────────────────────── */}
              <SetupStep
                number={1}
                title="Upload Scans"
                icon={<Upload className="h-4 w-4" />}
                complete={hasScans}
                summary={hasScans ? `${card.scans.length} scan${card.scans.length !== 1 ? 's' : ''} uploaded` : undefined}
              >
                {isEditing ? (
                  <>
                    <div
                      className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-muted-foreground/20 rounded-lg cursor-pointer hover:border-muted-foreground/40 hover:bg-muted/20 transition-colors"
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files.length > 0) handleScanUpload(e.dataTransfer.files); }}
                      onClick={() => scanFileInputRef.current?.click()}
                    >
                      {uploadingScans ? (
                        <>
                          <Loader2 className="h-6 w-6 text-muted-foreground/40 mb-1.5 animate-spin" />
                          <p className="text-sm font-medium text-muted-foreground">Uploading...</p>
                        </>
                      ) : (
                        <>
                          <Upload className="h-6 w-6 text-muted-foreground/40 mb-1.5" />
                          <p className="text-sm font-medium text-muted-foreground">
                            {hasScans ? 'Add more scans' : 'Drop scans here or click to browse'}
                          </p>
                          <p className="text-xs text-muted-foreground/60 mt-0.5">JPG, PNG, TIFF, or WebP</p>
                        </>
                      )}
                    </div>
                    <input
                      ref={scanFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => { if (e.target.files) handleScanUpload(e.target.files); if (scanFileInputRef.current) scanFileInputRef.current.value = ''; }}
                    />
                    {hasScans && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {card.scans.map((scan) => (
                          <div key={scan.id} className="flex items-center gap-1.5 rounded-md border bg-muted overflow-hidden" title={scan.original_filename ?? 'Scan'}>
                            {(scan.thumbnailUrl || scan.url) ? (
                              <img
                                src={scan.thumbnailUrl ?? scan.url!}
                                alt={scan.original_filename ?? 'Scan'}
                                className="h-10 w-10 object-cover flex-shrink-0"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-10 w-10 flex items-center justify-center flex-shrink-0 bg-muted">
                                <Layers className="h-3.5 w-3.5 text-muted-foreground/50" />
                              </div>
                            )}
                            <span className="text-xs text-muted-foreground truncate max-w-[100px] pr-2.5">
                              {scan.original_filename ?? 'Scan'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : hasScans ? (
                  <p className="text-sm text-muted-foreground">{card.scans.length} scan{card.scans.length !== 1 ? 's' : ''}</p>
                ) : (
                  <p className="text-sm text-muted-foreground/50">No scans uploaded. Enter edit mode to add scans.</p>
                )}
              </SetupStep>

              {/* ── Step 2: Panel Count ─────────────────────────────── */}
              <SetupStep
                number={2}
                title="Panel Count"
                icon={<Hash className="h-4 w-4" />}
                complete={hasScans}
                disabled={!hasScans}
                summary={hasScans ? `${panelCount} panels per side` : undefined}
              >
                {isEditing ? (
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { if (panelCount > 1) handlePanelCountChange(panelCount - 1); }}
                      disabled={!hasScans || panelCount <= 1}
                    >
                      <span className="text-lg leading-none">−</span>
                    </Button>
                    <span className="text-lg font-semibold tabular-nums w-8 text-center">{panelCount}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePanelCountChange(panelCount + 1)}
                      disabled={!hasScans}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">panels per side</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{panelCount} panels per side</p>
                )}
              </SetupStep>

              {/* ── Step 3: Panel Spreads / Crops ────────────────── */}
              <SetupStep
                id="spreads"
                number={3}
                title="Panel Spreads"
                icon={<Scissors className="h-4 w-4" />}
                complete={allCropsComplete}
                disabled={!hasScans}
                summary={hasPanels ? `${card.panels.length} of ${panelCount * 2} panels cropped` : undefined}
              >
                {hasScans ? (
                  <>
                    <SpreadRow
                      label="Front"
                      side="front"
                      panels={frontPanels}
                      expectedCount={panelsPerSide}
                      displayUrls={card.displayUrls}
                      fullUrls={card.fullUrls}
                      savingSlot={savingSlot}
                      onZoom={setLightboxUrl}
                      isEditing={isEditing}
                      onEditCrops={onEditCrops}
                    />
                    <div className="my-4" />
                    <SpreadRow
                      label="Back"
                      side="back"
                      panels={backPanels}
                      expectedCount={panelsPerSide}
                      displayUrls={card.displayUrls}
                      fullUrls={card.fullUrls}
                      savingSlot={savingSlot}
                      onZoom={setLightboxUrl}
                      isEditing={isEditing}
                      onEditCrops={onEditCrops}
                    />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground/50">Upload scans first</p>
                )}
              </SetupStep>

              {/* ── Step 4: Define Folds ────────────────────────────── */}
              <SetupStep
                number={4}
                title="Define Folds"
                icon={<FoldVertical className="h-4 w-4" />}
                complete={allCropsComplete && card.creases.length > 0}
                disabled={!hasPanels}
              >
                {hasPanels && onEditFolds ? (
                  <Button variant="outline" size="sm" onClick={onEditFolds} className="gap-1.5" disabled={!hasPanels}>
                    <FoldVertical className="h-3.5 w-3.5" />
                    Edit Folds
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground/50">Define crops first</p>
                )}
              </SetupStep>

              {(ogExists && ogImageUrl || generatingOg || isEditing) && (
                <section>
                  <div className="flex items-center justify-between">
                    <SectionHeading>OG Image</SectionHeading>
                    {isEditing && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateOg}
                        disabled={generatingOg}
                        className="h-7 px-2 text-xs gap-1.5"
                      >
                        <RefreshCw className={cn("h-3 w-3", generatingOg && "animate-spin")} />
                        Regenerate
                      </Button>
                    )}
                  </div>
                  <div className="rounded-lg border bg-card overflow-hidden mt-1.5">
                    {generatingOg ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating OG image…
                      </div>
                    ) : ogExists && ogImageUrl ? (
                      <img
                        src={ogImageUrl}
                        alt="Generated Open Graph image"
                        className="w-full h-auto"
                      />
                    ) : (
                      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                        No OG image yet
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            <div className="flex flex-col gap-5">
              {isEditing ? (
                <MetadataEditor
                  card={card}
                  onSave={handleSaveMetadata}
                  onCancel={() => setIsEditing(false)}
                  saving={saving}
                  scanUrls={Object.values(card.displayUrls)}
                />
              ) : (
                <>
                  <MetadataTable items={[
                    { label: 'Airline', value: card.airline_name },
                    { label: 'Aircraft', value: card.aircraft_label },
                    { label: 'Language', value: card.language },
                    { label: 'Published', value: card.published_year ? String(card.published_year) : null },
                    { label: 'Revision', value: card.revision },
                    { label: 'Panels', value: card.panel_count ? String(card.panel_count) : null },
                    {
                      label: 'Crop Size',
                      value: card.crop_width && card.crop_height
                        ? `${card.crop_width} × ${card.crop_height} px`
                        : null,
                    },
                    { label: 'Added', value: createdDate },
                  ]} />

                  {card.notes && (
                    <div className="rounded-lg bg-muted/40 p-4">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm leading-relaxed">{card.notes}</p>
                    </div>
                  )}
                </>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground">Provenance</p>
                  {isEditing && !showAddProvenance && (
                    <button
                      type="button"
                      onClick={() => setShowAddProvenance(true)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  )}
                </div>
                {isEditing && showAddProvenance && (
                  <AddProvenanceForm
                    cardId={cardId}
                    onSaved={() => { setShowAddProvenance(false); refreshCard(); }}
                    onCancel={() => setShowAddProvenance(false)}
                  />
                )}
                {card.provenance.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {card.provenance.map((entry) => (
                      <ProvenanceCard
                        key={entry.id}
                        entry={entry}
                        onDelete={isEditing ? async () => {
                          await deleteProvenanceEntry(entry.id);
                          refreshCard();
                        } : undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/60 italic">No provenance recorded</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground">Price History</p>
                  {isEditing && !showAddPrice && (
                    <button
                      type="button"
                      onClick={() => setShowAddPrice(true)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  )}
                </div>
                {isEditing && showAddPrice && (
                  <AddPriceForm
                    cardId={cardId}
                    onSaved={() => { setShowAddPrice(false); refreshCard(); }}
                    onCancel={() => setShowAddPrice(false)}
                  />
                )}
                {card.priceObservations.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {card.priceObservations.map((obs) => (
                      <PriceObservationCard
                        key={obs.id}
                        observation={obs}
                        onDelete={isEditing ? async () => {
                          await deletePriceObservation(obs.id);
                          refreshCard();
                        } : undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/60 italic">No price history recorded</p>
                )}
              </div>

              {card.scans.length > 0 && (
                <div>
                  <CollapsibleHeading open={showScans} onToggle={() => setShowScans(!showScans)}>
                    Original Scans ({card.scans.length})
                  </CollapsibleHeading>
                  {showScans && (
                    <div className="mt-2 flex flex-col gap-2">
                      {card.scans.map((scan) => (
                        <ScanCard key={scan.id} scan={scan} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {lightboxUrl && (
        <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </div>
  );
};

// ─── Metadata Table ──────────────────────────────────────────────

const MetadataTable: React.FC<{
  items: { label: string; value: string | null | undefined }[];
}> = ({ items }) => {
  const visible = items.filter((i) => i.value);
  if (visible.length === 0) return null;
  return (
    <div className="rounded-lg border divide-y">
      {visible.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between px-4 py-2.5">
          <span className="text-xs text-muted-foreground">{item.label}</span>
          <span className="text-sm font-medium text-right">{item.value}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Metadata Editor ─────────────────────────────────────────────

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/40';

interface AircraftRow {
  modelId: string;
  modelName: string;
  variantId: string | null;
  variantName: string;
}

interface MetadataEditorProps {
  card: CardDetailData;
  onSave: (update: CardMetadataUpdate) => void;
  onCancel: () => void;
  saving: boolean;
  scanUrls: string[];
}

const MetadataEditor: React.FC<MetadataEditorProps> = ({ card, onSave, onCancel, saving, scanUrls }) => {
  const [title, setTitle] = useState(card.title ?? '');
  const [airlineId, setAirlineId] = useState<string | null>(card.airline_id);
  const [manufacturerId, setManufacturerId] = useState<string | null>(
    card.aircraft.length > 0 ? card.aircraft[0].manufacturerId : null
  );
  const [aircraftRows, setAircraftRows] = useState<AircraftRow[]>(
    card.aircraft.length > 0
      ? card.aircraft.map((a) => ({
          modelId: a.modelId ?? '',
          modelName: a.modelName,
          variantId: a.variantId,
          variantName: a.variantName,
        }))
      : [{ modelId: '', modelName: '', variantId: null, variantName: '' }]
  );
  const [languages, setLanguages] = useState<string[]>(card.languages);
  const [langInput, setLangInput] = useState('');
  const [publishedYear, setPublishedYear] = useState<string>(
    card.published_year != null ? String(card.published_year) : ''
  );
  const [revision, setRevision] = useState(card.revision ?? '');
  const [notes, setNotes] = useState(card.notes ?? '');

  const [analyzing, setAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<CardSuggestions | null>(null);
  const [acceptedFields, setAcceptedFields] = useState<Set<string>>(new Set());

  const handleAnalyze = useCallback(async () => {
    if (scanUrls.length === 0) return;
    setAnalyzing(true);
    setSuggestions(null);
    setAcceptedFields(new Set());
    const result = await analyzeCardScans(scanUrls);
    setAnalyzing(false);
    if (result.suggestions) {
      setSuggestions(result.suggestions);
    } else {
      alert(`AI analysis failed: ${result.error}`);
    }
  }, [scanUrls]);

  const acceptField = useCallback((field: string) => {
    if (!suggestions) return;
    setAcceptedFields((prev) => new Set(prev).add(field));
    switch (field) {
      case 'title':
        if (suggestions.suggested_title) setTitle(suggestions.suggested_title);
        break;
      case 'languages':
        if (suggestions.languages?.length) setLanguages(suggestions.languages);
        break;
      case 'published_year':
        if (suggestions.published_year) setPublishedYear(String(suggestions.published_year));
        break;
      case 'revision':
        if (suggestions.revision) setRevision(suggestions.revision);
        break;
    }
  }, [suggestions]);

  const [airlines, setAirlines] = useState<ComboboxOption[]>([]);
  const [manufacturers, setManufacturers] = useState<ComboboxOption[]>([]);
  const [models, setModels] = useState<ComboboxOption[]>([]);
  const [variantsByModel, setVariantsByModel] = useState<Record<string, ComboboxOption[]>>({});

  useEffect(() => {
    fetchAirlines().then((items) =>
      setAirlines(items.map((i) => ({ value: i.id, label: i.name })))
    );
    fetchManufacturers().then((items) =>
      setManufacturers(items.map((i) => ({ value: i.id, label: i.name })))
    );
  }, []);

  useEffect(() => {
    if (manufacturerId) {
      fetchModels(manufacturerId).then((items) =>
        setModels(items.map((i) => ({ value: i.id, label: i.name })))
      );
    } else {
      setModels([]);
    }
  }, [manufacturerId]);

  const loadVariants = useCallback(async (modelId: string) => {
    if (variantsByModel[modelId]) return;
    const items = await fetchVariants(modelId);
    setVariantsByModel((prev) => ({
      ...prev,
      [modelId]: items.map((i) => ({ value: i.id, label: i.name })),
    }));
  }, [variantsByModel]);

  const updateAircraftRow = useCallback((idx: number, patch: Partial<AircraftRow>) => {
    setAircraftRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }, []);

  const removeAircraftRow = useCallback((idx: number) => {
    setAircraftRows((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addLanguage = useCallback(() => {
    const trimmed = langInput.trim();
    if (trimmed && !languages.includes(trimmed)) {
      setLanguages((prev) => [...prev, trimmed]);
    }
    setLangInput('');
  }, [langInput, languages]);

  const handleSubmit = () => {
    const year = publishedYear ? parseInt(publishedYear, 10) : null;
    onSave({
      title: title.trim() || null,
      airlineId,
      aircraft: aircraftRows.filter((r) => r.modelId).map((r) => ({
        modelId: r.modelId,
        variantId: r.variantId,
      })),
      languages,
      publishedYear: year && !isNaN(year) ? year : null,
      revision: revision.trim() || null,
      notes: notes.trim() || null,
    });
  };

  const acceptAirline = useCallback(async () => {
    if (!suggestions?.airline) return;
    const match = airlines.find((a) => a.label.toLowerCase() === suggestions.airline!.toLowerCase());
    if (match) {
      setAirlineId(match.value);
    } else {
      const item = await createAirline(suggestions.airline);
      setAirlines((prev) => [...prev, { value: item.id, label: item.name }]);
      setAirlineId(item.id);
    }
    setAcceptedFields((prev) => new Set(prev).add('airline'));
  }, [suggestions, airlines]);

  const acceptAircraft = useCallback(async () => {
    if (!suggestions?.aircraft?.length) return;
    const firstMfr = suggestions.aircraft.find((a) => a.manufacturer)?.manufacturer;
    if (firstMfr) {
      const mfrMatch = manufacturers.find((m) => m.label.toLowerCase() === firstMfr.toLowerCase());
      let mfrId: string;
      if (mfrMatch) {
        mfrId = mfrMatch.value;
      } else {
        const item = await createManufacturer(firstMfr);
        setManufacturers((prev) => [...prev, { value: item.id, label: item.name }]);
        mfrId = item.id;
      }
      setManufacturerId(mfrId);

      const rows: typeof aircraftRows = [];
      for (const a of suggestions.aircraft) {
        if (!a.model) continue;
        const modelMatch = models.find((m) => m.label.toLowerCase() === a.model!.toLowerCase());
        let modelId: string;
        let modelName: string;
        if (modelMatch) {
          modelId = modelMatch.value;
          modelName = modelMatch.label;
        } else {
          const item = await createModel(mfrId, a.model);
          setModels((prev) => [...prev, { value: item.id, label: item.name }]);
          modelId = item.id;
          modelName = item.name;
        }
        rows.push({ modelId, modelName, variantId: null, variantName: '' });
      }
      if (rows.length > 0) setAircraftRows(rows);
    }
    setAcceptedFields((prev) => new Set(prev).add('aircraft'));
  }, [suggestions, manufacturers, models, aircraftRows]);

  return (
    <div className="flex flex-col gap-4">
      {scanUrls.length > 0 && (
        <div className="flex items-center gap-2">
          {!suggestions && !analyzing && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAnalyze}
              className="w-full gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Analyze with AI
            </Button>
          )}
          {analyzing && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-3 w-full">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Analyzing card scans...</span>
            </div>
          )}
          {suggestions && (
            <div className="flex items-center justify-between w-full rounded-lg border bg-muted/30 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> AI suggestions shown below
              </p>
              <button
                onClick={() => setSuggestions(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col gap-3">
        <EditorField label="Title">
          <input className={INPUT_CLASS} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Card title" />
          <InlineSuggestion
            value={suggestions?.suggested_title}
            accepted={acceptedFields.has('title')}
            onAccept={() => acceptField('title')}
          />
        </EditorField>

        <EditorField label="Airline">
          <Combobox
            options={airlines}
            value={airlineId}
            onChange={(value) => setAirlineId(value)}
            onCreateNew={async (name) => {
              const item = await createAirline(name);
              setAirlines((prev) => [...prev, { value: item.id, label: item.name }]);
              return { value: item.id, label: item.name };
            }}
            placeholder="Select airline..."
            searchPlaceholder="Search airlines..."
          />
          <InlineSuggestion
            value={suggestions?.airline}
            accepted={acceptedFields.has('airline')}
            onAccept={acceptAirline}
          />
        </EditorField>

        <EditorField label="Manufacturer">
          <Combobox
            options={manufacturers}
            value={manufacturerId}
            onChange={(value) => {
              setManufacturerId(value);
              setAircraftRows([{ modelId: '', modelName: '', variantId: null, variantName: '' }]);
            }}
            onCreateNew={async (name) => {
              const item = await createManufacturer(name);
              setManufacturers((prev) => [...prev, { value: item.id, label: item.name }]);
              return { value: item.id, label: item.name };
            }}
            placeholder="Select manufacturer..."
            searchPlaceholder="Search manufacturers..."
          />
          <InlineSuggestion
            value={suggestions?.aircraft?.length
              ? suggestions.aircraft.map((a) => [a.manufacturer, a.model, a.variant].filter(Boolean).join(' ')).join(', ')
              : undefined}
            accepted={acceptedFields.has('aircraft')}
            onAccept={acceptAircraft}
          />
        </EditorField>

        {manufacturerId && (
          <EditorField label="Aircraft">
            <div className="flex flex-col gap-2">
              {aircraftRows.map((row, idx) => (
                <div key={idx} className="flex flex-col gap-1.5 rounded-md border p-2">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1">
                      <Combobox
                        options={models}
                        value={row.modelId || null}
                        onChange={(value, label) => {
                          updateAircraftRow(idx, { modelId: value, modelName: label, variantId: null, variantName: '' });
                          loadVariants(value);
                        }}
                        onCreateNew={async (name) => {
                          const item = await createModel(manufacturerId, name);
                          setModels((prev) => [...prev, { value: item.id, label: item.name }]);
                          return { value: item.id, label: item.name };
                        }}
                        placeholder="Model..."
                        searchPlaceholder="Search models..."
                      />
                    </div>
                    {aircraftRows.length > 1 && (
                      <button className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0" onClick={() => removeAircraftRow(idx)}>
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {row.modelId && (
                    <Combobox
                      options={variantsByModel[row.modelId] ?? []}
                      value={row.variantId}
                      onChange={(value, label) => updateAircraftRow(idx, { variantId: value, variantName: label })}
                      onCreateNew={async (name) => {
                        const item = await createVariant(row.modelId, name);
                        setVariantsByModel((prev) => ({
                          ...prev,
                          [row.modelId]: [...(prev[row.modelId] ?? []), { value: item.id, label: item.name }],
                        }));
                        return { value: item.id, label: item.name };
                      }}
                      placeholder="Variant (optional)..."
                      searchPlaceholder="Search variants..."
                    />
                  )}
                </div>
              ))}
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setAircraftRows((prev) => [...prev, { modelId: '', modelName: '', variantId: null, variantName: '' }])}
              >
                <Plus className="h-3 w-3" /> Add aircraft
              </button>
            </div>
          </EditorField>
        )}

        <EditorField label="Languages">
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {languages.map((lang) => (
              <span key={lang} className="inline-flex items-center gap-1 bg-muted rounded-md px-2 py-0.5 text-xs">
                {lang}
                <button className="text-muted-foreground hover:text-destructive" onClick={() => setLanguages((prev) => prev.filter((l) => l !== lang))}>
                  <XIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              className={INPUT_CLASS}
              value={langInput}
              onChange={(e) => setLangInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLanguage(); } }}
              placeholder="Add language..."
            />
            <Button variant="outline" size="sm" onClick={addLanguage} disabled={!langInput.trim()} className="flex-shrink-0">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <InlineSuggestion
            value={suggestions?.languages?.length ? suggestions.languages.join(', ') : undefined}
            accepted={acceptedFields.has('languages')}
            onAccept={() => acceptField('languages')}
          />
        </EditorField>

        <div className="grid grid-cols-2 gap-3">
          <EditorField label="Year">
            <input type="number" className={INPUT_CLASS} value={publishedYear} onChange={(e) => setPublishedYear(e.target.value)} placeholder="e.g. 2024" />
            <InlineSuggestion
              value={suggestions?.published_year ? String(suggestions.published_year) : undefined}
              accepted={acceptedFields.has('published_year')}
              onAccept={() => acceptField('published_year')}
            />
          </EditorField>
          <EditorField label="Revision">
            <input className={INPUT_CLASS} value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="e.g. Rev C" />
            <InlineSuggestion
              value={suggestions?.revision}
              accepted={acceptedFields.has('revision')}
              onAccept={() => acceptField('revision')}
            />
          </EditorField>
        </div>

        <EditorField label="Notes">
          <textarea className={`${INPUT_CLASS} min-h-[80px] resize-y`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." />
        </EditorField>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={saving} className="flex-1 gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

const CollapsibleHeading: React.FC<{
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}> = ({ children, open, onToggle }) => (
  <button
    onClick={onToggle}
    className="flex items-center gap-2 text-base font-medium text-muted-foreground
               hover:text-foreground transition-colors w-full"
  >
    {children}
    {open ? (
      <ChevronUp className="h-4 w-4 ml-auto" />
    ) : (
      <ChevronDown className="h-4 w-4 ml-auto" />
    )}
  </button>
);

// ─── Spread Row ──────────────────────────────────────────────────

interface SpreadRowProps {
  label: string;
  side: 'front' | 'back';
  panels: Panel[];
  expectedCount: number;
  displayUrls: Record<string, string>;
  fullUrls: Record<string, string>;
  savingSlot?: { panelIndex: number; side: string } | null;
  onZoom: (url: string) => void;
  isEditing?: boolean;
  onEditCrops?: (panelIndex: number, side: string) => void;
}

const SpreadRow: React.FC<SpreadRowProps> = ({
  label,
  side,
  panels,
  expectedCount,
  displayUrls,
  fullUrls,
  savingSlot,
  onZoom,
  isEditing,
  onEditCrops,
}) => {
  const slots = Array.from({ length: Math.max(expectedCount, panels.length) }, (_, i) => {
    return panels.find((p) => p.panel_index === i) ?? null;
  });

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-3">
        {label} Side
      </h2>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${slots.length}, 1fr)`, maxHeight: 300 }}
      >
        {slots.map((panel, i) => {
          const displayUrl = panel ? (displayUrls[panel.id] || panel.thumbnail_url) : null;
          const fullUrl = panel ? (fullUrls[panel.id] || displayUrl) : null;
          const isSavingThis = savingSlot?.panelIndex === i && savingSlot?.side === side;
          const isProcessing = (!!panel && !displayUrl) || isSavingThis;

          return (
            <div
              key={panel?.id ?? `empty-${i}`}
              className={cn(
                'relative group rounded-sm overflow-hidden',
                (displayUrl && !isSavingThis) ? 'bg-muted/50' : 'bg-muted/30 border border-dashed border-muted-foreground/20',
                isEditing && onEditCrops && !isProcessing && 'cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all',
              )}
              style={{ maxHeight: 300 }}
              onClick={isEditing && onEditCrops && !isProcessing ? () => onEditCrops(i, side) : undefined}
            >
              {displayUrl && !isSavingThis ? (
                <>
                  <img
                    src={displayUrl}
                    alt={`${label} Panel ${i + 1}`}
                    className="w-full h-full object-contain block"
                    loading="lazy"
                  />
                  {isEditing && onEditCrops ? (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors
                                   flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="bg-black/60 rounded-full p-2">
                        <Scissors className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  ) : fullUrl ? (
                    <button
                      onClick={() => onZoom(fullUrl)}
                      className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors
                                 flex items-center justify-center opacity-0 group-hover:opacity-100"
                    >
                      <div className="bg-black/60 rounded-full p-2">
                        <ZoomIn className="h-4 w-4 text-white" />
                      </div>
                    </button>
                  ) : null}
                </>
              ) : isProcessing ? (
                <div className="aspect-[3/4] max-h-[300px] flex flex-col items-center justify-center gap-2 animate-pulse">
                  <Loader2 className="h-5 w-5 text-muted-foreground/50 animate-spin" />
                  <span className="text-[11px] text-muted-foreground/50">Processing...</span>
                </div>
              ) : (
                <div className="aspect-[3/4] max-h-[300px] flex flex-col items-center justify-center gap-1.5">
                  {isEditing && onEditCrops ? (
                    <>
                      <Scissors className="h-4 w-4 text-muted-foreground/40" />
                      <span className="text-xs text-muted-foreground/60">Crop</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Panel {i + 1}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
    <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/40">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {scan.original_filename || 'Unknown file'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {scan.width_px} &times; {scan.height_px} px
          {' · '}{scan.dpi} DPI
          {scan.file_size_bytes ? ` · ${formatBytes(scan.file_size_bytes)}` : ''}
          {scan.side ? ` · ${scan.side}` : ''}
        </p>
      </div>
    </div>
  );
};

// ─── Document Download Links ─────────────────────────────────────

const DocumentLinks: React.FC<{ documents: DetailDocumentInfo[] }> = ({ documents }) => {
  if (documents.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {documents.map((doc) => (
        <a
          key={doc.id}
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground
                     bg-muted/50 hover:bg-muted rounded-md px-2.5 py-1.5 transition-colors"
        >
          <Paperclip className="h-3 w-3 flex-shrink-0" />
          <span className="truncate max-w-[160px]">{doc.original_filename}</span>
          {doc.file_size_bytes && (
            <span className="text-muted-foreground/60">({formatBytes(doc.file_size_bytes)})</span>
          )}
          <Download className="h-3 w-3 flex-shrink-0" />
        </a>
      ))}
    </div>
  );
};

// ─── Provenance Display ──────────────────────────────────────────

const ProvenanceCard: React.FC<{ entry: DetailProvenanceEntry; onDelete?: () => void }> = ({ entry, onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="p-4 rounded-lg bg-muted/40 group relative">
      {onDelete && (
        <div className="absolute top-2 right-2">
          {confirming ? (
            <div className="flex items-center gap-1">
              <button onClick={onDelete} className="text-[10px] text-destructive hover:underline">Remove</button>
              <span className="text-[10px] text-muted-foreground">/</span>
              <button onClick={() => setConfirming(false)} className="text-[10px] text-muted-foreground hover:underline">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      <p className="text-sm font-medium">{entry.source || 'Unknown source'}</p>
      {entry.acquired_date && (
        <p className="text-xs text-muted-foreground mt-1">
          <span className="text-muted-foreground/60">Acquired:</span>{' '}
          {new Date(entry.acquired_date + 'T00:00:00').toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      )}
      {entry.notes && (
        <p className="text-xs text-muted-foreground mt-2">{entry.notes}</p>
      )}
      <DocumentLinks documents={entry.documents} />
    </div>
  );
};

// ─── Price Observation Display ───────────────────────────────────

const PRICE_TYPE_LABELS: Record<string, string> = {
  purchase: 'Purchase',
  asking: 'Asking',
  auction_result: 'Auction Result',
  estimate: 'Estimate',
};

const PriceObservationCard: React.FC<{ observation: DetailPriceObservation; onDelete?: () => void }> = ({ observation, onDelete }) => {
  const formattedPrice = observation.price_usd != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(observation.price_usd)
    : '—';

  const [confirming, setConfirming] = useState(false);
  return (
    <div className="p-4 rounded-lg bg-muted/40 group relative">
      {onDelete && (
        <div className="absolute top-2 right-2">
          {confirming ? (
            <div className="flex items-center gap-1">
              <button onClick={onDelete} className="text-[10px] text-destructive hover:underline">Remove</button>
              <span className="text-[10px] text-muted-foreground">/</span>
              <button onClick={() => setConfirming(false)} className="text-[10px] text-muted-foreground hover:underline">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      <div className="flex items-baseline gap-2">
        <p className="text-sm font-medium">{formattedPrice}</p>
        {observation.price_type && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
            {PRICE_TYPE_LABELS[observation.price_type] ?? observation.price_type}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {[
          observation.source,
          observation.observed_date
            ? new Date(observation.observed_date + 'T00:00:00').toLocaleDateString(undefined, {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <DocumentLinks documents={observation.documents} />
    </div>
  );
};

// ─── Inline Add Forms ────────────────────────────────────────────

const INLINE_INPUT =
  'w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/40';

function fileToDocInput(file: File): AddDocumentInput {
  return {
    file,
    originalFilename: file.name,
    mimeType: file.type || 'application/octet-stream',
    fileSizeBytes: file.size,
  };
}

const AttachmentPicker: React.FC<{
  files: AddDocumentInput[];
  onChange: (files: AddDocumentInput[]) => void;
}> = ({ files, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (!e.target.files) return;
          onChange([...files, ...Array.from(e.target.files).map(fileToDocInput)]);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Paperclip className="h-3 w-3" /> Attach files
      </button>
      {files.length > 0 && (
        <div className="flex flex-col gap-1 mt-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
              <Paperclip className="h-3 w-3 flex-shrink-0" />
              <span className="truncate flex-1">{f.originalFilename}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive flex-shrink-0"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AddProvenanceForm: React.FC<{
  cardId: string;
  onSaved: () => void;
  onCancel: () => void;
}> = ({ cardId, onSaved, onCancel }) => {
  const [source, setSource] = useState('');
  const [acquiredDate, setAcquiredDate] = useState('');
  const [notes, setNotes] = useState('');
  const [docs, setDocs] = useState<AddDocumentInput[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    const result = await addProvenanceEntry(cardId, {
      source: source.trim() || null,
      acquiredDate: acquiredDate || null,
      notes: notes.trim() || null,
    }, docs);
    setSaving(false);
    if (result.success) onSaved();
    else alert(`Failed: ${result.error}`);
  };

  return (
    <div className="rounded-lg border p-3 mb-2 flex flex-col gap-2">
      <input
        className={INLINE_INPUT}
        placeholder="Source (e.g. eBay, gift, estate sale)"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        autoFocus
      />
      <input
        type="date"
        className={INLINE_INPUT}
        value={acquiredDate}
        onChange={(e) => setAcquiredDate(e.target.value)}
      />
      <textarea
        className={`${INLINE_INPUT} min-h-[60px] resize-y`}
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <AttachmentPicker files={docs} onChange={setDocs} />
      <div className="flex gap-1.5">
        <Button size="sm" onClick={handleSubmit} disabled={saving || !source.trim()} className="flex-1 gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {saving ? 'Saving...' : 'Add'}
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

const PRICE_TYPE_OPTIONS = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'asking', label: 'Asking' },
  { value: 'auction_result', label: 'Auction Result' },
  { value: 'estimate', label: 'Estimate' },
];

const AddPriceForm: React.FC<{
  cardId: string;
  onSaved: () => void;
  onCancel: () => void;
}> = ({ cardId, onSaved, onCancel }) => {
  const [priceUsd, setPriceUsd] = useState('');
  const [priceType, setPriceType] = useState('purchase');
  const [source, setSource] = useState('');
  const [observedDate, setObservedDate] = useState('');
  const [docs, setDocs] = useState<AddDocumentInput[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    const parsed = parseFloat(priceUsd);
    const result = await addPriceObservation(cardId, {
      priceUsd: isNaN(parsed) ? null : parsed,
      priceType: priceType || null,
      source: source.trim() || null,
      observedDate: observedDate || null,
    }, docs);
    setSaving(false);
    if (result.success) onSaved();
    else alert(`Failed: ${result.error}`);
  };

  return (
    <div className="rounded-lg border p-3 mb-2 flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
          <input
            type="number"
            step="0.01"
            className={`${INLINE_INPUT} pl-6`}
            placeholder="0.00"
            value={priceUsd}
            onChange={(e) => setPriceUsd(e.target.value)}
            autoFocus
          />
        </div>
        <select
          className={`${INLINE_INPUT} w-auto`}
          value={priceType}
          onChange={(e) => setPriceType(e.target.value)}
        >
          {PRICE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <input
        className={INLINE_INPUT}
        placeholder="Source (e.g. eBay listing, dealer)"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      />
      <input
        type="date"
        className={INLINE_INPUT}
        value={observedDate}
        onChange={(e) => setObservedDate(e.target.value)}
      />
      <AttachmentPicker files={docs} onChange={setDocs} />
      <div className="flex gap-1.5">
        <Button size="sm" onClick={handleSubmit} disabled={saving || !priceUsd} className="flex-1 gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {saving ? 'Saving...' : 'Add'}
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
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
