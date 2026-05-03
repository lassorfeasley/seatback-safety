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
  BookOpen,
  Star,
  Image as ImageIcon,
  Crop as CropIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardVisualizer3D } from '@/components/FoldEditor/CardVisualizer3D';
import { BookletVisualizer } from '@/components/FoldEditor/BookletVisualizer';
import { generateAndUploadOgImage, generateAndUploadOgFromScan, type OgImageInput } from '@/lib/ogImageGenerator';
import { OgBuilder } from '@/components/Library/OgBuilder';
import { OgScanCropper } from '@/components/Library/OgScanCropper';
import { analyzeCardScans, analyzeDocument, type CardSuggestions, type DocumentExtraction } from '@/lib/aiService';
import { supabase } from '@/lib/supabase';
import {
  fetchCardDetail,
  deleteCard,
  updateCardMetadata,
  uploadScansToCard,
  updatePanelCount,
  updateBookletFlag,
  updateOgScan,
  updateCardMode,
  updateIrregularFlag,
  addProvenanceEntry,
  updateProvenanceEntry,
  deleteProvenanceEntry,
  type AddDocumentInput,
  type ProvenanceInput,
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
import { SocialCropper } from '@/components/Admin/SocialCropper';
import { fetchCropsForCard, deleteSocialCrop, type SocialCrop } from '@/lib/socialCropService';

interface CardDetailProps {
  cardId: string;
  onBack: () => void;
  onEditCrops?: (panelIndex: number, side: string) => void;
  onEditFolds?: () => void;
  onPrintLabel?: () => void;
  isNew?: boolean;
  initialEditing?: boolean;
  autoGenerateOg?: boolean;
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
  defaultOpen?: boolean;
}> = ({ id, number, title, icon, complete, disabled, summary, children, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen ?? !complete);

  return (
    <section id={id} className={cn('border bg-card transition-opacity', disabled && 'opacity-40')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 w-full px-4 py-3 text-left"
      >
        <div className={cn(
          'flex items-center justify-center w-5 h-5 text-[10px] font-semibold flex-shrink-0 transition-colors',
          complete
            ? 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20'
            : 'bg-muted text-muted-foreground'
        )}>
          {complete ? <Check className="h-3 w-3" /> : number}
        </div>
        <span className="text-muted-foreground flex-shrink-0">{icon}</span>
        <span className="text-sm font-medium flex-1 min-w-0 truncate">{title}</span>
        {summary && (
          <span className="text-[11px] text-muted-foreground/70 flex-shrink-0 tabular-nums">{summary}</span>
        )}
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0">
          {children}
        </div>
      )}
    </section>
  );
};

const EditorField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
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
    <div className="flex items-center gap-1.5 mt-1 rounded-lg bg-primary/5 border border-primary/10 px-2.5 py-1.5">
      <Sparkles className="h-3 w-3 text-primary/50 flex-shrink-0" />
      <span className="text-xs text-foreground/70 truncate flex-1">
        {label ? <span className="text-muted-foreground">{label}: </span> : ''}{value}
      </span>
      {accepted ? (
        <span className="flex items-center gap-0.5 text-[11px] text-emerald-600 flex-shrink-0 font-medium">
          <Check className="h-3 w-3" /> Applied
        </span>
      ) : (
        <button
          type="button"
          onClick={onAccept}
          className="flex items-center gap-0.5 text-[11px] text-primary hover:text-primary/80 flex-shrink-0 font-semibold transition-colors"
        >
          Apply
        </button>
      )}
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────

export const CardDetail: React.FC<CardDetailProps> = ({ cardId, onBack, onEditCrops, onEditFolds, onPrintLabel, isNew, initialEditing, autoGenerateOg }) => {
  const [card, setCard] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showScans, setShowScans] = useState(false);
  const [isEditing, setIsEditing] = useState(!!isNew || !!initialEditing);
  const [saving, setSaving] = useState(false);
  const [uploadingScans, setUploadingScans] = useState(false);
  const scanFileInputRef = useRef<HTMLInputElement>(null);
  const [editingMetadata, setEditingMetadata] = useState(!!isNew || !!initialEditing);

  const [socialCrops, setSocialCrops] = useState<SocialCrop[]>([]);
  const [showSocialCropper, setShowSocialCropper] = useState(false);
  const [deletingCropId, setDeletingCropId] = useState<string | null>(null);
  const [socialCropScan, setSocialCropScan] = useState<ScanInfo | null>(null);

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

  const loadSocialCrops = useCallback(async () => {
    const { crops } = await fetchCropsForCard(cardId);
    if (crops) setSocialCrops(crops);
  }, [cardId]);

  useEffect(() => { loadSocialCrops(); }, [loadSocialCrops]);

  const handleDeleteCrop = useCallback(async (cropId: string) => {
    setDeletingCropId(cropId);
    await deleteSocialCrop(cropId);
    setSocialCrops((prev) => prev.filter((c) => c.id !== cropId));
    setDeletingCropId(null);
  }, []);

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

  const handleFormatChange = useCallback(async (format: 'card' | 'booklet' | 'unstructured') => {
    if (!card) return;
    const newIsBooklet = format === 'booklet';
    const newCardMode = format === 'unstructured' ? 'unstructured' : 'structured';

    const results = await Promise.all([
      card.is_booklet !== newIsBooklet ? updateBookletFlag(cardId, newIsBooklet) : { success: true },
      card.card_mode !== newCardMode ? updateCardMode(cardId, newCardMode) : { success: true },
    ]);

    const failed = results.find((r) => !r.success);
    if (failed && 'error' in failed) {
      alert(`Failed to update format: ${failed.error}`);
    } else {
      await refreshCard();
    }
  }, [cardId, card, refreshCard]);

  const handleIrregularToggle = useCallback(async () => {
    if (!card) return;
    const result = await updateIrregularFlag(cardId, !card.is_irregular);
    if (result.success) {
      await refreshCard();
    } else {
      alert(`Failed to update irregular flag: ${result.error}`);
    }
  }, [cardId, card, refreshCard]);

  const [settingOgScan, setSettingOgScan] = useState(false);
  const [cropScan, setCropScan] = useState<ScanInfo | null>(null);
  const handleSetOgScan = useCallback(async (scan: ScanInfo, croppedBlobUrl?: string) => {
    if (!card || !scan.url) return;
    setSettingOgScan(true);
    setCropScan(null);
    const ogResult = await updateOgScan(cardId, scan.id);
    if (ogResult.success) {
      const genResult = await generateAndUploadOgFromScan(cardId, croppedBlobUrl ?? scan.url);
      if (croppedBlobUrl) URL.revokeObjectURL(croppedBlobUrl);
      if (genResult.success && genResult.localUrl) {
        ogConfirmedRef.current = true;
        setOgImageUrl(genResult.localUrl);
        setOgExists(true);
      } else if (genResult.success && genResult.url) {
        ogConfirmedRef.current = true;
        setOgImageUrl(genResult.url + '?t=' + Date.now());
        setOgExists(true);
      } else {
        alert(`Failed to generate OG image: ${genResult.error}`);
      }
      await refreshCard();
    } else {
      if (croppedBlobUrl) URL.revokeObjectURL(croppedBlobUrl);
      alert(`Failed to set OG scan: ${ogResult.error}`);
    }
    setSettingOgScan(false);
  }, [cardId, card, refreshCard]);

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
  const ogConfirmedRef = useRef(false);

  useEffect(() => {
    if (!ogImageUrl) return;
    if (ogConfirmedRef.current) return;
    const img = new Image();
    img.onload = () => setOgExists(true);
    img.onerror = () => setOgExists(false);
    img.src = ogImageUrl;
  }, [ogImageUrl]);

  const handleGenerateOg = useCallback(async (secondPanel?: { panelId: string; offsetX: number }) => {
    if (!card) return;
    setGeneratingOg(true);
    const input: OgImageInput = {
      panels: card.panels,
      creases: card.creases,
      cover: card.cover,
      pivotIndex: card.pivotIndex ?? undefined,
      displayUrls: card.displayUrls,
      secondPanel,
    };
    const result = await generateAndUploadOgImage(cardId, input);
    setGeneratingOg(false);
    if (result.success) {
      ogConfirmedRef.current = true;
      setOgImageUrl(result.localUrl ?? (result.url + '?t=' + Date.now()));
      setOgExists(true);
    }
  }, [card, cardId]);

  // Auto-generate OG image when returning from fold editor
  const autoOgTriggeredRef = useRef(false);
  useEffect(() => {
    if (autoGenerateOg && card && card.panels.length > 0 && !autoOgTriggeredRef.current && !generatingOg) {
      autoOgTriggeredRef.current = true;
      handleGenerateOg();
      setTimeout(() => {
        document.getElementById('og-builder')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
  }, [autoGenerateOg, card, generatingOg, handleGenerateOg]);

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
          <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
          <p className="text-sm text-muted-foreground">Loading card...</p>
        </div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-background gap-4">
        <div className="rounded-full bg-destructive/10 p-5">
          <Info className="h-6 w-6 text-destructive/70" />
        </div>
        <div className="text-center">
          <p className="font-semibold">Could not load card</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">{error || 'Card not found.'}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onBack}>
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
  const isUnstructured = card.card_mode === 'unstructured';
  const currentFormat: 'card' | 'booklet' | 'unstructured' = isUnstructured ? 'unstructured' : card.is_booklet ? 'booklet' : 'card';
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
      <header className="flex-shrink-0 bg-card/80 backdrop-blur-sm border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
              <button
                onClick={handleBack}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 -ml-1 p-1 rounded-md hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-semibold tracking-tight truncate">
                  {card.title || 'Untitled Card'}
                </h1>
                {card.airline_name && !isEditing && (
                  <p className="text-xs text-muted-foreground truncate">{card.airline_name}{card.aircraft_label ? ` · ${card.aircraft_label}` : ''}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
              {onPrintLabel && !isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onPrintLabel}
                  className="gap-1.5 text-muted-foreground"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </Button>
              )}
              {isEditing ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setIsEditing(false); setEditingMetadata(false); }}
                  className="gap-1.5"
                >
                  Done
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="gap-1.5"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              {!isEditing && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-muted-foreground hover:text-destructive h-8 w-8"
                >
                  {deleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-8">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-8">
            <div className="min-w-0 flex flex-col gap-5">
              {isUnstructured ? (
                /* ── Unstructured card: scan gallery with OG selection ── */
                <>
                  <SetupStep
                    number={1}
                    title="Upload Scans"
                    icon={<Upload className="h-4 w-4" />}
                    complete={hasScans}
                    summary={hasScans ? `${card.scans.length} scan${card.scans.length !== 1 ? 's' : ''}` : undefined}
                  >
                    {isEditing ? (
                      <>
                        <div
                          className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-muted-foreground/15 rounded-xl cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all"
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
                      </>
                    ) : hasScans ? (
                      <p className="text-sm text-muted-foreground">{card.scans.length} scan{card.scans.length !== 1 ? 's' : ''}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground/50">No scans uploaded. Enter edit mode to add scans.</p>
                    )}
                  </SetupStep>

                  <SetupStep
                    number={2}
                    title="Format"
                    icon={<Hash className="h-4 w-4" />}
                    complete
                    summary="Nonstandard"
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-1.5">
                          {([
                            { key: 'card' as const, label: 'Card', icon: <Layers className="h-4 w-4" /> },
                            { key: 'booklet' as const, label: 'Booklet', icon: <BookOpen className="h-4 w-4" /> },
                            { key: 'unstructured' as const, label: 'Nonstandard', icon: <ImageIcon className="h-4 w-4" /> },
                          ]).map(({ key, label, icon }) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => handleFormatChange(key)}
                              className={cn(
                                'flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-all',
                                currentFormat === key
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-muted text-muted-foreground hover:border-primary/40'
                              )}
                            >
                              {icon}
                              {label}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Scans will be displayed as a gallery. No panel cropping or fold structure needed.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nonstandard (gallery)</p>
                    )}
                  </SetupStep>

                  <SetupStep
                    number={3}
                    title="Select Cover Image"
                    icon={<Star className="h-4 w-4" />}
                    complete={ogExists}
                    disabled={!hasScans}
                    summary={ogExists ? 'OG image set' : undefined}
                  >
                    {hasScans ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {card.scans.map((scan) => (
                          <button
                            key={scan.id}
                            type="button"
                            onClick={() => isEditing && setCropScan(scan)}
                            disabled={!isEditing || settingOgScan}
                            className={cn(
                              'relative group rounded-lg overflow-hidden border-2 transition-all aspect-square',
                              isEditing ? 'cursor-pointer hover:border-primary/40' : 'cursor-default',
                              'border-muted',
                            )}
                          >
                            {(scan.thumbnailUrl || scan.url) ? (
                              <img
                                src={scan.thumbnailUrl ?? scan.url!}
                                alt={scan.original_filename ?? 'Scan'}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-muted">
                                <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                              </div>
                            )}
                            {isEditing && (
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <div className="bg-black/60 rounded-full p-2">
                                  <Star className="h-4 w-4 text-white" />
                                </div>
                              </div>
                            )}
                          </button>
                        ))}
                        {settingOgScan && (
                          <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground/50">Upload scans first</p>
                    )}
                  </SetupStep>

                  {ogExists && ogImageUrl && (
                    <OgAccordion ogImageUrl={ogImageUrl} />
                  )}

                  {cropScan && cropScan.url && (
                    <OgScanCropper
                      scanUrl={cropScan.url}
                      scanLabel={cropScan.original_filename ?? 'Scan'}
                      generating={settingOgScan}
                      onGenerate={(croppedBlobUrl) => handleSetOgScan(cropScan, croppedBlobUrl)}
                      onCancel={() => setCropScan(null)}
                    />
                  )}

                  <div className="rounded-lg border bg-muted/30 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ImageIcon className="h-4 w-4 flex-shrink-0" />
                      <span>Nonstandard format — scans displayed as gallery on the public page</span>
                    </div>
                  </div>

                  {/* ── Social Crops (unstructured) ────────────── */}
                  {hasScans && (
                    <SocialCropsScanSection
                      crops={socialCrops}
                      scans={card.scans}
                      isEditing={isEditing}
                      deletingCropId={deletingCropId}
                      onPickScan={(scan) => {
                        setSocialCropScan(scan);
                        setShowSocialCropper(true);
                      }}
                      onDeleteCrop={handleDeleteCrop}
                    />
                  )}
                </>
              ) : (
              /* ── Structured card: full panel/crop/fold pipeline ── */
              <>
              {allCropsComplete && (
                card.is_booklet ? (
                <BookletVisualizer
                  panels={card.panels}
                  cover={card.cover}
                />
                ) : (
                <CardVisualizer3D
                  panels={card.panels}
                  creases={card.creases}
                  cover={card.cover}
                  pivotIndex={card.pivotIndex ?? undefined}
                />
                )
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
                      className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-muted-foreground/15 rounded-xl cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all"
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
                          <div key={scan.id} className="flex items-center gap-1.5 rounded-lg border bg-card overflow-hidden" title={scan.original_filename ?? 'Scan'}>
                            {(scan.thumbnailUrl || scan.url) ? (
                              <img
                                src={scan.thumbnailUrl ?? scan.url!}
                                alt={scan.original_filename ?? 'Scan'}
                                className="h-10 w-10 object-cover flex-shrink-0"
                                loading="lazy"
                                onError={(e) => {
                                  const img = e.currentTarget;
                                  if (scan.url && img.src !== scan.url) img.src = scan.url;
                                }}
                                onLoad={(e) => {
                                  const img = e.currentTarget;
                                  if (img.naturalWidth === 0 && scan.url && img.src !== scan.url) img.src = scan.url;
                                }}
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

              {/* ── Step 2: Format + Panel Count ─────────────────────── */}
              <SetupStep
                number={2}
                title="Format"
                icon={<Hash className="h-4 w-4" />}
                complete={hasScans}
                disabled={!hasScans}
                summary={hasScans ? (isUnstructured ? 'Nonstandard' : card.is_booklet ? `Booklet · ${panelCount} pages${card.is_irregular ? ' · irregular' : ''}` : `Card · ${panelCount} panels${card.is_irregular ? ' · irregular' : ''}`) : undefined}
              >
                {isEditing ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-1.5">
                      {([
                        { key: 'card' as const, label: 'Card', icon: <Layers className="h-4 w-4" /> },
                        { key: 'booklet' as const, label: 'Booklet', icon: <BookOpen className="h-4 w-4" /> },
                        { key: 'unstructured' as const, label: 'Nonstandard', icon: <ImageIcon className="h-4 w-4" /> },
                      ]).map(({ key, label, icon }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleFormatChange(key)}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-all',
                            currentFormat === key
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-muted text-muted-foreground hover:border-primary/40'
                          )}
                        >
                          {icon}
                          {label}
                        </button>
                      ))}
                    </div>
                    {currentFormat !== 'unstructured' && (
                    <>
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
                      <span className="text-sm text-muted-foreground">
                        {card.is_booklet ? `page${panelCount !== 1 ? 's' : ''} (${panelCount * 2} faces)` : 'panels per side'}
                      </span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer self-start">
                      <input
                        type="checkbox"
                        checked={card.is_irregular}
                        onChange={handleIrregularToggle}
                        className="rounded border-border"
                      />
                      <span className="text-sm text-muted-foreground">Irregular fold</span>
                    </label>
                    {card.is_irregular && (
                      <p className="text-xs text-muted-foreground -mt-1">
                        Skips 3D visualizer — visitors go straight to lightbox view.
                      </p>
                    )}
                    </>
                    )}
                    {currentFormat === 'unstructured' && (
                      <p className="text-xs text-muted-foreground">
                        Scans will be displayed as a gallery. No panel cropping or fold structure needed.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {isUnstructured ? 'Nonstandard (gallery)' : card.is_booklet ? `${panelCount} pages (booklet)${card.is_irregular ? ' · irregular' : ''}` : `${panelCount} panels per side${card.is_irregular ? ' · irregular' : ''}`}
                  </p>
                )}
              </SetupStep>

              {/* ── Step 3: Panel Spreads / Crops ────────────────── */}
              <SetupStep
                id="spreads"
                number={3}
                title={card.is_booklet ? 'Pages' : 'Panel Spreads'}
                icon={<Scissors className="h-4 w-4" />}
                complete={allCropsComplete}
                disabled={!hasScans}
                summary={hasPanels ? `${card.panels.length} of ${panelCount * 2} ${card.is_booklet ? 'faces' : 'panels'} cropped` : undefined}
              >
                {hasScans ? (
                  card.is_booklet ? (
                    <BookletSpreadLayout
                      frontPanels={frontPanels}
                      backPanels={backPanels}
                      expectedCount={panelsPerSide}
                      displayUrls={card.displayUrls}
                      fullUrls={card.fullUrls}
                      savingSlot={savingSlot}
                      onZoom={setLightboxUrl}
                      isEditing={isEditing}
                      onEditCrops={onEditCrops}
                    />
                  ) : (
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
                    <div className="my-2" />
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
                  )
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

              {isEditing && card.panels.length > 0 && (
                <OgBuilder
                  id="og-builder"
                  defaultOpen={!!autoGenerateOg}
                  panels={card.panels}
                  cover={card.cover}
                  displayUrls={card.displayUrls}
                  ogImageUrl={ogImageUrl}
                  ogExists={ogExists}
                  generatingOg={generatingOg}
                  onGenerate={handleGenerateOg}
                />
              )}
              {!isEditing && ogExists && ogImageUrl && (
                <OgAccordion ogImageUrl={ogImageUrl} />
              )}

              {/* ── Social Crops ────────────────────────────────── */}
              {hasPanels && (
                <SocialCropsSection
                  crops={socialCrops}
                  isEditing={isEditing}
                  deletingCropId={deletingCropId}
                  onOpenCropper={() => setShowSocialCropper(true)}
                  onDeleteCrop={handleDeleteCrop}
                />
              )}
              </>
              )}
            </div>

            <div className="flex flex-col gap-5">
              {editingMetadata ? (
                <MetadataEditor
                  card={card}
                  onSave={(update) => { handleSaveMetadata(update); setEditingMetadata(false); }}
                  onCancel={() => setEditingMetadata(false)}
                  saving={saving}
                  scanUrls={
                    Object.values(card.displayUrls).length > 0
                      ? Object.values(card.displayUrls)
                      : card.scans.map((s) => s.url).filter((u): u is string => u !== null)
                  }
                  resizeForAi={isUnstructured}
                />
              ) : (
                <div className="rounded-xl border bg-card overflow-hidden">
                  {isEditing && (
                    <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border/50">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Card Details</span>
                      <button onClick={() => setEditingMetadata(true)} className="text-muted-foreground hover:text-foreground p-0.5">
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  )}
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
                    <div className="px-4 py-3 border-t border-border/50">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                      <p className="text-sm leading-relaxed text-foreground/80">{card.notes}</p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2.5">Provenance & Pricing</p>
                {card.provenance.length > 0 ? (
                  <ProvenanceCard
                    entry={card.provenance[0]}
                    cardId={cardId}
                    isEditing={isEditing}
                    onDelete={isEditing ? async () => {
                      await deleteProvenanceEntry(card.provenance[0].id);
                      refreshCard();
                    } : undefined}
                    onUpdated={refreshCard}
                  />
                ) : isEditing ? (
                  <ProvenanceForm
                    cardId={cardId}
                    onSaved={refreshCard}
                    onCancel={() => setIsEditing(false)}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground/60 italic">No provenance or pricing recorded</p>
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

      {showSocialCropper && card && card.card_mode !== 'unstructured' && (
        <SocialCropper
          mode="panels"
          cardId={cardId}
          cardDetail={card}
          onCropSaved={(crop) => {
            setSocialCrops((prev) => [crop, ...prev]);
            setShowSocialCropper(false);
          }}
          onClose={() => setShowSocialCropper(false)}
        />
      )}

      {showSocialCropper && card && card.card_mode === 'unstructured' && socialCropScan && (
        <SocialCropper
          mode="scan"
          cardId={cardId}
          scanUrl={socialCropScan.url!}
          scanId={socialCropScan.id}
          onCropSaved={(crop) => {
            setSocialCrops((prev) => [crop, ...prev]);
            setShowSocialCropper(false);
            setSocialCropScan(null);
          }}
          onClose={() => { setShowSocialCropper(false); setSocialCropScan(null); }}
        />
      )}
    </div>
  );
};

// ─── Social Crops Section ────────────────────────────────────────

const SocialCropsSection: React.FC<{
  crops: SocialCrop[];
  isEditing: boolean;
  deletingCropId: string | null;
  onOpenCropper: () => void;
  onDeleteCrop: (id: string) => void;
}> = ({ crops, isEditing, deletingCropId, onOpenCropper, onDeleteCrop }) => {
  const [open, setOpen] = useState(crops.length > 0 || isEditing);

  function derivativePublicUrl(filePath: string): string {
    const { data } = supabase.storage.from('derivatives').getPublicUrl(filePath);
    return data.publicUrl;
  }

  return (
    <section className="border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 w-full px-4 py-3 text-left"
      >
        <div className={cn(
          'flex items-center justify-center w-5 h-5 text-[10px] font-semibold flex-shrink-0 transition-colors',
          crops.length > 0
            ? 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20'
            : 'bg-muted text-muted-foreground'
        )}>
          {crops.length > 0 ? <Check className="h-3 w-3" /> : <CropIcon className="h-3 w-3" />}
        </div>
        <span className="text-muted-foreground flex-shrink-0"><CropIcon className="h-4 w-4" /></span>
        <span className="text-sm font-medium flex-1 min-w-0 truncate">Social Crops</span>
        {crops.length > 0 && (
          <span className="text-[11px] text-muted-foreground/70 flex-shrink-0 tabular-nums">
            {crops.length} saved
          </span>
        )}
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0">
          {crops.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
              {crops.map((crop) => (
                <div key={crop.id} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                  <img
                    src={derivativePublicUrl(crop.crop_image_path)}
                    alt={crop.label ?? 'Social crop'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => onDeleteCrop(crop.id)}
                      disabled={deletingCropId === crop.id}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all"
                    >
                      {deletingCropId === crop.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {isEditing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenCropper}
              className="gap-1.5"
            >
              <CropIcon className="h-3.5 w-3.5" />
              {crops.length > 0 ? 'Add another crop' : 'Select a crop'}
            </Button>
          ) : crops.length === 0 ? (
            <p className="text-sm text-muted-foreground/50">
              No social crops saved. Enter edit mode to select dramatic scenes for social media.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
};

// ─── Social Crops Scan Section (for unstructured cards) ──────────

const SocialCropsScanSection: React.FC<{
  crops: SocialCrop[];
  scans: ScanInfo[];
  isEditing: boolean;
  deletingCropId: string | null;
  onPickScan: (scan: ScanInfo) => void;
  onDeleteCrop: (id: string) => void;
}> = ({ crops, scans, isEditing, deletingCropId, onPickScan, onDeleteCrop }) => {
  const [open, setOpen] = useState(crops.length > 0 || isEditing);

  function derivativePublicUrl(filePath: string): string {
    const { data } = supabase.storage.from('derivatives').getPublicUrl(filePath);
    return data.publicUrl;
  }

  const scansWithUrls = scans.filter((s) => s.url);

  return (
    <section className="border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 w-full px-4 py-3 text-left"
      >
        <div className={cn(
          'flex items-center justify-center w-5 h-5 text-[10px] font-semibold flex-shrink-0 transition-colors',
          crops.length > 0
            ? 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20'
            : 'bg-muted text-muted-foreground'
        )}>
          {crops.length > 0 ? <Check className="h-3 w-3" /> : <CropIcon className="h-3 w-3" />}
        </div>
        <span className="text-muted-foreground flex-shrink-0"><CropIcon className="h-4 w-4" /></span>
        <span className="text-sm font-medium flex-1 min-w-0 truncate">Social Crops</span>
        {crops.length > 0 && (
          <span className="text-[11px] text-muted-foreground/70 flex-shrink-0 tabular-nums">
            {crops.length} saved
          </span>
        )}
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0">
          {crops.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
              {crops.map((c) => (
                <div key={c.id} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                  <img
                    src={derivativePublicUrl(c.crop_image_path)}
                    alt={c.label ?? 'Social crop'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => onDeleteCrop(c.id)}
                      disabled={deletingCropId === c.id}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all"
                    >
                      {deletingCropId === c.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {isEditing ? (
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                Pick a scan to crop a social media image from:
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {scansWithUrls.map((scan) => (
                  <button
                    key={scan.id}
                    type="button"
                    onClick={() => onPickScan(scan)}
                    className="group relative aspect-square rounded-lg overflow-hidden border-2 border-muted hover:border-primary/40 transition-all bg-muted"
                  >
                    <img
                      src={scan.thumbnailUrl ?? scan.url!}
                      alt={scan.original_filename ?? 'Scan'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="bg-black/60 rounded-full p-2">
                        <CropIcon className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : crops.length === 0 ? (
            <p className="text-sm text-muted-foreground/50">
              No social crops saved. Enter edit mode to select dramatic scenes for social media.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
};

// ─── OG Image Accordion (read-only) ─────────────────────────────

const OgAccordion: React.FC<{ ogImageUrl: string }> = ({ ogImageUrl }) => {
  const [open, setOpen] = useState(false);
  return (
    <section className="border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left"
      >
        <span className="text-sm font-medium flex-1">OG Image</span>
        <span className="text-[11px] text-muted-foreground/70 flex-shrink-0">Generated</span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div className="border bg-card overflow-hidden max-w-[280px]">
            <img src={ogImageUrl} alt="Generated Open Graph image" className="w-full h-auto" />
          </div>
        </div>
      )}
    </section>
  );
};

// ─── Metadata Table ──────────────────────────────────────────────

const MetadataTable: React.FC<{
  items: { label: string; value: string | null | undefined }[];
}> = ({ items }) => {
  const visible = items.filter((i) => i.value);
  if (visible.length === 0) return null;
  return (
    <>
      {visible.map((item, i) => (
        <div key={item.label} className={cn(
          'flex items-baseline justify-between px-4 py-3',
          i < visible.length - 1 && 'border-b border-border/50'
        )}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{item.label}</span>
          <span className="text-sm font-medium text-right max-w-[60%] truncate">{item.value}</span>
        </div>
      ))}
    </>
  );
};

// ─── Metadata Editor ─────────────────────────────────────────────

const INPUT_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 placeholder:text-muted-foreground/40 transition-colors';

interface AircraftRow {
  modelId: string;
  modelName: string;
  variantIds: string[];
  variantNames: string[];
}

interface MetadataEditorProps {
  card: CardDetailData;
  onSave: (update: CardMetadataUpdate) => void;
  onCancel: () => void;
  saving: boolean;
  scanUrls: string[];
  resizeForAi?: boolean;
}

const MetadataEditor: React.FC<MetadataEditorProps> = ({ card, onSave, onCancel, saving, scanUrls, resizeForAi }) => {
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
          variantIds: a.variants.map((v) => v.id),
          variantNames: a.variants.map((v) => v.name),
        }))
      : [{ modelId: '', modelName: '', variantIds: [], variantNames: [] }]
  );
  const [languages, setLanguages] = useState<string[]>(card.languages);
  const [langInput, setLangInput] = useState('');
  const [publishedYear, setPublishedYear] = useState<string>(
    card.published_year != null ? String(card.published_year) : ''
  );
  const [revision, setRevision] = useState(card.revision ?? '');
  const [notes, setNotes] = useState(card.notes ?? '');

  const [analyzing, setAnalyzing] = useState(false);

  const storageKey = `ai-suggestions-${card.id}`;
  const [suggestions, setSuggestions] = useState<CardSuggestions | null>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [acceptedFields, setAcceptedFields] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem(`${storageKey}-accepted`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  // Persist suggestions to sessionStorage so they survive navigation
  useEffect(() => {
    if (suggestions) {
      sessionStorage.setItem(storageKey, JSON.stringify(suggestions));
    } else {
      sessionStorage.removeItem(storageKey);
    }
  }, [suggestions, storageKey]);

  useEffect(() => {
    if (acceptedFields.size > 0) {
      sessionStorage.setItem(`${storageKey}-accepted`, JSON.stringify([...acceptedFields]));
    } else {
      sessionStorage.removeItem(`${storageKey}-accepted`);
    }
  }, [acceptedFields, storageKey]);

  const handleAnalyze = useCallback(async () => {
    if (scanUrls.length === 0) return;
    setAnalyzing(true);
    setSuggestions(null);
    setAcceptedFields(new Set());
    const result = await analyzeCardScans(scanUrls, { resizeForAi });
    setAnalyzing(false);
    if (result.suggestions) {
      const normalized = {
        ...result.suggestions,
        aircraft: result.suggestions.aircraft?.map((a) => ({
          ...a,
          variant: a.variant?.replace(/^-+/, '').trim() || null,
        })) ?? [],
      };
      if (normalized.suggested_title && !normalized.airline && !normalized.aircraft?.some((a) => a.model)) {
        normalized.suggested_title = null;
      }
      setSuggestions(normalized);
    } else {
      alert(`AI analysis failed: ${result.error}`);
    }
  }, [scanUrls, resizeForAi]);

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

  const [loadingVariants, setLoadingVariants] = useState<Set<string>>(new Set());

  const loadVariants = useCallback(async (modelId: string) => {
    if (variantsByModel[modelId]) return;
    setLoadingVariants((prev) => new Set(prev).add(modelId));
    try {
      const items = await fetchVariants(modelId);
      setVariantsByModel((prev) => ({
        ...prev,
        [modelId]: items.map((i) => ({ value: i.id, label: i.name })),
      }));
    } finally {
      setLoadingVariants((prev) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    }
  }, [variantsByModel]);

  useEffect(() => {
    for (const row of aircraftRows) {
      if (row.modelId && !variantsByModel[row.modelId]) {
        loadVariants(row.modelId);
      }
    }
  }, [aircraftRows, variantsByModel, loadVariants]);

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
        variantIds: r.variantIds,
      })),
      languages,
      publishedYear: year && !isNaN(year) ? year : null,
      revision: revision.trim() || null,
      notes: notes.trim() || null,
    });
  };

  const acceptAirline = useCallback(async () => {
    if (!suggestions?.airline) return;
    const suggestion = suggestions.airline.toLowerCase();

    // 1. Exact match
    let match = airlines.find((a) => a.label.toLowerCase() === suggestion);

    // 2. Substring match: AI suggestion contains an existing name or vice versa
    if (!match) {
      const scored = airlines
        .map((a) => {
          const label = a.label.toLowerCase();
          if (suggestion.includes(label) || label.includes(suggestion)) {
            return { option: a, score: Math.abs(label.length - suggestion.length) };
          }
          return null;
        })
        .filter(Boolean) as { option: ComboboxOption; score: number }[];
      scored.sort((a, b) => a.score - b.score);
      if (scored.length > 0) match = scored[0].option;
    }

    if (match) {
      setAirlineId(match.value);
    } else {
      const item = await createAirline(suggestions.airline);
      setAirlines((prev) => [...prev, { value: item.id, label: item.name }]);
      setAirlineId(item.id);
    }
    setAcceptedFields((prev) => new Set(prev).add('airline'));
  }, [suggestions, airlines]);

  const acceptManufacturer = useCallback(async () => {
    if (!suggestions?.aircraft?.length) return;
    const firstMfr = suggestions.aircraft.find((a) => a.manufacturer)?.manufacturer;
    if (!firstMfr) return;
    const mfrMatch = manufacturers.find((m) => m.label.toLowerCase() === firstMfr.toLowerCase());
    if (mfrMatch) {
      setManufacturerId(mfrMatch.value);
    } else {
      const item = await createManufacturer(firstMfr);
      setManufacturers((prev) => [...prev, { value: item.id, label: item.name }]);
      setManufacturerId(item.id);
    }
    setAcceptedFields((prev) => new Set(prev).add('manufacturer'));
  }, [suggestions, manufacturers]);

  const acceptModels = useCallback(async () => {
    if (!suggestions?.aircraft?.length) return;

    let mfrId = manufacturerId;
    if (!mfrId) {
      const firstMfr = suggestions.aircraft.find((a) => a.manufacturer)?.manufacturer;
      if (!firstMfr) return;
      const mfrMatch = manufacturers.find((m) => m.label.toLowerCase() === firstMfr.toLowerCase());
      if (mfrMatch) {
        mfrId = mfrMatch.value;
      } else {
        const item = await createManufacturer(firstMfr);
        setManufacturers((prev) => [...prev, { value: item.id, label: item.name }]);
        mfrId = item.id;
      }
      setManufacturerId(mfrId);
      setAcceptedFields((prev) => new Set(prev).add('manufacturer'));
    }

    const rowsByModel = new Map<string, typeof aircraftRows[number]>();
    for (const a of suggestions.aircraft) {
      if (!a.model) continue;
      const key = a.model.toLowerCase();
      if (rowsByModel.has(key)) continue;
      const modelMatch = models.find((m) => m.label.toLowerCase() === key);
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
      rowsByModel.set(key, { modelId, modelName, variantIds: [], variantNames: [] });
    }
    const rows = [...rowsByModel.values()];
    if (rows.length > 0) setAircraftRows(rows);
    setAcceptedFields((prev) => new Set(prev).add('models'));
  }, [suggestions, manufacturerId, manufacturers, models]);

  const acceptVariants = useCallback(async () => {
    if (!suggestions?.aircraft?.length) return;
    try {
      const variantUpdates: Array<{ rowIdx: number; varId: string; varName: string }> = [];

      for (let si = 0; si < suggestions.aircraft.length; si++) {
        const a = suggestions.aircraft[si];
        if (!a.variant) continue;
        const variantText = a.variant.replace(/^-+/, '').trim();
        if (!variantText) continue;

        const currentRows = aircraftRows;
        let rowIdx = -1;
        if (a.model) {
          rowIdx = currentRows.findIndex(
            (r) => r.modelId && r.modelName.toLowerCase().trim() === a.model!.toLowerCase().trim()
          );
        }
        if (rowIdx === -1 && si < currentRows.length && currentRows[si].modelId) {
          rowIdx = si;
        }
        if (rowIdx === -1) continue;

        const row = currentRows[rowIdx];
        let existingVariants = variantsByModel[row.modelId];
        if (!existingVariants) {
          const items = await fetchVariants(row.modelId);
          existingVariants = items.map((i) => ({ value: i.id, label: i.name }));
          setVariantsByModel((prev) => ({ ...prev, [row.modelId]: existingVariants! }));
        }

        const varMatch = existingVariants.find(
          (v) => v.label.toLowerCase().trim() === variantText.toLowerCase()
        );
        let varId: string;
        let varName: string;
        if (varMatch) {
          varId = varMatch.value;
          varName = varMatch.label;
        } else {
          const item = await createVariant(row.modelId, variantText);
          existingVariants = [...existingVariants, { value: item.id, label: item.name }];
          setVariantsByModel((prev) => ({ ...prev, [row.modelId]: existingVariants! }));
          varId = item.id;
          varName = item.name;
        }

        variantUpdates.push({ rowIdx, varId, varName });
      }

      if (variantUpdates.length > 0) {
        setAircraftRows((prev) => {
          const next = [...prev];
          for (const { rowIdx, varId, varName } of variantUpdates) {
            const row = next[rowIdx];
            if (row && !row.variantIds.includes(varId)) {
              next[rowIdx] = {
                ...row,
                variantIds: [...row.variantIds, varId],
                variantNames: [...row.variantNames, varName],
              };
            }
          }
          return next;
        });
      }
      setAcceptedFields((prev) => new Set(prev).add('variants'));
    } catch (err) {
      console.error('Failed to apply variant suggestions:', err);
      alert(`Failed to apply variant: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [suggestions, aircraftRows, variantsByModel]);

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      {scanUrls.length > 0 && (
        <div>
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
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-primary/20 bg-primary/5 p-3 w-full">
              <Loader2 className="h-4 w-4 animate-spin text-primary/60" />
              <span className="text-sm text-primary/70">Analyzing card scans...</span>
            </div>
          )}
          {suggestions && (
            <div className="flex items-center justify-between w-full rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
              <p className="text-xs font-medium text-primary/70 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> AI suggestions ready
              </p>
              <button
                onClick={() => setSuggestions(null)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
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
              setAircraftRows([{ modelId: '', modelName: '', variantIds: [], variantNames: [] }]);
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
            value={suggestions?.aircraft?.find((a) => a.manufacturer)?.manufacturer ?? undefined}
            accepted={acceptedFields.has('manufacturer')}
            onAccept={acceptManufacturer}
          />
        </EditorField>

        <EditorField label="Aircraft">
          <div className="flex flex-col gap-2">
            {aircraftRows.map((row, idx) => {
              const matchedSuggestion = suggestions?.aircraft?.[idx]
                ?? suggestions?.aircraft?.find(
                  (a) => a.model && row.modelName && a.model.toLowerCase() === row.modelName.toLowerCase()
                );
              const suggestedVariant = matchedSuggestion?.variant?.replace(/^-+/, '').trim() || null;
              return (
                <div key={idx} className="flex flex-col gap-1.5 border border-border/60 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1">
                      <Combobox
                        options={models}
                        value={row.modelId || null}
                        onChange={(value, label) => {
                          updateAircraftRow(idx, { modelId: value, modelName: label, variantIds: [], variantNames: [] });
                          loadVariants(value);
                        }}
                        onCreateNew={manufacturerId ? async (name) => {
                          const item = await createModel(manufacturerId, name);
                          setModels((prev) => [...prev, { value: item.id, label: item.name }]);
                          return { value: item.id, label: item.name };
                        } : undefined}
                        placeholder="Model..."
                        searchPlaceholder="Search models..."
                        disabled={!manufacturerId}
                      />
                    </div>
                    {aircraftRows.length > 1 && (
                      <button className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0" onClick={() => removeAircraftRow(idx)}>
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {row.modelId && (
                  <div className="flex flex-col gap-1.5 pl-3 border-l-2 border-border/40">
                    {row.variantIds.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {row.variantIds.map((vid, vi) => (
                              <span key={vid} className="inline-flex items-center gap-1 bg-primary/5 text-primary/80 px-2.5 py-0.5 text-xs font-medium">
                            {row.variantNames[vi] || vid}
                            <button
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => updateAircraftRow(idx, {
                                variantIds: row.variantIds.filter((_, j) => j !== vi),
                                variantNames: row.variantNames.filter((_, j) => j !== vi),
                              })}
                            >
                              <XIcon className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <Combobox
                      options={(variantsByModel[row.modelId] ?? []).filter((o) => !row.variantIds.includes(o.value))}
                      value={null}
                      onChange={(value, label) => updateAircraftRow(idx, {
                        variantIds: [...row.variantIds, value],
                        variantNames: [...row.variantNames, label],
                      })}
                      onCreateNew={row.modelId ? async (name) => {
                        const item = await createVariant(row.modelId, name);
                        setVariantsByModel((prev) => ({
                          ...prev,
                          [row.modelId]: [...(prev[row.modelId] ?? []), { value: item.id, label: item.name }],
                        }));
                        return { value: item.id, label: item.name };
                      } : undefined}
                      placeholder={loadingVariants.has(row.modelId) ? 'Loading variants...' : 'Variant (optional)...'}
                      searchPlaceholder="Search variants..."
                      disabled={loadingVariants.has(row.modelId)}
                    />
                    {suggestedVariant && (
                      <InlineSuggestion
                        value={suggestedVariant}
                        label="Variant"
                        accepted={acceptedFields.has('variants')}
                        onAccept={acceptVariants}
                      />
                    )}
                  </div>
                  )}
                  {!row.modelId && suggestedVariant && (
                    <p className="text-[10px] text-muted-foreground/60 italic pl-1">Apply a model first to add variant</p>
                  )}
                </div>
              );
            })}
            <InlineSuggestion
              value={suggestions?.aircraft?.length
                ? suggestions.aircraft.map((a) => a.model).filter(Boolean).join(', ')
                : undefined}
              accepted={acceptedFields.has('models')}
              onAccept={acceptModels}
            />
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setAircraftRows((prev) => [...prev, { modelId: '', modelName: '', variantIds: [], variantNames: [] }])}
            >
              <Plus className="h-3 w-3" /> Add aircraft
            </button>
          </div>
        </EditorField>

        <EditorField label="Languages">
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {languages.map((lang) => (
              <span key={lang} className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5 text-xs font-medium">
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

      <div className="flex gap-2 pt-2 border-t mt-1">
        <Button size="sm" onClick={handleSubmit} disabled={saving} className="flex-1 gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving} className="text-muted-foreground">
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
    className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide
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
  const count = Math.max(expectedCount, panels.length);
  const slots = Array.from({ length: count }, (_, rawI) => {
    const panelIndex = side === 'back' ? count - 1 - rawI : rawI;
    return { panel: panels.find((p) => p.panel_index === panelIndex) ?? null, panelIndex };
  });

  const referenceHeight = panels.find((p) => p.height_px)?.height_px ?? null;

  const getFlexWeight = (panelIndex: number): number => {
    if (referenceHeight) {
      const panel = panels.find((p) => p.panel_index === panelIndex);
      const w = panel?.width_px;
      if (w) return w / referenceHeight;
      const anyWidth = panels.find((p) => p.width_px)?.width_px;
      if (anyWidth) return anyWidth / referenceHeight;
    }
    return 3 / 4;
  };

  const totalAspect = slots.reduce((sum, { panelIndex }) => sum + getFlexWeight(panelIndex), 0);

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <h2 className="text-xs font-medium">
          {label}
        </h2>
        {side === 'back' && (
          <span className="text-[10px] text-muted-foreground">
            (flipped)
          </span>
        )}
      </div>
      <div
        className="flex items-stretch gap-0 overflow-x-auto pb-1"
        style={{ aspectRatio: `${totalAspect} / 1`, maxHeight: 200 }}
      >
        {slots.map(({ panel, panelIndex }) => {
          const displayUrl = panel ? (displayUrls[panel.id] || panel.thumbnail_url) : null;
          const fullUrl = panel ? (fullUrls[panel.id] || displayUrl) : null;
          const isSavingThis = savingSlot?.panelIndex === panelIndex && savingSlot?.side === side;
          const isProcessing = (!!panel && !displayUrl) || isSavingThis;
          const weight = getFlexWeight(panelIndex);

          return (
            <div
              key={panel?.id ?? `empty-${panelIndex}`}
              className="relative group"
              style={{ flex: `${weight} 0 0%` }}
            >
              <div
                className={cn(
                  'relative rounded-lg overflow-hidden border-2 transition-all h-full',
                  (displayUrl && !isSavingThis) ? 'border-muted' : 'border-dashed border-muted-foreground/20',
                  isEditing && onEditCrops && 'cursor-pointer hover:border-primary/40',
                )}
                onClick={isEditing && onEditCrops ? () => onEditCrops(panelIndex, side) : undefined}
              >
                {displayUrl && !isSavingThis ? (
                  <>
                    <img
                      src={displayUrl}
                      alt={`${label} Panel ${panelIndex + 1}`}
                      className="w-full h-full object-contain bg-muted/30 block"
                      loading="lazy"
                    />
                    {isEditing && onEditCrops ? (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors
                                     flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Scissors className="h-3.5 w-3.5 text-white" />
                      </div>
                    ) : fullUrl ? (
                      <button
                        onClick={() => onZoom(fullUrl)}
                        className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors
                                   flex items-center justify-center opacity-0 group-hover:opacity-100"
                      >
                        <ZoomIn className="h-3.5 w-3.5 text-white" />
                      </button>
                    ) : null}
                  </>
                ) : isProcessing ? (
                  <div className="absolute inset-0 flex items-center justify-center animate-pulse">
                    <Loader2 className="h-4 w-4 text-muted-foreground/50 animate-spin" />
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Scissors className="h-3.5 w-3.5 text-muted-foreground/30" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Booklet Spread Layout ───────────────────────────────────────

interface BookletSpreadLayoutProps {
  frontPanels: Panel[];
  backPanels: Panel[];
  expectedCount: number;
  displayUrls: Record<string, string>;
  fullUrls: Record<string, string>;
  savingSlot?: { panelIndex: number; side: string } | null;
  onZoom: (url: string) => void;
  isEditing?: boolean;
  onEditCrops?: (panelIndex: number, side: string) => void;
}

const BookletSpreadLayout: React.FC<BookletSpreadLayoutProps> = ({
  frontPanels,
  backPanels,
  expectedCount,
  displayUrls,
  fullUrls,
  savingSlot,
  onZoom,
  isEditing,
  onEditCrops,
}) => {
  const pageCount = expectedCount;

  const getPanel = (index: number, side: 'front' | 'back') => {
    const panels = side === 'front' ? frontPanels : backPanels;
    return panels.find((p) => p.panel_index === index) ?? null;
  };

  const renderCell = (panelIndex: number, side: 'front' | 'back', label: string) => {
    const panel = getPanel(panelIndex, side);
    const displayUrl = panel ? (displayUrls[panel.id] || panel.thumbnail_url) : null;
    const fullUrl = panel ? (fullUrls[panel.id] || displayUrl) : null;
    const isSavingThis = savingSlot?.panelIndex === panelIndex && savingSlot?.side === side;
    const isProcessing = (!!panel && !displayUrl) || isSavingThis;

    return (
      <div
        key={`${side}-${panelIndex}`}
        className={cn(
          'relative group rounded-md overflow-hidden transition-all',
          (displayUrl && !isSavingThis) ? 'bg-muted/50' : 'bg-muted/20 border-2 border-dashed border-muted-foreground/15',
          isEditing && onEditCrops && 'cursor-pointer hover:ring-2 hover:ring-primary/40',
        )}
        style={{ maxHeight: 120 }}
        onClick={isEditing && onEditCrops ? () => onEditCrops(panelIndex, side) : undefined}
      >
        {displayUrl && !isSavingThis ? (
          <>
            <img src={displayUrl} alt={label} className="w-full h-full object-contain block" style={{ maxHeight: 120 }} loading="lazy" />
            {isEditing && onEditCrops ? (
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div className="bg-black/60 rounded-full p-2"><Scissors className="h-4 w-4 text-white" /></div>
              </div>
            ) : fullUrl ? (
              <button
                onClick={() => onZoom(fullUrl)}
                className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
              >
                <div className="bg-black/60 rounded-full p-2"><ZoomIn className="h-4 w-4 text-white" /></div>
              </button>
            ) : null}
          </>
        ) : isProcessing ? (
          <div className="flex flex-col items-center justify-center gap-2 animate-pulse" style={{ height: 120 }}>
            <Loader2 className="h-5 w-5 text-muted-foreground/50 animate-spin" />
            <span className="text-[11px] text-muted-foreground/50">Processing...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1.5" style={{ height: 120 }}>
            {isEditing && onEditCrops ? (
              <><Scissors className="h-4 w-4 text-muted-foreground/40" /><span className="text-xs text-muted-foreground/60">Crop</span></>
            ) : (
              <span className="text-xs text-muted-foreground">{label}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  // Build booklet page order:
  // Front cover: page 1 front (alone)
  // Interior spreads: page 1 back + page 2 front, page 2 back + page 3 front, ...
  // Back cover: last page back (alone)

  type SpreadEntry =
    | { type: 'single'; label: string; panelIndex: number; side: 'front' | 'back' }
    | { type: 'pair'; label: string; left: { panelIndex: number; side: 'front' | 'back'; label: string }; right: { panelIndex: number; side: 'front' | 'back'; label: string } };

  const spreads: SpreadEntry[] = [];

  // Front cover
  spreads.push({ type: 'single', label: 'Cover', panelIndex: 0, side: 'front' });

  // Interior spreads
  for (let i = 0; i < pageCount - 1; i++) {
    spreads.push({
      type: 'pair',
      label: `Spread ${i + 1}`,
      left: { panelIndex: i, side: 'back', label: `Page ${i + 1} back` },
      right: { panelIndex: i + 1, side: 'front', label: `Page ${i + 2} front` },
    });
  }

  // Back cover
  spreads.push({ type: 'single', label: 'Back Cover', panelIndex: pageCount - 1, side: 'back' });

  return (
    <div className="flex flex-col gap-3">
      {spreads.map((spread, idx) => (
        <div key={idx}>
          <h2 className="text-xs font-medium text-muted-foreground/60 mb-1">{spread.label}</h2>
          {spread.type === 'single' ? (
            <div className="flex gap-1.5">
              <div style={{ width: 74 }}>{renderCell(spread.panelIndex, spread.side, spread.label)}</div>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <div style={{ width: 74 }}>{renderCell(spread.left.panelIndex, spread.left.side, spread.left.label)}</div>
              <div style={{ width: 74 }}>{renderCell(spread.right.panelIndex, spread.right.side, spread.right.label)}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Scan Card ───────────────────────────────────────────────────

const ScanCard: React.FC<{ scan: ScanInfo }> = ({ scan }) => {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-lg border bg-card">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {scan.original_filename || 'Unknown file'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
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

const PLATFORM_LABELS: Record<string, string> = {
  ebay: 'eBay',
  etsy: 'Etsy',
  dealer: 'Dealer',
  in_person: 'In Person',
  trade: 'Trade',
  gift: 'Gift',
  airline: 'Airline',
  other: 'Other',
};

const CONDITION_LABELS: Record<string, string> = {
  mint: 'Mint',
  near_mint: 'Near Mint',
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

const formatUsd = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);

const ProvenanceCard: React.FC<{
  entry: DetailProvenanceEntry;
  cardId: string;
  isEditing: boolean;
  onDelete?: () => void;
  onUpdated: () => void;
}> = ({ entry, cardId, isEditing, onDelete, onUpdated }) => {
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);

  const hasCost = entry.price_paid_usd != null || entry.shipping_cost_usd != null;
  const totalCost = (entry.price_paid_usd ?? 0) + (entry.shipping_cost_usd ?? 0);
  const perCardCost = hasCost && entry.lot_size && entry.lot_size > 1 ? totalCost / entry.lot_size : null;

  if (editing) {
    return (
      <ProvenanceForm
        cardId={cardId}
        existing={entry}
        onSaved={() => { setEditing(false); onUpdated(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const formatDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

  const priceDisplay = entry.price_paid_usd != null
    ? `${formatUsd(entry.price_paid_usd)}${entry.currency && entry.price_original != null ? ` (${entry.currency} ${entry.price_original.toFixed(2)})` : ''}`
    : null;

  const rows: { label: string; value: string | null | undefined }[] = [
    { label: 'Source', value: entry.source },
    { label: 'Platform', value: entry.platform ? (PLATFORM_LABELS[entry.platform] ?? entry.platform) : null },
    { label: 'Seller', value: entry.seller_name },
    { label: 'Order #', value: entry.order_number },
    { label: 'Order Date', value: entry.order_date ? formatDate(entry.order_date) : null },
    { label: 'Delivered', value: entry.acquired_date ? formatDate(entry.acquired_date) : null },
    { label: 'Price Paid', value: priceDisplay },
    { label: 'Shipping', value: entry.shipping_cost_usd != null ? formatUsd(entry.shipping_cost_usd) : null },
    { label: 'Per Card', value: perCardCost != null ? `${formatUsd(perCardCost)} (${entry.lot_size} in lot)` : null },
    { label: 'Lot Size', value: !perCardCost && entry.lot_size ? String(entry.lot_size) : null },
    { label: 'Condition', value: entry.condition_at_acquisition ? (CONDITION_LABELS[entry.condition_at_acquisition] ?? entry.condition_at_acquisition) : null },
    { label: 'Listing', value: entry.platform_listing_url ? entry.platform_listing_url : null },
    { label: 'Notes', value: entry.notes },
  ];
  const visibleRows = rows.filter((r) => r.value);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {isEditing && (
        <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border/50">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Acquisition</span>
          <div className="flex items-center gap-1.5">
            {confirming ? (
              <>
                <button onClick={onDelete} className="text-[10px] text-destructive hover:underline font-medium">Remove</button>
                <button onClick={() => setConfirming(false)} className="text-[10px] text-muted-foreground hover:underline">Cancel</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground p-0.5">
                  <Pencil className="h-3 w-3" />
                </button>
                {onDelete && (
                  <button onClick={() => setConfirming(true)} className="text-muted-foreground hover:text-destructive p-0.5">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {visibleRows.map((row, i) => (
        <div key={row.label} className={cn(
          'flex items-baseline justify-between px-4 py-3',
          i < visibleRows.length - 1 && 'border-b border-border/50'
        )}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{row.label}</span>
          {row.label === 'Listing' ? (
            <a href={row.value!} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline truncate max-w-[60%] text-right">
              View listing
            </a>
          ) : (
            <span className="text-sm font-medium text-right max-w-[60%]">{row.value}</span>
          )}
        </div>
      ))}
      {visibleRows.length === 0 && (
        <div className="px-4 py-3">
          <span className="text-xs text-muted-foreground/60 italic">No details recorded</span>
        </div>
      )}
      {entry.documents.length > 0 && (
        <div className={cn('px-4 py-3', visibleRows.length > 0 && 'border-t border-border/50')}>
          <DocumentLinks documents={entry.documents} />
        </div>
      )}
    </div>
  );
};

// ─── Inline Add Forms ────────────────────────────────────────────

const INLINE_INPUT =
  'w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 placeholder:text-muted-foreground/40 transition-colors';

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
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      onChange([...files, ...Array.from(incoming).map(fileToDocInput)]);
    },
    [files, onChange]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes('Files')) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragging(false);
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  return (
    <div>
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'rounded-lg border-2 border-dashed px-4 py-3 text-center cursor-pointer transition-colors',
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (!e.target.files) return;
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="flex flex-col items-center gap-1">
          <Upload className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {dragging ? 'Drop files here' : 'Drop files here or click to browse'}
          </p>
        </div>
      </div>
      {files.length > 0 && (
        <div className="flex flex-col gap-1 mt-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
              <Paperclip className="h-3 w-3 flex-shrink-0" />
              <span className="truncate flex-1">{f.originalFilename}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(files.filter((_, j) => j !== i)); }}
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

const PLATFORM_OPTIONS = [
  { value: '', label: 'Select platform...' },
  { value: 'ebay', label: 'eBay' },
  { value: 'etsy', label: 'Etsy' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'in_person', label: 'In Person' },
  { value: 'trade', label: 'Trade' },
  { value: 'gift', label: 'Gift' },
  { value: 'airline', label: 'Airline' },
  { value: 'other', label: 'Other' },
];

const CONDITION_OPTIONS = [
  { value: '', label: 'Condition (optional)' },
  { value: 'mint', label: 'Mint' },
  { value: 'near_mint', label: 'Near Mint' },
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
];

const ProvenanceForm: React.FC<{
  cardId: string;
  existing?: DetailProvenanceEntry;
  onSaved: () => void;
  onCancel: () => void;
}> = ({ cardId, existing, onSaved, onCancel }) => {
  const isEdit = !!existing;
  const [source, setSource] = useState(existing?.source || '');
  const [acquiredDate, setAcquiredDate] = useState(existing?.acquired_date || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [sellerName, setSellerName] = useState(existing?.seller_name || '');
  const [platform, setPlatform] = useState(existing?.platform || '');
  const [platformListingUrl, setPlatformListingUrl] = useState(existing?.platform_listing_url || '');
  const [pricePaid, setPricePaid] = useState(existing?.price_paid_usd != null ? String(existing.price_paid_usd) : '');
  const [shippingCost, setShippingCost] = useState(existing?.shipping_cost_usd != null ? String(existing.shipping_cost_usd) : '');
  const [lotSize, setLotSize] = useState(existing?.lot_size != null ? String(existing.lot_size) : '');
  const [condition, setCondition] = useState(existing?.condition_at_acquisition || '');
  const [orderNumber, setOrderNumber] = useState(existing?.order_number || '');
  const [orderDate, setOrderDate] = useState(existing?.order_date || '');
  const [currency, setCurrency] = useState(existing?.currency || '');
  const [priceOriginal, setPriceOriginal] = useState(existing?.price_original != null ? String(existing.price_original) : '');
  const [docs, setDocs] = useState<AddDocumentInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<DocumentExtraction | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  const hasAnalyzableDoc = docs.length > 0 || (existing?.documents ?? []).length > 0;

  const accept = useCallback((field: string) => {
    if (!extraction) return;
    setAccepted((prev) => new Set(prev).add(field));
    switch (field) {
      case 'source': if (extraction.item_description) setSource(extraction.item_description); break;
      case 'platform': if (extraction.platform) setPlatform(extraction.platform); break;
      case 'seller': if (extraction.seller_name) setSellerName(extraction.seller_name); break;
      case 'listing_url': if (extraction.listing_url) setPlatformListingUrl(extraction.listing_url); break;
      case 'order_number': if (extraction.order_number) setOrderNumber(extraction.order_number); break;
      case 'order_date': if (extraction.transaction_date) setOrderDate(extraction.transaction_date); break;
      case 'acquired_date': if (extraction.delivery_date) setAcquiredDate(extraction.delivery_date); break;
      case 'price': if (extraction.price_paid_usd != null) setPricePaid(String(extraction.price_paid_usd)); break;
      case 'shipping': if (extraction.shipping_cost_usd != null) setShippingCost(String(extraction.shipping_cost_usd)); break;
      case 'currency': if (extraction.currency) setCurrency(extraction.currency); break;
      case 'price_original': if (extraction.price_original != null) setPriceOriginal(String(extraction.price_original)); break;
      case 'lot_size': if (extraction.lot_size != null) setLotSize(String(extraction.lot_size)); break;
      case 'notes': if (extraction.condition_notes) setNotes((prev) => prev ? `${prev}\n${extraction.condition_notes}` : extraction.condition_notes!); break;
    }
  }, [extraction]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    setExtraction(null);
    setAccepted(new Set());

    let file: File | null = null;
    if (docs.length > 0) {
      file = docs[0].file;
    } else if (existing?.documents?.[0]) {
      const doc = existing.documents[0];
      try {
        const resp = await fetch(doc.url);
        if (!resp.ok) throw new Error(`Failed to fetch: ${resp.status}`);
        const blob = await resp.blob();
        file = new File([blob], doc.original_filename, { type: doc.mime_type || 'application/octet-stream' });
      } catch (err) {
        setAnalyzing(false);
        setAnalyzeError(err instanceof Error ? err.message : 'Failed to fetch document');
        return;
      }
    }

    if (!file) { setAnalyzing(false); return; }

    const { extraction: ext, error } = await analyzeDocument(file);
    setAnalyzing(false);
    if (error) { setAnalyzeError(error); return; }
    if (ext) {
      setExtraction(ext);
      setDocs((prev) => prev.map((d, i) => i === 0 ? { ...d, aiAnalysis: ext as unknown as Record<string, unknown> } : d));
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    const parsedPrice = parseFloat(pricePaid);
    const parsedShipping = parseFloat(shippingCost);
    const parsedLot = parseInt(lotSize, 10);
    const parsedOriginal = parseFloat(priceOriginal);
    const entry: ProvenanceInput = {
      source: source.trim() || null,
      acquiredDate: acquiredDate || null,
      notes: notes.trim() || null,
      sellerName: sellerName.trim() || null,
      platform: platform || null,
      platformListingUrl: platformListingUrl.trim() || null,
      pricePaidUsd: isNaN(parsedPrice) ? null : parsedPrice,
      shippingCostUsd: isNaN(parsedShipping) ? null : parsedShipping,
      lotSize: isNaN(parsedLot) || parsedLot < 1 ? null : parsedLot,
      conditionAtAcquisition: condition || null,
      orderNumber: orderNumber.trim() || null,
      orderDate: orderDate || null,
      currency: currency.trim().toUpperCase() || null,
      priceOriginal: isNaN(parsedOriginal) ? null : parsedOriginal,
    };

    let result: { success: boolean; error?: string };
    if (isEdit) {
      result = await updateProvenanceEntry(existing.id, entry);
    } else {
      result = await addProvenanceEntry(cardId, entry, docs);
    }
    setSaving(false);
    if (result.success) onSaved();
    else alert(`Failed: ${result.error}`);
  };

  return (
    <div className="rounded-xl border bg-card p-3 mb-2 flex flex-col gap-2">
      {!isEdit && <AttachmentPicker files={docs} onChange={setDocs} />}
      {isEdit && existing.documents.length > 0 && (
        <DocumentLinks documents={existing.documents} />
      )}
      {hasAnalyzableDoc && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAnalyze}
          disabled={analyzing}
          className="gap-1.5 self-start"
        >
          {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {analyzing ? 'Analyzing...' : isEdit ? 'Re-analyze document' : 'Auto-fill from document'}
        </Button>
      )}
      {analyzeError && <p className="text-xs text-destructive">{analyzeError}</p>}
      {extraction && (
        <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
          <Sparkles className="h-3 w-3" /> AI suggestions ready — apply individually below
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        <select className={INLINE_INPUT} value={platform} onChange={(e) => setPlatform(e.target.value)}>
          {PLATFORM_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <InlineSuggestion label="Platform" value={extraction?.platform ? (PLATFORM_OPTIONS.find(o => o.value === extraction.platform)?.label ?? extraction.platform) : undefined} accepted={accepted.has('platform')} onAccept={() => accept('platform')} />
      </div>
      <div className="flex flex-col gap-0.5">
        <input className={INLINE_INPUT} placeholder="Source (e.g. eBay lot, gift, estate sale)" value={source} onChange={(e) => setSource(e.target.value)} autoFocus />
        <InlineSuggestion label="Source" value={extraction?.item_description} accepted={accepted.has('source')} onAccept={() => accept('source')} />
      </div>
      <div className="flex flex-col gap-0.5">
        <input className={INLINE_INPUT} placeholder="Seller name or username" value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
        <InlineSuggestion label="Seller" value={extraction?.seller_name} accepted={accepted.has('seller')} onAccept={() => accept('seller')} />
      </div>
      <div className="flex flex-col gap-0.5">
        <input className={INLINE_INPUT} placeholder="Listing URL (optional)" value={platformListingUrl} onChange={(e) => setPlatformListingUrl(e.target.value)} />
        <InlineSuggestion label="URL" value={extraction?.listing_url} accepted={accepted.has('listing_url')} onAccept={() => accept('listing_url')} />
      </div>
      <div className="flex flex-col gap-0.5">
        <input className={INLINE_INPUT} placeholder="Order number" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
        <InlineSuggestion label="Order #" value={extraction?.order_number} accepted={accepted.has('order_number')} onAccept={() => accept('order_number')} />
      </div>
      <div className="flex flex-col gap-0.5">
        <input type="date" className={INLINE_INPUT} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        <InlineSuggestion label="Order date" value={extraction?.transaction_date} accepted={accepted.has('order_date')} onAccept={() => accept('order_date')} />
      </div>
      <div className="flex flex-col gap-0.5">
        <input type="date" className={INLINE_INPUT} value={acquiredDate} onChange={(e) => setAcquiredDate(e.target.value)} placeholder="Delivery date" />
        <InlineSuggestion label="Delivered" value={extraction?.delivery_date} accepted={accepted.has('acquired_date')} onAccept={() => accept('acquired_date')} />
      </div>
      <div className="flex flex-col gap-0.5">
        <input type="number" step="0.01" min="0" className={INLINE_INPUT} placeholder="Price paid (USD)" value={pricePaid} onChange={(e) => setPricePaid(e.target.value)} />
        <InlineSuggestion label="Price" value={extraction?.price_paid_usd != null ? `$${extraction.price_paid_usd}` : undefined} accepted={accepted.has('price')} onAccept={() => accept('price')} />
      </div>
      <div className="flex flex-col gap-0.5">
        <input type="number" step="0.01" min="0" className={INLINE_INPUT} placeholder="Shipping (USD)" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} />
        <InlineSuggestion label="Shipping" value={extraction?.shipping_cost_usd != null ? `$${extraction.shipping_cost_usd}` : undefined} accepted={accepted.has('shipping')} onAccept={() => accept('shipping')} />
      </div>
      <div className="flex flex-col gap-0.5">
        <input className={INLINE_INPUT} placeholder="Currency (e.g. GBP, EUR)" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        <InlineSuggestion label="Currency" value={extraction?.currency} accepted={accepted.has('currency')} onAccept={() => accept('currency')} />
      </div>
      <div className="flex flex-col gap-0.5">
        <input type="number" step="0.01" min="0" className={INLINE_INPUT} placeholder="Original price (if non-USD)" value={priceOriginal} onChange={(e) => setPriceOriginal(e.target.value)} />
        <InlineSuggestion label="Original price" value={extraction?.price_original != null ? String(extraction.price_original) : undefined} accepted={accepted.has('price_original')} onAccept={() => accept('price_original')} />
      </div>
      <div className="flex flex-col gap-0.5">
        <input type="number" min="1" className={INLINE_INPUT} placeholder="Lot size (if multi-card)" value={lotSize} onChange={(e) => setLotSize(e.target.value)} />
        <InlineSuggestion label="Lot size" value={extraction?.lot_size != null && extraction.lot_size > 1 ? String(extraction.lot_size) : undefined} accepted={accepted.has('lot_size')} onAccept={() => accept('lot_size')} />
      </div>
      <div className="flex flex-col gap-0.5">
        <select className={INLINE_INPUT} value={condition} onChange={(e) => setCondition(e.target.value)}>
          {CONDITION_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-0.5">
        <textarea className={`${INLINE_INPUT} min-h-[60px] resize-y`} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <InlineSuggestion label="Condition" value={extraction?.condition_notes} accepted={accepted.has('notes')} onAccept={() => accept('notes')} />
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" onClick={handleSubmit} disabled={saving || (!source.trim() && !sellerName.trim())} className="flex-1 gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isEdit ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {saving ? 'Saving...' : isEdit ? 'Save' : 'Add'}
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
};

// ─── Lightbox ────────────────────────────────────────────────────

const Lightbox: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-8 cursor-zoom-out animate-in fade-in duration-200"
      onClick={onClose}
    >
      <img
        src={url}
        alt="Full resolution panel"
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors
                   bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full p-2"
      >
        <XIcon className="h-5 w-5" />
      </button>
    </div>
  );
};
