import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Plus, Minus, Check, ChevronDown, ChevronUp, Trash2, Paperclip, X, BookOpen } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import type {
  CardInfoStepProps,
  CardMetadata,
  ProvenanceEntry,
  PriceObservation,
  DocumentAttachment,
  PriceType,
} from './types';

export const CardInfoStep: React.FC<CardInfoStepProps> = ({
  metadata,
  panelCount,
  images: _images,
  isBooklet,
  onMetadataChange,
  onPanelCountChange,
  onBookletChange,
  onBack,
  onContinue,
}) => {
  const [count, setCount] = useState(panelCount > 0 ? panelCount : 3);
  const [showDetails, setShowDetails] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);
  const [showPricing, setShowPricing] = useState(false);

  const [airlines, setAirlines] = useState<ComboboxOption[]>([]);
  const [manufacturers, setManufacturers] = useState<ComboboxOption[]>([]);
  const [models, setModels] = useState<ComboboxOption[]>([]);
  const [variants, setVariants] = useState<ComboboxOption[]>([]);

  useEffect(() => {
    fetchAirlines().then((items) =>
      setAirlines(items.map((i) => ({ value: i.id, label: i.name })))
    );
    fetchManufacturers().then((items) =>
      setManufacturers(items.map((i) => ({ value: i.id, label: i.name })))
    );
  }, []);

  useEffect(() => {
    if (metadata.manufacturerId) {
      fetchModels(metadata.manufacturerId).then((items) =>
        setModels(items.map((i) => ({ value: i.id, label: i.name })))
      );
    } else {
      setModels([]);
    }
  }, [metadata.manufacturerId]);

  useEffect(() => {
    if (metadata.modelId) {
      fetchVariants(metadata.modelId).then((items) =>
        setVariants(items.map((i) => ({ value: i.id, label: i.name })))
      );
    } else {
      setVariants([]);
    }
  }, [metadata.modelId]);

  const update = useCallback(
    (patch: Partial<CardMetadata>) => {
      onMetadataChange({ ...metadata, ...patch });
    },
    [metadata, onMetadataChange]
  );

  const handleContinue = () => {
    onPanelCountChange(count);
    onContinue();
  };

  const canContinue = !!metadata.airlineId && !!metadata.manufacturerId;

  return (
    <div className="flex flex-col h-full p-6 gap-5">
      <div className="flex-shrink-0">
        <h2 className="text-2xl font-semibold tracking-tight">Card Information</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tell us about this safety card. Only airline and manufacturer are required.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="flex flex-col gap-6 max-w-2xl">
          {/* Required: Airline + Manufacturer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Airline <span className="text-destructive">*</span>
              </label>
              <Combobox
                options={airlines}
                value={metadata.airlineId}
                onChange={(value, label) => update({ airlineId: value, airlineName: label })}
                onCreateNew={async (name) => {
                  const item = await createAirline(name);
                  const option = { value: item.id, label: item.name };
                  setAirlines((prev) => [...prev, option].sort((a, b) => a.label.localeCompare(b.label)));
                  return option;
                }}
                placeholder="Select airline..."
                searchPlaceholder="Search or create airline..."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                Aircraft Manufacturer <span className="text-destructive">*</span>
              </label>
              <Combobox
                options={manufacturers}
                value={metadata.manufacturerId}
                onChange={(value, label) =>
                  update({
                    manufacturerId: value,
                    manufacturerName: label,
                    modelId: null,
                    modelName: '',
                    variantId: null,
                    variantName: '',
                  })
                }
                onCreateNew={async (name) => {
                  const item = await createManufacturer(name);
                  const option = { value: item.id, label: item.name };
                  setManufacturers((prev) => [...prev, option].sort((a, b) => a.label.localeCompare(b.label)));
                  return option;
                }}
                placeholder="Select manufacturer..."
                searchPlaceholder="Search or create manufacturer..."
              />
            </div>
          </div>

          {metadata.manufacturerId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-muted-foreground">Aircraft Model</label>
                <Combobox
                  options={models}
                  value={metadata.modelId}
                  onChange={(value, label) =>
                    update({ modelId: value, modelName: label, variantId: null, variantName: '' })
                  }
                  onCreateNew={async (name) => {
                    const item = await createModel(metadata.manufacturerId!, name);
                    const option = { value: item.id, label: item.name };
                    setModels((prev) => [...prev, option].sort((a, b) => a.label.localeCompare(b.label)));
                    return option;
                  }}
                  placeholder="Select model..."
                  searchPlaceholder="Search or create model..."
                />
              </div>

              {metadata.modelId && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground">Variant</label>
                  <Combobox
                    options={variants}
                    value={metadata.variantId}
                    onChange={(value, label) => update({ variantId: value, variantName: label })}
                    onCreateNew={async (name) => {
                      const item = await createVariant(metadata.modelId!, name);
                      const option = { value: item.id, label: item.name };
                      setVariants((prev) => [...prev, option].sort((a, b) => a.label.localeCompare(b.label)));
                      return option;
                    }}
                    placeholder="Select variant..."
                    searchPlaceholder="Search or create variant..."
                  />
                </div>
              )}
            </div>
          )}

          {/* Card Format + Panel/Page Count */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground">Format</label>
              <button
                type="button"
                onClick={() => onBookletChange(!isBooklet)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-all',
                  isBooklet
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-muted text-muted-foreground hover:border-primary/40'
                )}
              >
                <BookOpen className="h-4 w-4" />
                Booklet
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-muted-foreground">
                {isBooklet ? 'Page Count' : 'Panel Count'}
              </label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => setCount(Math.max(1, count - 1))}
                  disabled={count <= 1}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tabular-nums w-8 text-center">{count}</span>
                  <span className="text-xs text-muted-foreground">
                    {isBooklet
                      ? `page${count !== 1 ? 's' : ''} (${count * 2} faces)`
                      : `panel${count !== 1 ? 's' : ''} (${count * 2} sides)`}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => setCount(count + 1)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Collapsible Details */}
          <div>
            <ToggleHeader open={showDetails} onToggle={() => setShowDetails(!showDetails)}>
              More Details
            </ToggleHeader>

            {showDetails && (
              <div className="mt-4 p-5 rounded-lg bg-muted/40">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Title</label>
                    <input
                      type="text"
                      value={metadata.title}
                      onChange={(e) => update({ title: e.target.value })}
                      placeholder="Auto-generated if blank"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Published Year</label>
                    <input
                      type="number"
                      value={metadata.publishedYear ?? ''}
                      onChange={(e) =>
                        update({ publishedYear: e.target.value ? Number(e.target.value) : null })
                      }
                      placeholder="e.g. 2023"
                      min={1950}
                      max={2099}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Revision</label>
                    <input
                      type="text"
                      value={metadata.revision}
                      onChange={(e) => update({ revision: e.target.value })}
                      placeholder='e.g. "Rev. 3" or "06/2019"'
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">Language</label>
                    <input
                      type="text"
                      value={metadata.language}
                      onChange={(e) => update({ language: e.target.value })}
                      placeholder="e.g. English"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-xs text-muted-foreground">Notes</label>
                    <textarea
                      value={metadata.notes}
                      onChange={(e) => update({ notes: e.target.value })}
                      placeholder="Any additional information..."
                      rows={3}
                      className="rounded-md border border-input bg-transparent px-3 py-2 text-sm
                                 placeholder:text-muted-foreground focus-visible:outline-none
                                 focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Collapsible Provenance */}
          <div>
            <ToggleHeader open={showProvenance} onToggle={() => setShowProvenance(!showProvenance)}>
              Provenance ({metadata.provenance.length})
            </ToggleHeader>

            {showProvenance && (
              <div className="mt-4 flex flex-col gap-4">
                {metadata.provenance.map((entry, idx) => (
                  <ProvenanceCard
                    key={idx}
                    entry={entry}
                    onChange={(updated) => {
                      const next = [...metadata.provenance];
                      next[idx] = updated;
                      update({ provenance: next });
                    }}
                    onRemove={() => {
                      update({ provenance: metadata.provenance.filter((_, i) => i !== idx) });
                    }}
                  />
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start gap-1.5"
                  onClick={() =>
                    update({
                      provenance: [
                        ...metadata.provenance,
                        { source: '', acquiredDate: '', notes: '', documents: [] },
                      ],
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Entry
                </Button>
              </div>
            )}
          </div>

          {/* Collapsible Pricing */}
          <div>
            <ToggleHeader open={showPricing} onToggle={() => setShowPricing(!showPricing)}>
              Price History ({metadata.priceObservations.length})
            </ToggleHeader>

            {showPricing && (
              <div className="mt-4 flex flex-col gap-4">
                {metadata.priceObservations.map((obs, idx) => (
                  <PriceObservationCard
                    key={idx}
                    observation={obs}
                    onChange={(updated) => {
                      const next = [...metadata.priceObservations];
                      next[idx] = updated;
                      update({ priceObservations: next });
                    }}
                    onRemove={() => {
                      update({
                        priceObservations: metadata.priceObservations.filter((_, i) => i !== idx),
                      });
                    }}
                  />
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start gap-1.5"
                  onClick={() =>
                    update({
                      priceObservations: [
                        ...metadata.priceObservations,
                        {
                          priceUsd: null,
                          priceType: 'purchase',
                          source: '',
                          observedDate: '',
                          documents: [],
                        },
                      ],
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Observation
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between flex-shrink-0 pt-3 border-t">
        <Button variant="outline" size="lg" onClick={onBack} className="gap-2">
          Back
        </Button>
        <Button
          size="lg"
          onClick={handleContinue}
          disabled={!canContinue}
          className="gap-2"
        >
          Continue
          <Check className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

// ─── Shared Components ──────────────────────────────────────────

const INPUT_CLASS =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const ToggleHeader: React.FC<{
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}> = ({ children, open, onToggle }) => (
  <button
    onClick={onToggle}
    className="flex items-center gap-2 text-sm font-medium text-muted-foreground
               hover:text-foreground transition-colors"
  >
    {children}
    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
  </button>
);

function makeDocumentFromFile(file: File): DocumentAttachment {
  return {
    file,
    originalFilename: file.name,
    mimeType: file.type || 'application/octet-stream',
    fileSizeBytes: file.size,
    label: '',
  };
}

// ─── Document Attachment List ───────────────────────────────────

const DocumentList: React.FC<{
  documents: DocumentAttachment[];
  onChange: (docs: DocumentAttachment[]) => void;
}> = ({ documents, onChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newDocs = Array.from(files).map(makeDocumentFromFile);
    onChange([...documents, ...newDocs]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-1.5">
      {documents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {documents.map((doc, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-xs bg-background rounded-md px-2 py-1"
            >
              <Paperclip className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="truncate max-w-[160px]">{doc.originalFilename}</span>
              <button
                onClick={() => onChange(documents.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx"
          onChange={handleFiles}
          className="hidden"
        />
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs h-7 px-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-3 w-3" />
          Attach File
        </Button>
      </div>
    </div>
  );
};

// ─── Provenance Entry Card ──────────────────────────────────────

const ProvenanceCard: React.FC<{
  entry: ProvenanceEntry;
  onChange: (entry: ProvenanceEntry) => void;
  onRemove: () => void;
}> = ({ entry, onChange, onRemove }) => {
  return (
    <div className="p-5 rounded-lg bg-muted/40">
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Provenance Entry</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Source</label>
          <input
            type="text"
            value={entry.source}
            onChange={(e) => onChange({ ...entry, source: e.target.value })}
            placeholder='e.g. "eBay", "Estate sale"'
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Acquired Date</label>
          <input
            type="date"
            value={entry.acquiredDate}
            onChange={(e) => onChange({ ...entry, acquiredDate: e.target.value })}
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs text-muted-foreground">Notes</label>
          <textarea
            value={entry.notes}
            onChange={(e) => onChange({ ...entry, notes: e.target.value })}
            placeholder="Any provenance details..."
            rows={2}
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm
                       placeholder:text-muted-foreground focus-visible:outline-none
                       focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
        </div>
        <div className="sm:col-span-2">
          <DocumentList
            documents={entry.documents}
            onChange={(docs) => onChange({ ...entry, documents: docs })}
          />
        </div>
      </div>
    </div>
  );
};

// ─── Price Observation Card ─────────────────────────────────────

const PRICE_TYPES: { value: PriceType; label: string }[] = [
  { value: 'purchase', label: 'Purchase' },
  { value: 'asking', label: 'Asking' },
  { value: 'auction_result', label: 'Auction Result' },
  { value: 'estimate', label: 'Estimate' },
];

const PriceObservationCard: React.FC<{
  observation: PriceObservation;
  onChange: (obs: PriceObservation) => void;
  onRemove: () => void;
}> = ({ observation, onChange, onRemove }) => {
  return (
    <div className="p-5 rounded-lg bg-muted/40">
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Price Observation</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Price (USD)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <input
              type="number"
              value={observation.priceUsd ?? ''}
              onChange={(e) =>
                onChange({
                  ...observation,
                  priceUsd: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="0.00"
              min={0}
              step="0.01"
              className={`${INPUT_CLASS} pl-7`}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Type</label>
          <select
            value={observation.priceType}
            onChange={(e) =>
              onChange({ ...observation, priceType: e.target.value as PriceType })
            }
            className={INPUT_CLASS}
          >
            {PRICE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Source</label>
          <input
            type="text"
            value={observation.source}
            onChange={(e) => onChange({ ...observation, source: e.target.value })}
            placeholder='e.g. "eBay listing #12345"'
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Date</label>
          <input
            type="date"
            value={observation.observedDate}
            onChange={(e) => onChange({ ...observation, observedDate: e.target.value })}
            className={INPUT_CLASS}
          />
        </div>
        <div className="sm:col-span-2">
          <DocumentList
            documents={observation.documents}
            onChange={(docs) => onChange({ ...observation, documents: docs })}
          />
        </div>
      </div>
    </div>
  );
};
