import { supabase } from './supabase';

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

export async function analyzeCardScans(
  imageUrls: string[]
): Promise<{ suggestions?: CardSuggestions; error?: string }> {
  try {
    if (imageUrls.length === 0) {
      return { error: 'No panel images available for analysis.' };
    }

    const { data, error } = await supabase.functions.invoke('analyze-card', {
      body: { imageUrls },
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
