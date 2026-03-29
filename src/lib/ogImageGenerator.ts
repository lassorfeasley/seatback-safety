import { supabase } from './supabase';
import type { Panel, Crease, CoverDesignation } from '@/components/FoldEditor/types';

const OG_SIZE = 1200;
const BG_COLOR = '#ebeaef';
const SHADOW_COLOR = '#a8a7b2';
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

export interface OgImageInput {
  panels: Panel[];
  creases: Crease[];
  cover: CoverDesignation;
  pivotIndex?: number;
  displayUrls: Record<string, string>;
  secondPanel?: {
    panelId: string;
    offsetX: number; // normalised -1..1 (0 = centered behind cover)
  };
}

/**
 * Generate a 1200x1200 OG image as a JPEG Blob.
 *
 * If secondPanel is provided, two panels are composited: the second panel
 * is drawn first (behind), offset horizontally, then the cover panel is
 * drawn on top. Otherwise only the cover panel is rendered.
 */
export async function generateOgImage(
  input: OgImageInput
): Promise<Blob> {
  const { panels, cover, displayUrls, secondPanel } = input;

  const coverSidePanels = panels
    .filter((p) => p.side === cover.side)
    .sort((a, b) => a.panel_index - b.panel_index);

  if (coverSidePanels.length === 0) throw new Error('No panels on cover side');

  const coverPanelDef = coverSidePanels.find((p) => p.panel_index === cover.spreadIndex)
    ?? coverSidePanels[0];

  const coverUrl = displayUrls[coverPanelDef.id] || coverPanelDef.thumbnail_url;
  if (!coverUrl) throw new Error('No image URL for cover panel');

  const coverImg = await loadImage(coverUrl);

  const canvas = document.createElement('canvas');
  canvas.width = OG_SIZE;
  canvas.height = OG_SIZE;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, OG_SIZE, OG_SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const targetH = 900;

  if (secondPanel) {
    const secondDef = panels.find((p) => p.id === secondPanel.panelId);
    const secondUrl = secondDef
      ? (displayUrls[secondDef.id] || secondDef.thumbnail_url)
      : null;

    if (secondDef && secondUrl) {
      const secondImg = await loadImage(secondUrl);

      const coverW = coverImg.naturalWidth * (targetH / coverImg.naturalHeight);
      const secondW = secondImg.naturalWidth * (targetH / secondImg.naturalHeight);

      // Scale both panels to fit within the canvas
      const maxSingleW = OG_SIZE - 2 * SHADOW_OFFSET_X;
      const coverScale = Math.min(1, maxSingleW / coverW);
      const secondScale = Math.min(1, maxSingleW / secondW);
      const scale = Math.min(coverScale, secondScale);

      const cW = coverW * scale;
      const cH = targetH * scale;
      const sW = secondW * scale;
      const sH = targetH * scale;

      // Cover center is at 0; second panel center is shifted by offsetX.
      const maxShift = (cW + sW) / 2;
      const shiftPx = secondPanel.offsetX * maxShift;

      // Bounding box relative to cover center
      const rawCoverL = -cW / 2;
      const rawCoverR = cW / 2;
      const rawSecondL = shiftPx - sW / 2;
      const rawSecondR = shiftPx + sW / 2;
      const compLeft = Math.min(rawCoverL, rawSecondL);
      const compRight = Math.max(rawCoverR, rawSecondR);
      const compW = compRight - compLeft;
      const compCenter = (compLeft + compRight) / 2;

      // Center the entire composition in the canvas
      const centerX = OG_SIZE / 2 - compCenter;
      const coverX = centerX - cW / 2;
      const secondX = centerX + shiftPx - sW / 2;

      const combinedH = SHADOW_OFFSET_Y + cH;
      const originY = OG_SIZE / 2 - combinedH / 2;

      // Shadow behind entire composite
      const shadowL = centerX + compLeft;
      ctx.fillStyle = SHADOW_COLOR;
      ctx.fillRect(shadowL + SHADOW_OFFSET_X, originY + SHADOW_OFFSET_Y, compW, cH);

      // Draw second panel first (behind)
      ctx.drawImage(secondImg, secondX, originY, sW, sH);
      // Draw cover on top
      ctx.drawImage(coverImg, coverX, originY, cW, cH);
    } else {
      drawSinglePanel(ctx, coverImg, targetH);
    }
  } else {
    drawSinglePanel(ctx, coverImg, targetH);
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

function drawSinglePanel(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  targetH: number,
) {
  const w = img.naturalWidth * (targetH / img.naturalHeight);
  const maxW = OG_SIZE - 2 * SHADOW_OFFSET_X;
  const scale = Math.min(1, maxW / w);
  const dw = w * scale;
  const dh = targetH * scale;

  const combinedH = SHADOW_OFFSET_Y + dh;
  const originX = OG_SIZE / 2 - dw / 2;
  const originY = OG_SIZE / 2 - combinedH / 2;

  ctx.fillStyle = SHADOW_COLOR;
  ctx.fillRect(originX + SHADOW_OFFSET_X, originY + SHADOW_OFFSET_Y, dw, dh);
  ctx.drawImage(img, originX, originY, dw, dh);
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

/**
 * Generate a 1200x1200 OG image from a single scan URL and upload it.
 */
export async function generateAndUploadOgFromScan(
  cardId: string,
  scanUrl: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const img = await loadImage(scanUrl);

    const canvas = document.createElement('canvas');
    canvas.width = OG_SIZE;
    canvas.height = OG_SIZE;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, OG_SIZE, OG_SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    drawSinglePanel(ctx, img, 900);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to create OG blob'))),
        'image/jpeg',
        0.92
      );
    });

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
