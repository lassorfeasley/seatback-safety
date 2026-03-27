import { supabase } from './supabase';
import { extractCropWithRotation } from '@/components/PanelCropper/utils';
import type { WizardState, LibraryImage } from '@/components/Wizard/types';
import type { Panel, Crease, CoverDesignation, Side } from '@/components/FoldEditor/types';

// ─── Shared Types ────────────────────────────────────────────────

export interface CardSummary {
  id: string;
  title: string | null;
  panel_count: number | null;
  created_at: string;
  cover_side: string;
  cover_spread_index: number;
  thumbnail_url: string | null;
  preview_url: string | null;
  og_url: string | null;
  airline_name: string | null;
  aircraft_label: string | null;
  published_year: number | null;
}

export interface ScanInfo {
  id: string;
  side: string | null;
  dpi: number;
  width_px: number;
  height_px: number;
  original_filename: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  file_path: string | null;
  url: string | null;
  thumbnailUrl: string | null;
}

export interface DetailDocumentInfo {
  id: string;
  file_path: string;
  original_filename: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  label: string | null;
  url: string;
}

export interface DetailProvenanceEntry {
  id: string;
  source: string | null;
  acquired_date: string | null;
  notes: string | null;
  documents: DetailDocumentInfo[];
}

export interface DetailPriceObservation {
  id: string;
  price_usd: number | null;
  price_type: string | null;
  source: string | null;
  observed_date: string | null;
  documents: DetailDocumentInfo[];
}

export interface DetailAircraftEntry {
  modelId: string | null;
  modelName: string;
  variantId: string | null;
  variantName: string;
  variants: Array<{ id: string; name: string }>;
  manufacturerId: string | null;
  manufacturerName: string;
}

export interface CardDetailData {
  id: string;
  title: string | null;
  panel_count: number | null;
  crop_width: number | null;
  crop_height: number | null;
  cover_spread_index: number;
  cover_side: string;
  is_booklet: boolean;
  created_at: string;
  airline_name: string | null;
  aircraft_label: string | null;
  published_year: number | null;
  revision: string | null;
  language: string | null;
  notes: string | null;
  panels: Panel[];
  creases: Crease[];
  cover: CoverDesignation;
  pivotIndex: number | null;
  displayUrls: Record<string, string>;
  fullUrls: Record<string, string>;
  scans: ScanInfo[];
  provenance: DetailProvenanceEntry[];
  priceObservations: DetailPriceObservation[];
  preview_url: string | null;
  thumbnail_url: string | null;
  og_url: string | null;
  airline_id: string | null;
  airline_country: string | null;
  airline_logo_url: string | null;
  manufacturer_logo_url: string | null;
  aircraft: DetailAircraftEntry[];
  languages: string[];
}

export interface CardMetadataUpdate {
  title: string | null;
  airlineId: string | null;
  aircraft: Array<{
    modelId: string;
    variantIds: string[];
  }>;
  languages: string[];
  publishedYear: number | null;
  revision: string | null;
  notes: string | null;
}

export interface SaveResult {
  cardId: string;
  success: boolean;
  error?: string;
}

export interface SaveProgress {
  stage: string;
  current: number;
  total: number;
}

type ProgressCallback = (progress: SaveProgress) => void;

// ─── Helpers ─────────────────────────────────────────────────────

async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function fileExtension(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  const mimeMap: Record<string, string> = {
    'image/tiff': 'tif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return mimeMap[file.type] || 'bin';
}

async function getImageDimensions(
  image: LibraryImage
): Promise<{ width: number; height: number }> {
  if (image.imageDimensions) return image.imageDimensions;
  const img = await loadImage(image.imageUrl);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

async function blobDimensions(
  blob: Blob
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ─── Main Save Pipeline ─────────────────────────────────────────

export async function saveCardToLibrary(
  state: WizardState,
  onProgress?: ProgressCallback
): Promise<SaveResult> {
  const report = (stage: string, current: number, total: number) =>
    onProgress?.({ stage, current, total });

  try {
    // ── 1. Create safety_cards record ────────────────────────────
    report('Creating card record', 0, 1);

    const m = state.metadata;
    const autoTitle =
      m.title ||
      [m.airlineName, m.manufacturerName, m.modelName, m.variantName]
        .filter(Boolean)
        .join(' ') ||
      null;

    const { data: card, error: cardErr } = await supabase
      .from('safety_cards')
      .insert({
        title: autoTitle,
        airline_id: m.airlineId || null,
        aircraft_variant_id: m.variantId || null,
        published_year: m.publishedYear || null,
        revision: m.revision || null,
        language: m.language || null,
        notes: m.notes || null,
        panel_count: state.panelCount,
        crop_width: state.cropWidth,
        crop_height: state.cropHeight,
        cover_spread_index: state.cover.spreadIndex,
        cover_side: state.cover.side,
        pivot_index: state.pivotIndex,
        is_booklet: state.isBooklet ?? false,
      })
      .select('id')
      .single();

    if (cardErr || !card) {
      return { cardId: '', success: false, error: `Failed to create card: ${cardErr?.message}` };
    }

    const cardId = card.id as string;

    // ── 2. Create card_sides (front + back) ─────────────────────
    report('Creating sides', 1, 1);

    const { data: sides, error: sidesErr } = await supabase
      .from('card_sides')
      .insert([
        { card_id: cardId, side: 'front' },
        { card_id: cardId, side: 'back' },
      ])
      .select('id, side');

    if (sidesErr || !sides) {
      return { cardId, success: false, error: `Failed to create sides: ${sidesErr?.message}` };
    }

    const sideIdMap: Record<string, string> = {};
    for (const s of sides) sideIdMap[s.side] = s.id;

    // ── 3. Upload scans + create card_scans ─────────────────────
    const usedImageIds = new Set(
      state.slots.filter((s) => s.imageId).map((s) => s.imageId!)
    );
    const imagesToUpload = state.images.filter((i) => usedImageIds.has(i.id));
    const scanIdMap = new Map<string, string>();

    for (let idx = 0; idx < imagesToUpload.length; idx++) {
      const image = imagesToUpload[idx];
      if (!image.imageFile) continue;
      const file = image.imageFile;
      report('Uploading scans', idx + 1, imagesToUpload.length);

      const sha256 = await computeSha256(file);
      const ext = fileExtension(file);
      const scanId = crypto.randomUUID();
      const storagePath = `${cardId}/${scanId}.${ext}`;
      const dims = await getImageDimensions(image);

      const { error: uploadErr } = await supabase.storage
        .from('scans')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadErr) {
        return { cardId, success: false, error: `Failed to upload scan: ${uploadErr.message}` };
      }

      const { error: scanDbErr } = await supabase.from('card_scans').insert({
        id: scanId,
        card_id: cardId,
        dpi: 600,
        width_px: dims.width,
        height_px: dims.height,
        file_path: storagePath,
        original_filename: file.name,
        mime_type: file.type,
        file_size_bytes: file.size,
        sha256_hash: sha256,
      });

      if (scanDbErr) {
        return { cardId, success: false, error: `Failed to save scan record: ${scanDbErr.message}` };
      }

      scanIdMap.set(image.id, scanId);
    }

    // ── 4. Create panels, crops, and derivatives ────────────────
    const filledSlots = state.slots.filter((s) => s.cropRegion && s.imageId);
    const panelImageRows: Array<{
      panel_id: string;
      variant: string;
      width_px: number;
      height_px: number;
      file_path: string;
    }> = [];

    for (let idx = 0; idx < filledSlots.length; idx++) {
      const slot = filledSlots[idx];
      report('Processing panels', idx + 1, filledSlots.length);

      const sideId = sideIdMap[slot.side];
      const scanId = scanIdMap.get(slot.imageId!);
      const image = state.images.find((i) => i.id === slot.imageId);
      if (!sideId || !scanId || !image || !slot.cropRegion) continue;

      // Create card_panels
      const { data: panel, error: panelErr } = await supabase
        .from('card_panels')
        .insert({ side_id: sideId, panel_index: slot.panelIndex })
        .select('id')
        .single();

      if (panelErr || !panel) {
        return { cardId, success: false, error: `Failed to create panel: ${panelErr?.message}` };
      }

      const panelId = panel.id as string;

      // Create panel_crops
      const { error: cropErr } = await supabase.from('panel_crops').insert({
        panel_id: panelId,
        scan_id: scanId,
        x: Math.round(slot.cropRegion.x),
        y: Math.round(slot.cropRegion.y),
        width: Math.round(slot.cropRegion.width),
        height: Math.round(slot.cropRegion.height),
        rotation_deg: image.rotation,
        scale: 1,
      });

      if (cropErr) {
        return { cardId, success: false, error: `Failed to save crop: ${cropErr.message}` };
      }

      // Generate and upload derivatives
      const imgEl = await loadImage(image.imageUrl);

      // Full resolution crop (no downscaling)
      const fullBlob = await extractCropWithRotation(imgEl, slot.cropRegion, image.rotation, {
        format: 'jpeg',
        quality: 0.92,
      });
      const fullPath = `${cardId}/${panelId}_full.jpg`;
      await supabase.storage.from('derivatives').upload(fullPath, fullBlob, {
        contentType: 'image/jpeg',
      });
      const fullDims = await blobDimensions(fullBlob);

      // Display (~800px wide)
      const displayBlob = await extractCropWithRotation(imgEl, slot.cropRegion, image.rotation, {
        targetWidth: 800,
        format: 'jpeg',
        quality: 0.85,
      });
      const displayPath = `${cardId}/${panelId}_display.jpg`;
      await supabase.storage.from('derivatives').upload(displayPath, displayBlob, {
        contentType: 'image/jpeg',
      });
      const displayDims = await blobDimensions(displayBlob);

      // Thumbnail (~300px wide)
      const thumbBlob = await extractCropWithRotation(imgEl, slot.cropRegion, image.rotation, {
        targetWidth: 300,
        format: 'jpeg',
        quality: 0.8,
      });
      const thumbPath = `${cardId}/${panelId}_thumbnail.jpg`;
      await supabase.storage.from('derivatives').upload(thumbPath, thumbBlob, {
        contentType: 'image/jpeg',
      });
      const thumbDims = await blobDimensions(thumbBlob);

      panelImageRows.push(
        { panel_id: panelId, variant: 'full', width_px: fullDims.width, height_px: fullDims.height, file_path: fullPath },
        { panel_id: panelId, variant: 'display', width_px: displayDims.width, height_px: displayDims.height, file_path: displayPath },
        { panel_id: panelId, variant: 'thumbnail', width_px: thumbDims.width, height_px: thumbDims.height, file_path: thumbPath },
      );
    }

    // Batch insert all panel_images
    if (panelImageRows.length > 0) {
      const { error: imgErr } = await supabase.from('panel_images').insert(panelImageRows);
      if (imgErr) {
        return { cardId, success: false, error: `Failed to save panel images: ${imgErr.message}` };
      }
    }

    // ── 5. Create card_creases (batch) ──────────────────────────
    report('Saving fold structure', 1, 1);

    const creaseRows = state.creases.map((c) => ({
      card_id: cardId,
      between_panel: c.between_panel,
      fold_direction: c.fold_direction,
      side: c.side,
      unfold_sequence: c.unfold_sequence,
    }));

    if (creaseRows.length > 0) {
      const { error: creaseErr } = await supabase.from('card_creases').insert(creaseRows);
      if (creaseErr) {
        return { cardId, success: false, error: `Failed to save creases: ${creaseErr.message}` };
      }
    }

    // ── 6. Save provenance entries + documents ─────────────────
    const provEntries = state.metadata.provenance ?? [];
    for (let idx = 0; idx < provEntries.length; idx++) {
      const entry = provEntries[idx];
      report('Saving provenance', idx + 1, provEntries.length);

      const { data: provRow, error: provErr } = await supabase
        .from('card_provenance')
        .insert({
          card_id: cardId,
          source: entry.source || null,
          acquired_date: entry.acquiredDate || null,
          notes: entry.notes || null,
        })
        .select('id')
        .single();

      if (provErr || !provRow) {
        return { cardId, success: false, error: `Failed to save provenance: ${provErr?.message}` };
      }

      const provId = provRow.id as string;

      for (const doc of entry.documents) {
        if (!doc.file) continue;
        const docId = crypto.randomUUID();
        const ext = doc.originalFilename.split('.').pop()?.toLowerCase() || 'bin';
        const docPath = `${cardId}/${docId}.${ext}`;

        await supabase.storage.from('documents').upload(docPath, doc.file, {
          contentType: doc.mimeType || 'application/octet-stream',
        });

        await supabase.from('card_documents').insert({
          id: docId,
          card_id: cardId,
          provenance_id: provId,
          file_path: docPath,
          original_filename: doc.originalFilename,
          mime_type: doc.mimeType || null,
          file_size_bytes: doc.fileSizeBytes,
          label: doc.label || null,
        });
      }
    }

    // ── 7. Save price observations + documents ──────────────
    const priceObs = state.metadata.priceObservations ?? [];
    for (let idx = 0; idx < priceObs.length; idx++) {
      const obs = priceObs[idx];
      report('Saving price history', idx + 1, priceObs.length);

      const { data: priceRow, error: priceErr } = await supabase
        .from('card_price_observations')
        .insert({
          card_id: cardId,
          price_usd: obs.priceUsd,
          price_type: obs.priceType || null,
          source: obs.source || null,
          observed_date: obs.observedDate || null,
        })
        .select('id')
        .single();

      if (priceErr || !priceRow) {
        return { cardId, success: false, error: `Failed to save price: ${priceErr?.message}` };
      }

      const priceId = priceRow.id as string;

      for (const doc of obs.documents) {
        if (!doc.file) continue;
        const docId = crypto.randomUUID();
        const ext = doc.originalFilename.split('.').pop()?.toLowerCase() || 'bin';
        const docPath = `${cardId}/${docId}.${ext}`;

        await supabase.storage.from('documents').upload(docPath, doc.file, {
          contentType: doc.mimeType || 'application/octet-stream',
        });

        await supabase.from('card_documents').insert({
          id: docId,
          card_id: cardId,
          price_observation_id: priceId,
          file_path: docPath,
          original_filename: doc.originalFilename,
          mime_type: doc.mimeType || null,
          file_size_bytes: doc.fileSizeBytes,
          label: doc.label || null,
        });
      }
    }

    report('Done', 1, 1);
    return { cardId, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { cardId: '', success: false, error: message };
  }
}

// ─── Fetch Functions ─────────────────────────────────────────────

function derivativePublicUrl(filePath: string): string {
  const { data } = supabase.storage.from('derivatives').getPublicUrl(filePath);
  return data.publicUrl;
}

async function documentSignedUrl(filePath: string): Promise<string> {
  const { data } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, 3600);
  return data?.signedUrl ?? '';
}

function unwrap(val: unknown): Record<string, unknown> | null {
  if (!val) return null;
  if (Array.isArray(val)) return val[0] ?? null;
  return val as Record<string, unknown>;
}

function buildAircraftLabel(variant: Record<string, unknown> | null): string | null {
  if (!variant) return null;
  const model = unwrap(variant.aircraft_models);
  const mfr = model ? unwrap(model.aircraft_manufacturers) : null;
  return [mfr?.name, model?.name, variant.name].filter(Boolean).join(' ') || null;
}

export async function fetchCards(opts?: { includeUnpublished?: boolean }): Promise<CardSummary[]> {
  const { data: cards, error } = await supabase
    .from('safety_cards')
    .select(`
      id, title, panel_count, cover_spread_index, cover_side, is_booklet, created_at, published_year,
      airlines ( name ),
      aircraft_variants ( name, aircraft_models ( name, aircraft_manufacturers ( name ) ) ),
      card_aircraft ( sort_order,
        aircraft_variants ( name, aircraft_models ( name, aircraft_manufacturers ( name ) ) ),
        aircraft_models ( name, aircraft_manufacturers ( name ) )
      ),
      card_sides (
        id, side,
        card_panels (
          id, panel_index,
          panel_images ( variant, file_path )
        )
      )
    `)
    .order('created_at', { ascending: false });

  if (error || !cards) return [];

  return cards.map((card: Record<string, unknown>) => {
    const sides = (card.card_sides ?? []) as Array<{
      side: string;
      card_panels: Array<{
        panel_index: number;
        panel_images: Array<{ variant: string; file_path: string }>;
      }>;
    }>;

    let thumbnailUrl: string | null = null;
    const coverSide = sides.find((s) => s.side === (card.cover_side as string));
    const coverPanel = coverSide?.card_panels?.find(
      (p) => p.panel_index === (card.cover_spread_index as number)
    );
    const thumbImage =
      coverPanel?.panel_images?.find((i) => i.variant === 'thumbnail') ??
      coverPanel?.panel_images?.[0];

    if (thumbImage) {
      thumbnailUrl = derivativePublicUrl(thumbImage.file_path);
    }

    if (!thumbnailUrl) {
      for (const side of sides) {
        for (const panel of side.card_panels ?? []) {
          const img = panel.panel_images?.find((i) => i.variant === 'thumbnail');
          if (img) {
            thumbnailUrl = derivativePublicUrl(img.file_path);
            break;
          }
        }
        if (thumbnailUrl) break;
      }
    }

    const airlineRaw = card.airlines;
    const airline = (Array.isArray(airlineRaw) ? airlineRaw[0] : airlineRaw) as Record<string, unknown> | null;

    const cardAircraftRows = (card.card_aircraft ?? []) as Array<Record<string, unknown>>;
    let label: string | null = null;

    if (cardAircraftRows.length > 0) {
      const labels = cardAircraftRows
        .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
        .map((ca) => {
          const v = unwrap(ca.aircraft_variants);
          if (v) return buildAircraftLabel(v);
          const m = unwrap(ca.aircraft_models);
          if (m) {
            const mfr = unwrap(m.aircraft_manufacturers);
            return [mfr?.name, m.name].filter(Boolean).join(' ') || null;
          }
          return null;
        })
        .filter(Boolean);
      label = labels.join(', ') || null;
    } else {
      const variantRaw = card.aircraft_variants;
      const variant = (Array.isArray(variantRaw) ? variantRaw[0] : variantRaw) as Record<string, unknown> | null;
      label = buildAircraftLabel(variant);
    }

    const hasImages = thumbnailUrl != null;
    const previewUrl = hasImages ? derivativePublicUrl(`${card.id}/preview.jpg`) : null;
    const ogUrl = hasImages ? derivativePublicUrl(`${card.id}/og.jpg`) : null;

    return {
      id: card.id as string,
      title: card.title as string | null,
      panel_count: card.panel_count as number | null,
      created_at: card.created_at as string,
      cover_side: card.cover_side as string,
      cover_spread_index: card.cover_spread_index as number,
      thumbnail_url: thumbnailUrl,
      preview_url: previewUrl,
      og_url: ogUrl,
      airline_name: (airline?.name as string) ?? null,
      aircraft_label: label,
      published_year: (card.published_year as number) ?? null,
    };
  }).filter((c) => opts?.includeUnpublished || c.thumbnail_url || c.og_url);
}

export async function fetchCardDetail(cardId: string): Promise<CardDetailData | null> {
  const [cardResult, scansResult, provResult, priceResult] = await Promise.all([
    supabase
      .from('safety_cards')
      .select(`
        id, title, panel_count, crop_width, crop_height,
        cover_spread_index, cover_side, pivot_index, is_booklet, created_at,
        published_year, revision, language, notes, airline_id,
        airlines ( name, logo_path, country ),
        aircraft_variants ( name, aircraft_models ( name, aircraft_manufacturers ( name, logo_path ) ) ),
        card_aircraft ( aircraft_variant_id, aircraft_model_id, sort_order,
          aircraft_variants ( name, aircraft_models ( id, name, manufacturer_id, aircraft_manufacturers ( id, name, logo_path ) ) ),
          aircraft_models ( id, name, manufacturer_id, aircraft_manufacturers ( id, name, logo_path ) )
        ),
        card_languages ( language, sort_order ),
        card_sides (
          id, side,
          card_panels (
            id, panel_index,
            panel_images ( variant, width_px, height_px, file_path )
          )
        ),
        card_creases ( between_panel, fold_direction, side, unfold_sequence )
      `)
      .eq('id', cardId)
      .single(),
    supabase
      .from('card_scans')
      .select('id, side, dpi, width_px, height_px, original_filename, mime_type, file_size_bytes, file_path')
      .eq('card_id', cardId),
    supabase
      .from('card_provenance')
      .select(`
        id, source, acquired_date, notes,
        card_documents ( id, file_path, original_filename, mime_type, file_size_bytes, label )
      `)
      .eq('card_id', cardId)
      .order('acquired_date', { ascending: false }),
    supabase
      .from('card_price_observations')
      .select(`
        id, price_usd, price_type, source, observed_date,
        card_documents ( id, file_path, original_filename, mime_type, file_size_bytes, label )
      `)
      .eq('card_id', cardId)
      .order('observed_date', { ascending: false }),
  ]);

  const { data: card, error } = cardResult;
  if (error || !card) return null;

  const rawScans = (scansResult.data ?? []) as Array<Record<string, unknown>>;
  const scanUrls = await Promise.all(
    rawScans.map(async (s) => {
      const filePath = s.file_path as string | null;
      if (!filePath) return { url: null, thumbnailUrl: null };
      const { data: signed } = await supabase.storage.from('scans').createSignedUrl(filePath, 3600);
      const url = signed?.signedUrl ?? null;
      return { url, thumbnailUrl: url };
    })
  );

  const scans: ScanInfo[] = rawScans.map((s, idx) => ({
    id: s.id as string,
    side: s.side as string | null,
    dpi: s.dpi as number,
    width_px: s.width_px as number,
    height_px: s.height_px as number,
    original_filename: s.original_filename as string | null,
    mime_type: s.mime_type as string | null,
    file_size_bytes: s.file_size_bytes as number | null,
    file_path: s.file_path as string | null,
    url: scanUrls[idx].url,
    thumbnailUrl: scanUrls[idx].thumbnailUrl,
  }));

  const sides = (card.card_sides ?? []) as Array<{
    id: string;
    side: string;
    card_panels: Array<{
      id: string;
      panel_index: number;
      panel_images: Array<{
        variant: string;
        width_px: number;
        height_px: number;
        file_path: string;
      }>;
    }>;
  }>;

  const panels: Panel[] = [];
  const displayUrls: Record<string, string> = {};
  const fullUrls: Record<string, string> = {};

  for (const side of sides) {
    for (const panel of side.card_panels ?? []) {
      const thumb = panel.panel_images?.find((i) => i.variant === 'thumbnail');
      const display = panel.panel_images?.find((i) => i.variant === 'display');
      const full = panel.panel_images?.find((i) => i.variant === 'full');
      const fallback = thumb ?? display ?? panel.panel_images?.[0];

      panels.push({
        id: panel.id,
        side: side.side as Side,
        panel_index: panel.panel_index,
        thumbnail_url: fallback ? derivativePublicUrl(fallback.file_path) : '',
        width_px: fallback?.width_px ?? undefined,
        height_px: fallback?.height_px ?? undefined,
      });

      if (display) {
        displayUrls[panel.id] = derivativePublicUrl(display.file_path);
      } else if (fallback) {
        displayUrls[panel.id] = derivativePublicUrl(fallback.file_path);
      }

      if (full) {
        fullUrls[panel.id] = derivativePublicUrl(full.file_path);
      }
    }
  }

  panels.sort((a, b) => {
    if (a.side === b.side) return a.panel_index - b.panel_index;
    return a.side === 'front' ? -1 : 1;
  });

  const rawCreases = (card.card_creases ?? []) as Array<{
    between_panel: number;
    fold_direction: string;
    side: string;
    unfold_sequence: number;
  }>;

  const creases: Crease[] = rawCreases.map((c) => ({
    between_panel: c.between_panel,
    fold_direction: c.fold_direction as Crease['fold_direction'],
    side: c.side as Side,
    unfold_sequence: c.unfold_sequence,
  }));

  const airlineRaw = card.airlines;
  const airline = (Array.isArray(airlineRaw) ? airlineRaw[0] : airlineRaw) as Record<string, unknown> | null;

  const airlineLogoPath = (airline?.logo_path as string) || null;
  const airlineLogoUrl = airlineLogoPath
    ? supabase.storage.from('entity-images').getPublicUrl(airlineLogoPath).data.publicUrl
    : null;

  // Build aircraft label from card_aircraft join table
  const cardAircraft = (card.card_aircraft ?? []) as Array<Record<string, unknown>>;
  let aircraftLabel: string | null = null;

  if (cardAircraft.length > 0) {
    const labels = cardAircraft
      .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
      .map((ca) => {
        const v = unwrap(ca.aircraft_variants);
        if (v) return buildAircraftLabel(v);
        const m = unwrap(ca.aircraft_models);
        if (m) {
          const mfr = unwrap(m.aircraft_manufacturers);
          return [mfr?.name, m.name].filter(Boolean).join(' ') || null;
        }
        return null;
      })
      .filter(Boolean);
    aircraftLabel = labels.join(', ') || null;
  } else {
    const variantRaw = card.aircraft_variants;
    const aircraftVariant = (Array.isArray(variantRaw) ? variantRaw[0] : variantRaw) as Record<string, unknown> | null;
    aircraftLabel = buildAircraftLabel(aircraftVariant);
  }

  // Build language from card_languages join table
  const cardLanguages = (card.card_languages ?? []) as Array<{ language: string; sort_order: number }>;
  let languageLabel: string | null = null;
  if (cardLanguages.length > 0) {
    languageLabel = cardLanguages
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((l) => l.language)
      .join(', ');
  } else {
    languageLabel = card.language ?? null;
  }

  // Structured aircraft entries for the edit form (group by model, collect variants)
  const aircraftByModel = new Map<string, DetailAircraftEntry>();
  for (const ca of cardAircraft.sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))) {
    const v = unwrap(ca.aircraft_variants);
    const m = unwrap(ca.aircraft_models);
    const model = v ? unwrap(v.aircraft_models) : m;
    const mfr = model ? unwrap(model.aircraft_manufacturers) : null;
    const modelId = (ca.aircraft_model_id as string) ?? '';
    const variantId = (ca.aircraft_variant_id as string) ?? null;
    const variantName = (v?.name as string) ?? '';

    const existing = aircraftByModel.get(modelId);
    if (existing) {
      if (variantId && !existing.variants.some((ev) => ev.id === variantId)) {
        existing.variants.push({ id: variantId, name: variantName });
      }
    } else {
      aircraftByModel.set(modelId, {
        modelId: modelId || null,
        modelName: (model?.name as string) ?? '',
        variantId: variantId,
        variantName: variantName,
        variants: variantId ? [{ id: variantId, name: variantName }] : [],
        manufacturerId: mfr ? ((mfr.id as string) ?? null) : null,
        manufacturerName: (mfr?.name as string) ?? '',
      });
    }
  }
  const structuredAircraft: DetailAircraftEntry[] = [...aircraftByModel.values()];

  let manufacturerLogoUrl: string | null = null;
  for (const ca of cardAircraft) {
    const v = unwrap(ca.aircraft_variants);
    const m = unwrap(ca.aircraft_models);
    const model = v ? unwrap(v.aircraft_models) : m;
    const mfr = model ? unwrap(model.aircraft_manufacturers) : null;
    const logoPath = (mfr?.logo_path as string) || null;
    if (logoPath) {
      manufacturerLogoUrl = supabase.storage.from('entity-images').getPublicUrl(logoPath).data.publicUrl;
      break;
    }
  }

  const structuredLanguages: string[] = cardLanguages.length > 0
    ? cardLanguages.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((l) => l.language)
    : card.language
      ? card.language.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

  // Build provenance with signed document URLs
  const rawProvenance = (provResult.data ?? []) as Array<{
    id: string;
    source: string | null;
    acquired_date: string | null;
    notes: string | null;
    card_documents: Array<{
      id: string;
      file_path: string;
      original_filename: string;
      mime_type: string | null;
      file_size_bytes: number | null;
      label: string | null;
    }>;
  }>;

  const provenance: DetailProvenanceEntry[] = await Promise.all(
    rawProvenance.map(async (p) => ({
      id: p.id,
      source: p.source,
      acquired_date: p.acquired_date,
      notes: p.notes,
      documents: await Promise.all(
        (p.card_documents ?? []).map(async (d) => ({
          id: d.id,
          file_path: d.file_path,
          original_filename: d.original_filename,
          mime_type: d.mime_type,
          file_size_bytes: d.file_size_bytes,
          label: d.label,
          url: await documentSignedUrl(d.file_path),
        }))
      ),
    }))
  );

  // Build price observations with signed document URLs
  const rawPrices = (priceResult.data ?? []) as Array<{
    id: string;
    price_usd: number | null;
    price_type: string | null;
    source: string | null;
    observed_date: string | null;
    card_documents: Array<{
      id: string;
      file_path: string;
      original_filename: string;
      mime_type: string | null;
      file_size_bytes: number | null;
      label: string | null;
    }>;
  }>;

  const priceObservations: DetailPriceObservation[] = await Promise.all(
    rawPrices.map(async (obs) => ({
      id: obs.id,
      price_usd: obs.price_usd,
      price_type: obs.price_type,
      source: obs.source,
      observed_date: obs.observed_date,
      documents: await Promise.all(
        (obs.card_documents ?? []).map(async (d) => ({
          id: d.id,
          file_path: d.file_path,
          original_filename: d.original_filename,
          mime_type: d.mime_type,
          file_size_bytes: d.file_size_bytes,
          label: d.label,
          url: await documentSignedUrl(d.file_path),
        }))
      ),
    }))
  );

  return {
    id: card.id,
    title: card.title,
    panel_count: card.panel_count,
    crop_width: card.crop_width,
    crop_height: card.crop_height,
    cover_spread_index: card.cover_spread_index,
    cover_side: card.cover_side,
    is_booklet: card.is_booklet === true,
    created_at: card.created_at,
    airline_name: (airline?.name as string) ?? null,
    aircraft_label: aircraftLabel,
    published_year: card.published_year ?? null,
    revision: card.revision ?? null,
    language: languageLabel,
    notes: card.notes ?? null,
    panels,
    creases,
    cover: {
      spreadIndex: card.cover_spread_index,
      side: card.cover_side as Side,
    },
    pivotIndex: card.pivot_index ?? null,
    displayUrls,
    fullUrls,
    scans,
    provenance,
    priceObservations,
    preview_url: derivativePublicUrl(`${cardId}/preview.jpg`),
    thumbnail_url: (() => {
      const coverPanel = panels.find(
        (p) => p.side === (card.cover_side as string) && p.panel_index === (card.cover_spread_index as number)
      );
      const panel = coverPanel ?? panels[0];
      if (!panel) return null;
      return displayUrls[panel.id] || fullUrls[panel.id] || panel.thumbnail_url || null;
    })(),
    og_url: derivativePublicUrl(`${cardId}/og.jpg`),
    airline_id: (card.airline_id as string) ?? null,
    airline_country: (airline?.country as string) ?? null,
    airline_logo_url: airlineLogoUrl,
    manufacturer_logo_url: manufacturerLogoUrl,
    aircraft: structuredAircraft,
    languages: structuredLanguages,
  };
}

// ─── Update Card Metadata ─────────────────────────────────────────

export async function updateCardMetadata(
  cardId: string,
  update: CardMetadataUpdate
): Promise<{ success: boolean; error?: string }> {
  const primaryVariantId = update.aircraft.flatMap((a) => a.variantIds).find(Boolean) ?? null;
  const legacyLanguage = update.languages.join(', ') || null;

  const { error: cardErr } = await supabase
    .from('safety_cards')
    .update({
      title: update.title,
      airline_id: update.airlineId,
      aircraft_variant_id: primaryVariantId,
      published_year: update.publishedYear,
      revision: update.revision,
      language: legacyLanguage,
      notes: update.notes,
    })
    .eq('id', cardId);

  if (cardErr) return { success: false, error: cardErr.message };

  await supabase.from('card_aircraft').delete().eq('card_id', cardId);
  if (update.aircraft.length > 0) {
    const rows: Array<{ card_id: string; aircraft_model_id: string; aircraft_variant_id: string | null; sort_order: number }> = [];
    let sortOrder = 0;
    for (const a of update.aircraft) {
      if (!a.modelId) continue;
      if (a.variantIds.length === 0) {
        rows.push({
          card_id: cardId,
          aircraft_model_id: a.modelId,
          aircraft_variant_id: null,
          sort_order: sortOrder++,
        });
      } else {
        for (const vid of a.variantIds) {
          rows.push({
            card_id: cardId,
            aircraft_model_id: a.modelId,
            aircraft_variant_id: vid,
            sort_order: sortOrder++,
          });
        }
      }
    }
    if (rows.length > 0) {
      const { error: acErr } = await supabase.from('card_aircraft').insert(rows);
      if (acErr) return { success: false, error: acErr.message };
    }
  }

  await supabase.from('card_languages').delete().eq('card_id', cardId);
  if (update.languages.length > 0) {
    const rows = update.languages.map((lang, i) => ({
      card_id: cardId,
      language: lang,
      sort_order: i,
    }));
    const { error: langErr } = await supabase.from('card_languages').insert(rows);
    if (langErr) return { success: false, error: langErr.message };
  }

  return { success: true };
}

// ─── Update Card Folds ────────────────────────────────────────────

export async function updateCardFolds(
  cardId: string,
  creases: Crease[],
  cover: { spreadIndex: number; side: Side },
  pivotIndex: number | null,
  isBooklet?: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: cardErr } = await supabase
      .from('safety_cards')
      .update({
        cover_spread_index: cover.spreadIndex,
        cover_side: cover.side,
        pivot_index: pivotIndex,
        is_booklet: isBooklet ?? false,
      })
      .eq('id', cardId);
    if (cardErr) return { success: false, error: cardErr.message };

    await supabase.from('card_creases').delete().eq('card_id', cardId);

    if (creases.length > 0) {
      const rows = creases.map((c) => ({
        card_id: cardId,
        between_panel: c.between_panel,
        fold_direction: c.fold_direction,
        side: c.side,
        unfold_sequence: c.unfold_sequence,
      }));
      const { error: insErr } = await supabase.from('card_creases').insert(rows);
      if (insErr) return { success: false, error: insErr.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Fetch Card For Crop Editing ──────────────────────────────────

export interface CropEditScan {
  id: string;
  filePath: string;
  downloadUrl: string;
  thumbnailUrl: string;
  originalFilename: string;
  mimeType: string;
}

export interface CropEditPanel {
  panelIndex: number;
  side: string;
  scanId: string;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  rotationDeg: number;
  thumbnailUrl: string;
}

export interface CropEditData {
  panelCount: number;
  cropWidth: number | null;
  cropHeight: number | null;
  scans: CropEditScan[];
  panels: CropEditPanel[];
  sideIds: Record<string, string>;
}

export async function fetchCardForCropEditing(cardId: string): Promise<CropEditData | null> {
  const { data: card, error } = await supabase
    .from('safety_cards')
    .select(`
      panel_count, crop_width, crop_height,
      card_sides (
        id, side,
        card_panels (
          panel_index,
          panel_crops ( scan_id, x, y, width, height, rotation_deg ),
          panel_images ( variant, file_path )
        )
      )
    `)
    .eq('id', cardId)
    .single();

  if (error || !card) return null;

  const { data: scans } = await supabase
    .from('card_scans')
    .select('id, file_path, original_filename, mime_type')
    .eq('card_id', cardId);

  const scanEntries: CropEditScan[] = [];
  for (const scan of (scans ?? []) as Array<{ id: string; file_path: string; original_filename: string | null; mime_type: string | null }>) {
    const { data: signed } = await supabase.storage.from('scans').createSignedUrl(scan.file_path, 3600);
    const url = signed?.signedUrl ?? '';
    scanEntries.push({
      id: scan.id,
      filePath: scan.file_path,
      downloadUrl: url,
      thumbnailUrl: url,
      originalFilename: scan.original_filename ?? 'scan',
      mimeType: scan.mime_type ?? 'image/jpeg',
    });
  }

  const sideIds: Record<string, string> = {};
  const panels: CropEditPanel[] = [];

  for (const side of (card.card_sides ?? []) as Array<{
    id: string;
    side: string;
    card_panels: Array<{
      panel_index: number;
      panel_crops: Array<{ scan_id: string; x: number; y: number; width: number; height: number; rotation_deg: number }>;
      panel_images: Array<{ variant: string; file_path: string }>;
    }>;
  }>) {
    sideIds[side.side] = side.id;
    for (const panel of side.card_panels ?? []) {
      const crop = panel.panel_crops?.[0];
      if (!crop) continue;
      const thumb = panel.panel_images?.find((i) => i.variant === 'thumbnail');
      panels.push({
        panelIndex: panel.panel_index,
        side: side.side,
        scanId: crop.scan_id,
        cropX: crop.x,
        cropY: crop.y,
        cropWidth: crop.width,
        cropHeight: crop.height,
        rotationDeg: crop.rotation_deg,
        thumbnailUrl: thumb ? derivativePublicUrl(thumb.file_path) : '',
      });
    }
  }

  return {
    panelCount: card.panel_count as number ?? 0,
    cropWidth: card.crop_width as number | null,
    cropHeight: card.crop_height as number | null,
    scans: scanEntries,
    panels,
    sideIds,
  };
}

// ─── Update Card Panels (Crop Editing) ────────────────────────────

export async function updateCardPanels(
  cardId: string,
  state: WizardState,
  sideIds: Record<string, string>,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; error?: string }> {
  const report = (stage: string, current: number, total: number) =>
    onProgress?.({ stage, current, total });

  try {
    // Persist crop dimensions immediately so subsequent sessions see them
    await supabase
      .from('safety_cards')
      .update({ crop_width: state.cropWidth, crop_height: state.cropHeight })
      .eq('id', cardId);

    const dirtySlots = state.slots.filter((s) => s.dirty);

    if (dirtySlots.length === 0) {
      return { success: true };
    }

    // Build a lookup of existing DB panels keyed by "sideId:panelIndex"
    const { data: existingSides } = await supabase
      .from('card_sides')
      .select('id, side, card_panels ( id, panel_index )')
      .eq('card_id', cardId);

    const existingPanelMap = new Map<string, string>();
    if (existingSides) {
      for (const side of existingSides as Array<{ id: string; side: string; card_panels: Array<{ id: string; panel_index: number }> }>) {
        for (const panel of side.card_panels ?? []) {
          existingPanelMap.set(`${side.id}:${panel.panel_index}`, panel.id);
        }
      }
    }

    report('Cleaning up changed panels', 0, dirtySlots.length);

    for (const slot of dirtySlots) {
      const sideId = sideIds[slot.side];
      if (!sideId) continue;
      const oldPanelId = existingPanelMap.get(`${sideId}:${slot.panelIndex}`);
      if (!oldPanelId) continue;

      const { data: oldImages } = await supabase
        .from('panel_images')
        .select('file_path')
        .eq('panel_id', oldPanelId);

      if (oldImages) {
        const paths = (oldImages as Array<{ file_path: string }>).map((i) => i.file_path);
        if (paths.length > 0) {
          await supabase.storage.from('derivatives').remove(paths);
        }
      }

      await supabase.from('panel_images').delete().eq('panel_id', oldPanelId);
      await supabase.from('panel_crops').delete().eq('panel_id', oldPanelId);
      await supabase.from('card_panels').delete().eq('id', oldPanelId);
    }

    const filledDirtySlots = dirtySlots.filter((s) => s.cropRegion && s.imageId);
    const panelImageRows: Array<{
      panel_id: string;
      variant: string;
      width_px: number;
      height_px: number;
      file_path: string;
    }> = [];

    for (let idx = 0; idx < filledDirtySlots.length; idx++) {
      const slot = filledDirtySlots[idx];
      report('Processing panels', idx + 1, filledDirtySlots.length);

      const sideId = sideIds[slot.side];
      const image = state.images.find((i) => i.id === slot.imageId);
      if (!sideId || !image || !slot.cropRegion) continue;

      const { data: panel, error: panelErr } = await supabase
        .from('card_panels')
        .insert({ side_id: sideId, panel_index: slot.panelIndex })
        .select('id')
        .single();

      if (panelErr || !panel) {
        return { success: false, error: `Failed to create panel: ${panelErr?.message}` };
      }

      const panelId = panel.id as string;

      const { error: cropErr } = await supabase.from('panel_crops').insert({
        panel_id: panelId,
        scan_id: slot.imageId,
        x: Math.round(slot.cropRegion.x),
        y: Math.round(slot.cropRegion.y),
        width: Math.round(slot.cropRegion.width),
        height: Math.round(slot.cropRegion.height),
        rotation_deg: image.rotation,
        scale: 1,
      });

      if (cropErr) {
        return { success: false, error: `Failed to save crop: ${cropErr.message}` };
      }

      const imgEl = await loadImage(image.imageUrl);

      const fullBlob = await extractCropWithRotation(imgEl, slot.cropRegion, image.rotation, {
        format: 'jpeg',
        quality: 0.92,
      });
      const fullPath = `${cardId}/${panelId}_full.jpg`;
      await supabase.storage.from('derivatives').upload(fullPath, fullBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      const fullDims = await blobDimensions(fullBlob);

      const displayBlob = await extractCropWithRotation(imgEl, slot.cropRegion, image.rotation, {
        targetWidth: 800,
        format: 'jpeg',
        quality: 0.85,
      });
      const displayPath = `${cardId}/${panelId}_display.jpg`;
      await supabase.storage.from('derivatives').upload(displayPath, displayBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      const displayDims = await blobDimensions(displayBlob);

      const thumbBlob = await extractCropWithRotation(imgEl, slot.cropRegion, image.rotation, {
        targetWidth: 300,
        format: 'jpeg',
        quality: 0.8,
      });
      const thumbPath = `${cardId}/${panelId}_thumbnail.jpg`;
      await supabase.storage.from('derivatives').upload(thumbPath, thumbBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      const thumbDims = await blobDimensions(thumbBlob);

      panelImageRows.push(
        { panel_id: panelId, variant: 'full', width_px: fullDims.width, height_px: fullDims.height, file_path: fullPath },
        { panel_id: panelId, variant: 'display', width_px: displayDims.width, height_px: displayDims.height, file_path: displayPath },
        { panel_id: panelId, variant: 'thumbnail', width_px: thumbDims.width, height_px: thumbDims.height, file_path: thumbPath },
      );
    }

    if (panelImageRows.length > 0) {
      const { error: imgErr } = await supabase.from('panel_images').insert(panelImageRows);
      if (imgErr) return { success: false, error: `Failed to save panel images: ${imgErr.message}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Delete Card ──────────────────────────────────────────────────

export async function deleteCard(cardId: string): Promise<{ success: boolean; error?: string }> {
  // Delete storage objects first (documents, derivatives, then scans)
  const { data: docs } = await supabase
    .from('card_documents')
    .select('file_path')
    .eq('card_id', cardId);

  if (docs) {
    const paths = docs.map((d: { file_path: string }) => d.file_path);
    if (paths.length > 0) {
      await supabase.storage.from('documents').remove(paths);
    }
  }

  const { data: panelImages } = await supabase
    .from('panel_images')
    .select('file_path, panel_id, card_panels!inner( side_id, card_sides!inner( card_id ) )')
    .eq('card_panels.card_sides.card_id', cardId);

  if (panelImages) {
    const paths = panelImages.map((i: { file_path: string }) => i.file_path);
    if (paths.length > 0) {
      await supabase.storage.from('derivatives').remove(paths);
    }
  }

  const { data: scans } = await supabase
    .from('card_scans')
    .select('file_path')
    .eq('card_id', cardId);

  if (scans) {
    const paths = scans.map((s: { file_path: string }) => s.file_path);
    if (paths.length > 0) {
      await supabase.storage.from('scans').remove(paths);
    }
  }

  const { error } = await supabase.from('safety_cards').delete().eq('id', cardId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── Add / Delete Provenance ──────────────────────────────────────

export interface AddDocumentInput {
  file: File;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  label?: string;
}

async function uploadDocuments(
  cardId: string,
  parentId: string,
  parentField: 'provenance_id' | 'price_observation_id',
  docs: AddDocumentInput[]
): Promise<{ success: boolean; error?: string }> {
  for (const doc of docs) {
    const docId = crypto.randomUUID();
    const ext = doc.originalFilename.split('.').pop()?.toLowerCase() || 'bin';
    const docPath = `${cardId}/${docId}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(docPath, doc.file, { contentType: doc.mimeType || 'application/octet-stream' });
    if (uploadErr) return { success: false, error: `Upload failed: ${uploadErr.message}` };

    const { error: insertErr } = await supabase.from('card_documents').insert({
      id: docId,
      card_id: cardId,
      [parentField]: parentId,
      file_path: docPath,
      original_filename: doc.originalFilename,
      mime_type: doc.mimeType || null,
      file_size_bytes: doc.fileSizeBytes,
      label: doc.label || null,
    });
    if (insertErr) return { success: false, error: `Document record failed: ${insertErr.message}` };
  }
  return { success: true };
}

export async function addProvenanceEntry(
  cardId: string,
  entry: { source: string | null; acquiredDate: string | null; notes: string | null },
  documents?: AddDocumentInput[]
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.from('card_provenance').insert({
    card_id: cardId,
    source: entry.source || null,
    acquired_date: entry.acquiredDate || null,
    notes: entry.notes || null,
  }).select('id').single();
  if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' };

  if (documents && documents.length > 0) {
    const docResult = await uploadDocuments(cardId, data.id, 'provenance_id', documents);
    if (!docResult.success) return docResult;
  }
  return { success: true };
}

export async function deleteProvenanceEntry(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('card_provenance').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── Add / Delete Price Observation ───────────────────────────────

export async function addPriceObservation(
  cardId: string,
  obs: { priceUsd: number | null; priceType: string | null; source: string | null; observedDate: string | null },
  documents?: AddDocumentInput[]
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.from('card_price_observations').insert({
    card_id: cardId,
    price_usd: obs.priceUsd,
    price_type: obs.priceType || null,
    source: obs.source || null,
    observed_date: obs.observedDate || null,
  }).select('id').single();
  if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' };

  if (documents && documents.length > 0) {
    const docResult = await uploadDocuments(cardId, data.id, 'price_observation_id', documents);
    if (!docResult.success) return docResult;
  }
  return { success: true };
}

export async function deletePriceObservation(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('card_price_observations').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── Create Blank Card ───────────────────────────────────────────

export async function createBlankCard(): Promise<{ cardId: string | null; error?: string }> {
  const { data: card, error: cardErr } = await supabase
    .from('safety_cards')
    .insert({ panel_count: 3 })
    .select('id')
    .single();

  if (cardErr || !card) {
    return { cardId: null, error: cardErr?.message ?? 'Failed to create card' };
  }

  const cardId = card.id as string;

  const { error: sidesErr } = await supabase
    .from('card_sides')
    .insert([
      { card_id: cardId, side: 'front' },
      { card_id: cardId, side: 'back' },
    ]);

  if (sidesErr) {
    await supabase.from('safety_cards').delete().eq('id', cardId);
    return { cardId: null, error: sidesErr.message };
  }

  return { cardId };
}

// ─── Upload Scans to Existing Card ───────────────────────────────

export async function uploadScansToCard(
  cardId: string,
  files: File[]
): Promise<{ success: boolean; error?: string }> {
  for (const file of files) {
    const sha256 = await computeSha256(file);
    const ext = fileExtension(file);
    const scanId = crypto.randomUUID();
    const storagePath = `${cardId}/${scanId}.${ext}`;

    const img = await loadImage(URL.createObjectURL(file));
    const width = img.naturalWidth;
    const height = img.naturalHeight;

    const { error: uploadErr } = await supabase.storage
      .from('scans')
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadErr) {
      return { success: false, error: `Upload failed: ${uploadErr.message}` };
    }

    const { error: dbErr } = await supabase.from('card_scans').insert({
      id: scanId,
      card_id: cardId,
      dpi: 600,
      width_px: width,
      height_px: height,
      file_path: storagePath,
      original_filename: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      sha256_hash: sha256,
    });

    if (dbErr) {
      return { success: false, error: `DB insert failed: ${dbErr.message}` };
    }
  }

  return { success: true };
}

// ─── Update Panel Count ──────────────────────────────────────────

export async function updatePanelCount(
  cardId: string,
  panelCount: number
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('safety_cards')
    .update({ panel_count: panelCount })
    .eq('id', cardId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── Update Booklet Flag ─────────────────────────────────────────

export async function updateBookletFlag(
  cardId: string,
  isBooklet: boolean
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('safety_cards')
    .update({ is_booklet: isBooklet })
    .eq('id', cardId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
