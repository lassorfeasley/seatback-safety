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
}

export interface CardDetailData {
  id: string;
  title: string | null;
  panel_count: number | null;
  crop_width: number | null;
  crop_height: number | null;
  cover_spread_index: number;
  cover_side: string;
  created_at: string;
  panels: Panel[];
  creases: Crease[];
  cover: CoverDesignation;
  displayUrls: Record<string, string>;
  fullUrls: Record<string, string>;
  scans: ScanInfo[];
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

    const { data: card, error: cardErr } = await supabase
      .from('safety_cards')
      .insert({
        panel_count: state.panelCount,
        crop_width: state.cropWidth,
        crop_height: state.cropHeight,
        cover_spread_index: state.cover.spreadIndex,
        cover_side: state.cover.side,
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
      report('Uploading scans', idx + 1, imagesToUpload.length);

      const sha256 = await computeSha256(image.imageFile);
      const ext = fileExtension(image.imageFile);
      const scanId = crypto.randomUUID();
      const storagePath = `${cardId}/${scanId}.${ext}`;
      const dims = await getImageDimensions(image);

      const { error: uploadErr } = await supabase.storage
        .from('scans')
        .upload(storagePath, image.imageFile, {
          contentType: image.imageFile.type,
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
        original_filename: image.imageFile.name,
        mime_type: image.imageFile.type,
        file_size_bytes: image.imageFile.size,
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

export async function fetchCards(): Promise<CardSummary[]> {
  const { data: cards, error } = await supabase
    .from('safety_cards')
    .select(`
      id, title, panel_count, cover_spread_index, cover_side, created_at,
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

    // Fallback: grab the first available thumbnail from any panel
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

    return {
      id: card.id as string,
      title: card.title as string | null,
      panel_count: card.panel_count as number | null,
      created_at: card.created_at as string,
      cover_side: card.cover_side as string,
      cover_spread_index: card.cover_spread_index as number,
      thumbnail_url: thumbnailUrl,
    };
  });
}

export async function fetchCardDetail(cardId: string): Promise<CardDetailData | null> {
  const [cardResult, scansResult] = await Promise.all([
    supabase
      .from('safety_cards')
      .select(`
        id, title, panel_count, crop_width, crop_height,
        cover_spread_index, cover_side, created_at,
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
      .select('id, side, dpi, width_px, height_px, original_filename, mime_type, file_size_bytes')
      .eq('card_id', cardId),
  ]);

  const { data: card, error } = cardResult;
  if (error || !card) return null;

  const scans: ScanInfo[] = (scansResult.data ?? []).map((s: Record<string, unknown>) => ({
    id: s.id as string,
    side: s.side as string | null,
    dpi: s.dpi as number,
    width_px: s.width_px as number,
    height_px: s.height_px as number,
    original_filename: s.original_filename as string | null,
    mime_type: s.mime_type as string | null,
    file_size_bytes: s.file_size_bytes as number | null,
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

  return {
    id: card.id,
    title: card.title,
    panel_count: card.panel_count,
    crop_width: card.crop_width,
    crop_height: card.crop_height,
    cover_spread_index: card.cover_spread_index,
    cover_side: card.cover_side,
    created_at: card.created_at,
    panels,
    creases,
    cover: {
      spreadIndex: card.cover_spread_index,
      side: card.cover_side as Side,
    },
    displayUrls,
    fullUrls,
    scans,
  };
}

export async function deleteCard(cardId: string): Promise<{ success: boolean; error?: string }> {
  // Delete storage objects first (derivatives then scans)
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
