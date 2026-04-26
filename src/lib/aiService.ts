import { supabase } from './supabase';
import { fetchAirlines } from './lookupService';

export interface AircraftSuggestion {
  manufacturer: string | null;
  model: string | null;
  variant: string | null;
}

export interface CardSuggestions {
  airline: string | null;
  aircraft: AircraftSuggestion[];
  languages: string[];
  published_year: number | null;
  revision: string | null;
  suggested_title: string | null;
}

const AI_MAX_DIMENSION = 4000;

async function resizeImageToBase64(
  url: string,
  maxDim: number
): Promise<{ data: string; mediaType: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode image'));
      el.src = blobUrl;
    });

    let { naturalWidth: w, naturalHeight: h } = img;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1];
    return { data: base64, mediaType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export async function analyzeCardScans(
  imageUrls: string[],
  opts?: { resizeForAi?: boolean }
): Promise<{ suggestions?: CardSuggestions; error?: string }> {
  try {
    if (imageUrls.length === 0) {
      return { error: 'No panel images available for analysis.' };
    }

    const airlines = await fetchAirlines();
    const existingAirlineNames = airlines.map((a) => a.name);

    let body: Record<string, unknown>;

    if (opts?.resizeForAi) {
      const base64Images: Array<{ data: string; mediaType: string }> = [];
      for (const url of imageUrls.slice(0, 8)) {
        try {
          base64Images.push(await resizeImageToBase64(url, AI_MAX_DIMENSION));
        } catch {
          /* skip images that fail to load */
        }
      }
      if (base64Images.length === 0) {
        return { error: 'Could not load any scan images for analysis.' };
      }
      body = { base64Images, existingAirlines: existingAirlineNames };
    } else {
      body = { imageUrls, existingAirlines: existingAirlineNames };
    }

    const { data, error } = await supabase.functions.invoke('analyze-card', {
      body,
    });

    if (error) {
      let detail = error.message;
      try {
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx) {
          const body = await ctx.json();
          detail = body?.error ?? detail;
          if (body?.detail) detail += ': ' + body.detail;
        }
      } catch { /* ignore parse failure */ }
      return { error: detail };
    }

    if (data?.error) {
      return { error: `${data.error}${data.detail ? ': ' + data.detail : ''}` };
    }

    return { suggestions: data.suggestions as CardSuggestions };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
