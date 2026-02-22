import { supabase } from './supabase';
import type { Panel, CoverDesignation } from '@/components/FoldEditor/types';

const OG_SIZE = 1200;
const BG_COLOR = '#ebeaef'; // oklch(92% 0.004 286.32)
const SHADOW_COLOR = '#a8a7b2'; // oklch(70.5% 0.015 286.067) - solid offset rect, no blur
const SHADOW_OFFSET_X = 100;
const SHADOW_OFFSET_Y = 100;
const FAN_OFFSET = 18; // px per panel distance from cover — subtle peek effect

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

  const coverIdx = cover.spreadIndex;

  // Scale all panels to a uniform height
  const maxNatW = Math.max(...loaded.map((l) => l.img.naturalWidth));
  const maxNatH = Math.max(...loaded.map((l) => l.img.naturalHeight));
  const envelopeH = 900;
  const scale = envelopeH / maxNatH;
  const envelopeW = maxNatW * scale;

  // Fan: all non-cover panels offset to the LEFT of the cover, ordered
  // by distance from cover (farthest = most offset). This mimics holding
  // a folded card where inner panels peek out from one side.
  const maxDist = Math.max(0, ...loaded.map((l) => Math.abs(l.panel.panel_index - coverIdx)));
  const totalFanExtent = maxDist * FAN_OFFSET;

  // Center the cover horizontally; account for the fan extending to the left
  const combinedH = SHADOW_OFFSET_Y + envelopeH;
  const coverCenterX = OG_SIZE / 2;
  const originY = OG_SIZE / 2 - combinedH / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Shadow spans the full fanned extent
  const shadowW = envelopeW + totalFanExtent;
  ctx.fillStyle = SHADOW_COLOR;
  ctx.fillRect(
    coverCenterX - envelopeW / 2 - totalFanExtent + SHADOW_OFFSET_X,
    originY + SHADOW_OFFSET_Y,
    shadowW,
    envelopeH,
  );

  // Draw panels back-to-front: farthest from cover first, cover last on top
  const sorted = [...loaded].sort((a, b) => {
    const distA = Math.abs(a.panel.panel_index - coverIdx);
    const distB = Math.abs(b.panel.panel_index - coverIdx);
    return distB - distA;
  });

  for (const { panel, img } of sorted) {
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const dist = Math.abs(panel.panel_index - coverIdx);
    const fanX = -dist * FAN_OFFSET;
    const px = coverCenterX - envelopeW / 2 + (envelopeW - w) / 2 + fanX;
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
