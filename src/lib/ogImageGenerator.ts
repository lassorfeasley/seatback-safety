import { supabase } from './supabase';
import type { Panel, CoverDesignation } from '@/components/FoldEditor/types';

const OG_SIZE = 1200;
const BG_COLOR = '#ebeaef'; // oklch(92% 0.004 286.32)
const CARD_PADDING = 120;
const SHADOW_COLOR = '#a8a7b2'; // oklch(70.5% 0.015 286.067) - solid offset rect, no blur
const SHADOW_OFFSET_X = 100;
const SHADOW_OFFSET_Y = 100;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

interface OgImageInput {
  panels: Panel[];
  cover: CoverDesignation;
  displayUrls: Record<string, string>;
}

interface LoadedPanel {
  panel: Panel;
  img: HTMLImageElement;
}

/**
 * Generate a 1200x1200 OG image as a JPEG Blob.
 *
 * Layout: flat perspective—gray background, solid offset shadow.
 * All panels on the cover side are drawn back-to-front so that
 * any panel larger than the cover peeks out from behind it.
 */
export async function generateOgImage(
  input: OgImageInput
): Promise<Blob> {
  const { panels, cover, displayUrls } = input;

  // Gather all panels on the cover side, sorted by index
  const coverSidePanels = panels
    .filter((p) => p.side === cover.side)
    .sort((a, b) => a.panel_index - b.panel_index);

  if (coverSidePanels.length === 0) throw new Error('No panels on cover side');

  // Load all panel images
  const loaded: LoadedPanel[] = [];
  for (const p of coverSidePanels) {
    const url = displayUrls[p.id] || p.thumbnail_url;
    if (!url) continue;
    try {
      const img = await loadImage(url);
      loaded.push({ panel: p, img });
    } catch {
      // skip panels that fail to load
    }
  }
  if (loaded.length === 0) throw new Error('No panel images could be loaded');

  const canvas = document.createElement('canvas');
  canvas.width = OG_SIZE;
  canvas.height = OG_SIZE;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, OG_SIZE, OG_SIZE);

  // Find the bounding box across all loaded panels to determine max extent
  const maxNatW = Math.max(...loaded.map((l) => l.img.naturalWidth));
  const maxNatH = Math.max(...loaded.map((l) => l.img.naturalHeight));
  const envelopeAspect = maxNatW / maxNatH;

  // Lock height so all cards render at the same vertical size
  const envelopeH = 900;
  const envelopeW = envelopeH * envelopeAspect;

  const scale = envelopeW / maxNatW;

  // Center the combined envelope+shadow
  const combinedH = SHADOW_OFFSET_Y + envelopeH;
  const originX = OG_SIZE / 2 - envelopeW / 2;
  const originY = OG_SIZE / 2 - combinedH / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw solid offset shadow sized to the full envelope
  ctx.fillStyle = SHADOW_COLOR;
  ctx.fillRect(originX + SHADOW_OFFSET_X, originY + SHADOW_OFFSET_Y, envelopeW, envelopeH);

  // Draw panels back-to-front: farthest from cover first, cover last on top
  // Order: panels far from cover index → cover index
  const coverIdx = cover.spreadIndex;
  const sorted = [...loaded].sort((a, b) => {
    const distA = Math.abs(a.panel.panel_index - coverIdx);
    const distB = Math.abs(b.panel.panel_index - coverIdx);
    return distB - distA;
  });

  for (const { img } of sorted) {
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    // Center each panel within the envelope
    const px = originX + (envelopeW - w) / 2;
    const py = originY + (envelopeH - h) / 2;
    ctx.drawImage(img, px, py, w, h);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create OG image blob'));
      },
      'image/jpeg',
      0.92
    );
  });
}

/**
 * Generate the OG image and upload it to the derivatives bucket.
 */
export async function generateAndUploadOgImage(
  cardId: string,
  input: OgImageInput
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const blob = await generateOgImage(input);
    const path = `${cardId}/og.jpg`;

    const { error } = await supabase.storage.from('derivatives').upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });

    if (error) return { success: false, error: error.message };

    const { data } = supabase.storage.from('derivatives').getPublicUrl(path);
    return { success: true, url: data.publicUrl };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
