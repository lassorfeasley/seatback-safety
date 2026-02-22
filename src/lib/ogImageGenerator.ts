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

function defaultPivot(coverIdx: number, panelCount: number): number {
  if (panelCount <= 1) return 0;
  if (coverIdx <= 0) return 1;
  if (coverIdx >= panelCount - 1) return panelCount - 2;
  return coverIdx - 1;
}

/**
 * Compute cumulative Y-rotation for each spread when fully folded.
 * Returns a map: spreadIndex → degrees of rotation.
 * A panel whose |rotation % 360| ≈ 0 shows its front face to the viewer;
 * |rotation % 360| ≈ 180 shows its back face.
 */
function computeFoldedRotations(
  spreadCount: number,
  pivot: number,
  frontCreases: Crease[],
): Record<number, number> {
  const map: Record<number, number> = {};
  map[pivot] = 0;

  let cumulative = 0;
  for (let i = pivot + 1; i < spreadCount; i++) {
    const crease = frontCreases.find((c) => c.between_panel === i - 1);
    const sign = crease?.fold_direction === 'backward' ? -1 : 1;
    cumulative += sign * 180;
    map[i] = cumulative;
  }

  cumulative = 0;
  for (let i = pivot - 1; i >= 0; i--) {
    const crease = frontCreases.find((c) => c.between_panel === i);
    const sign = crease?.fold_direction === 'backward' ? 1 : -1;
    cumulative += sign * 180;
    map[i] = cumulative;
  }

  return map;
}

function isFrontFaceVisible(rotation: number): boolean {
  const norm = ((rotation % 360) + 360) % 360;
  return norm < 45 || norm > 315;
}

function isBackFaceVisible(rotation: number): boolean {
  const norm = ((rotation % 360) + 360) % 360;
  return norm > 135 && norm < 225;
}

/**
 * Generate a 1200x1200 OG image as a JPEG Blob.
 *
 * Layout: straight-on view of the folded card. Uses crease data to compute
 * which panels are visible from the cover side, then draws them side-by-side.
 */
export async function generateOgImage(
  input: OgImageInput
): Promise<Blob> {
  const { panels, creases, cover, pivotIndex, displayUrls } = input;

  const coverSidePanels = panels
    .filter((p) => p.side === cover.side)
    .sort((a, b) => a.panel_index - b.panel_index);

  if (coverSidePanels.length === 0) throw new Error('No panels on cover side');

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

  const spreadCount = Math.max(...coverSidePanels.map((p) => p.panel_index)) + 1;
  const frontCreases = creases
    .filter((c) => c.side === 'front')
    .sort((a, b) => a.between_panel - b.between_panel);
  const pivot = pivotIndex ?? defaultPivot(cover.spreadIndex, spreadCount);

  const rotations = computeFoldedRotations(spreadCount, pivot, frontCreases);

  const visibleCheck = cover.side === 'front' ? isFrontFaceVisible : isBackFaceVisible;
  const visible = loaded.filter((l) => visibleCheck(rotations[l.panel.panel_index] ?? 0));

  if (visible.length === 0) {
    // Fallback: if fold math hides everything, just show the cover panel
    const coverPanel = loaded.find((l) => l.panel.panel_index === cover.spreadIndex);
    if (coverPanel) visible.push(coverPanel);
    else visible.push(loaded[0]);
  }

  visible.sort((a, b) => a.panel.panel_index - b.panel.panel_index);

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
