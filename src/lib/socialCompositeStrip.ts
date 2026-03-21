import type { CardDetailData } from '@/lib/safetyCardService';
import type { Panel } from '@/components/FoldEditor/types';

export interface PanelOffset {
  id: string;
  left: number;
  width: number;
}

/**
 * Safe pixel-area budget for a single off-screen canvas.
 * Chrome allows ~268 M pixels, Safari ~67 M on iOS / ~268 M on macOS.
 * We stay well under the lowest common denominator.
 */
const MAX_CANVAS_AREA = 60_000_000; // 60 MP — safe on all modern browsers

export interface CompositeStripResult {
  dataUrl: string;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  panelOffsets: PanelOffset[];
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

export interface BuildCompositeStripOptions {
  /** Max total canvas area in pixels (default 60 MP). Prevents out-of-memory on large cards. */
  maxCanvasArea?: number;
  /** JPEG quality for the data URL passed to the cropper (0–1). Higher = sharper preview, larger string. */
  previewJpegQuality?: number;
}

/**
 * Draw all panels on one side flush (no gaps) at uniform height.
 *
 * Uses each image's **natural** pixel size (full-res URL) so the canvas preserves scan resolution.
 * If the resulting canvas would exceed `maxCanvasArea`, both dimensions are scaled down uniformly
 * to fit within the budget while keeping every pixel from every panel proportionally.
 */
export async function buildCompositeStrip(
  cardDetail: CardDetailData,
  panels: Panel[],
  options?: BuildCompositeStripOptions
): Promise<CompositeStripResult | null> {
  if (panels.length === 0) return null;

  const maxArea = options?.maxCanvasArea ?? MAX_CANVAS_AREA;
  const previewJpegQuality = options?.previewJpegQuality ?? 0.96;

  type Loaded = {
    panel: Panel;
    url: string;
    img: HTMLImageElement;
    naturalW: number;
    naturalH: number;
  };

  const loaded: Loaded[] = [];
  for (const panel of panels) {
    const url =
      cardDetail.fullUrls[panel.id] ||
      cardDetail.displayUrls[panel.id] ||
      panel.thumbnail_url;
    if (!url) continue;
    try {
      const img = await loadImage(url);
      const naturalW = img.naturalWidth || 1;
      const naturalH = img.naturalHeight || 1;
      loaded.push({ panel, url, img, naturalW, naturalH });
    } catch {
      /* skip failed panel */
    }
  }
  if (loaded.length === 0) return null;

  const maxNaturalH = Math.max(...loaded.map((e) => e.naturalH));

  // Compute full-res strip dimensions at native height
  const nativeEntries = loaded.map((e) => ({
    ...e,
    displayW: maxNaturalH * (e.naturalW / e.naturalH),
  }));
  const nativeTotalW = nativeEntries.reduce((s, e) => s + e.displayW, 0);
  const nativeArea = nativeTotalW * maxNaturalH;

  // Scale down uniformly if the canvas would exceed the area budget
  const areaScale = nativeArea > maxArea ? Math.sqrt(maxArea / nativeArea) : 1;
  const uniformHeight = Math.round(maxNaturalH * areaScale);

  const entries = loaded.map((e) => ({
    ...e,
    displayW: uniformHeight * (e.naturalW / e.naturalH),
  }));

  const totalW = entries.reduce((s, e) => s + e.displayW, 0);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(totalW));
  canvas.height = Math.max(1, Math.round(uniformHeight));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const panelOffsets: PanelOffset[] = [];
  let x = 0;
  for (const e of entries) {
    const w = e.displayW;
    panelOffsets.push({ id: e.panel.id, left: x, width: w });
    try {
      ctx.drawImage(e.img, x, 0, w, uniformHeight);
    } catch {
      ctx.fillStyle = '#333';
      ctx.fillRect(x, 0, w, uniformHeight);
    }
    x += w;
  }

  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL('image/jpeg', previewJpegQuality);
  } catch {
    return null;
  }

  return {
    dataUrl,
    canvas,
    width: canvas.width,
    height: canvas.height,
    panelOffsets,
  };
}

/** Pick panel whose bounds contain the center of the square crop (for FK). */
export function panelIdForCompositeCrop(
  panelOffsets: PanelOffset[],
  crop: { x: number; y: number; width: number; height: number },
  compositeHeight: number
): string | null {
  if (panelOffsets.length === 0) return null;
  const cx = crop.x + crop.width / 2;
  const cy = crop.y + crop.height / 2;
  for (const o of panelOffsets) {
    if (cx >= o.left && cx < o.left + o.width && cy >= 0 && cy <= compositeHeight) {
      return o.id;
    }
  }
  return panelOffsets[0].id;
}

export async function extractSquareCropToBlob(
  sourceCanvas: HTMLCanvasElement,
  crop: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = Math.round(crop.width);
  c.height = Math.round(crop.height);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('No canvas context');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    sourceCanvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );
  return new Promise((resolve, reject) => {
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.96
    );
  });
}
