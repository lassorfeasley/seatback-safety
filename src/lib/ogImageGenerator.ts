import { supabase } from './supabase';
import type { Panel, Crease, CoverDesignation } from '@/components/FoldEditor/types';

const OG_SIZE = 1200;
const BG_COLOR = '#ebeaef'; // oklch(92% 0.004 286.32)
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
  creases: Crease[];
  cover: CoverDesignation;
  pivotIndex?: number;
  displayUrls: Record<string, string>;
}

interface LoadedPanel {
  panel: Panel;
  img: HTMLImageElement;
}

/**
 * Generate a 1200x1200 OG image as a JPEG Blob.
 *
 * Shows the cover panel straight-on, matching the folded-card view
 * from the visualizer.
 */
export async function generateOgImage(
  input: OgImageInput
): Promise<Blob> {
  const { panels, cover, displayUrls } = input;

  const coverSidePanels = panels
    .filter((p) => p.side === cover.side)
    .sort((a, b) => a.panel_index - b.panel_index);

  if (coverSidePanels.length === 0) throw new Error('No panels on cover side');

  // Only the cover panel is visible when the card is fully folded.
  const coverPanelDef = coverSidePanels.find((p) => p.panel_index === cover.spreadIndex)
    ?? coverSidePanels[0];

  const url = displayUrls[coverPanelDef.id] || coverPanelDef.thumbnail_url;
  if (!url) throw new Error('No image URL for cover panel');

  const img = await loadImage(url);
  const visible: LoadedPanel[] = [{ panel: coverPanelDef, img }];

  const canvas = document.createElement('canvas');
  canvas.width = OG_SIZE;
  canvas.height = OG_SIZE;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, OG_SIZE, OG_SIZE);

  // Scale each panel individually so they all render at the same height
  const targetH = 900;
  const panelWidths = visible.map((l) => l.img.naturalWidth * (targetH / l.img.naturalHeight));
  const totalW = panelWidths.reduce((sum, w) => sum + w, 0);

  const maxW = OG_SIZE - 2 * SHADOW_OFFSET_X;
  const downscale = totalW > maxW ? maxW / totalW : 1;
  const stripH = targetH * downscale;
  const stripW = totalW * downscale;

  const combinedH = SHADOW_OFFSET_Y + stripH;
  const originX = OG_SIZE / 2 - stripW / 2;
  const originY = OG_SIZE / 2 - combinedH / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = SHADOW_COLOR;
  ctx.fillRect(originX + SHADOW_OFFSET_X, originY + SHADOW_OFFSET_Y, stripW, stripH);

  let cursorX = originX;
  for (let i = 0; i < visible.length; i++) {
    const w = panelWidths[i] * downscale;
    ctx.drawImage(visible[i].img, cursorX, originY, w, stripH);
    cursorX += w;
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
