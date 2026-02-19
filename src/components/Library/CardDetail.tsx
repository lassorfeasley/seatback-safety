import React, { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import { CardVisualizer3D } from '@/components/FoldEditor/CardVisualizer3D';
import {
  fetchCardDetail,
  deleteCard,
  updateCardMetadata,
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
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const panelsPerSide = card.panel_count ? Math.ceil(card.panel_count / 2) : frontPanels.length;
  const hasPanels = frontPanels.length > 0 || backPanels.length > 0;
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
                onClick={onBack}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-semibold tracking-tight truncate">
                {card.title || 'Untitled Card'}
              </h1>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button
                variant={isEditing ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
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
            <div className="min-w-0">
              {hasPanels ? (
                <CardVisualizer3D
                  panels={card.panels}
                  creases={card.creases}
                  cover={card.cover}
                />
              ) : card.preview_url ? (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <img
                    src={card.preview_url}
                    alt={card.title || 'Card preview'}
                    className="w-full h-auto max-h-[500px] object-contain bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900"
                  />
                </div>
              ) : (
                <div className="rounded-lg border bg-card flex items-center justify-center min-h-[300px]">
                  <div className="text-center">
                    <Layers className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No panel images</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-5">
              {isEditing ? (
                <MetadataEditor
                  card={card}
                  onSave={handleSaveMetadata}
                  onCancel={() => setIsEditing(false)}
                  saving={saving}
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

              {card.provenance.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Provenance</p>
                  <div className="flex flex-col gap-2">
                    {card.provenance.map((entry) => (
                      <ProvenanceCard key={entry.id} entry={entry} />
                    ))}
                  </div>
                </div>
              )}

              {card.priceObservations.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Price History</p>
                  <div className="flex flex-col gap-2">
                    {card.priceObservations.map((obs) => (
                      <PriceObservationCard key={obs.id} observation={obs} />
                    ))}
                  </div>
                </div>
              )}

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

          {hasPanels && (
            <section>
              <SectionHeading>Panel Spreads</SectionHeading>
              <SpreadRow
                label="Front"
                panels={frontPanels}
                expectedCount={panelsPerSide}
                displayUrls={card.displayUrls}
                fullUrls={card.fullUrls}
                onZoom={setLightboxUrl}
              />
              <div className="my-4" />
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
}

const MetadataEditor: React.FC<MetadataEditorProps> = ({ card, onSave, onCancel, saving }) => {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <EditorField label="Title">
          <input className={INPUT_CLASS} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Card title" />
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
        </EditorField>

        <div className="grid grid-cols-2 gap-3">
          <EditorField label="Year">
            <input type="number" className={INPUT_CLASS} value={publishedYear} onChange={(e) => setPublishedYear(e.target.value)} placeholder="e.g. 2024" />
          </EditorField>
          <EditorField label="Revision">
            <input className={INPUT_CLASS} value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="e.g. Rev C" />
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

const EditorField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-muted-foreground">{label}</label>
    {children}
  </div>
);

// ─── Shared Section Components ───────────────────────────────────

const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-base font-medium text-muted-foreground mb-4">{children}</h2>
);

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
      <h2 className="text-sm font-medium text-muted-foreground mb-3">
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
              className="relative group bg-muted/50 rounded-sm overflow-hidden"
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

const ProvenanceCard: React.FC<{ entry: DetailProvenanceEntry }> = ({ entry }) => {
  return (
    <div className="p-4 rounded-lg bg-muted/40">
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

const PriceObservationCard: React.FC<{ observation: DetailPriceObservation }> = ({ observation }) => {
  const formattedPrice = observation.price_usd != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(observation.price_usd)
    : '—';

  return (
    <div className="p-4 rounded-lg bg-muted/40">
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
