import { supabase } from './supabase';

// ─── Types ──────────────────────────────────────────────────────

export interface SocialPost {
  id: string;
  card_id: string;
  panel_id: string;
  crop_x_pct: number;
  crop_y_pct: number;
  crop_size_pct: number;
  crop_image_path: string | null;
  caption: string | null;
  status: 'draft' | 'scheduled' | 'posted' | 'failed';
  scheduled_at: string | null;
  posted_at: string | null;
  instagram_media_id: string | null;
  instagram_permalink: string | null;
  publish_error: string | null;
  publish_attempted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialPostWithCard extends SocialPost {
  card_title: string | null;
  airline_name: string | null;
  panel_image_url: string | null;
}

export interface GenerateResult {
  post: SocialPost;
  card_title: string | null;
  airline_name: string | null;
  aircraft: string | null;
  panel_image_url: string | null;
  crop_description: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────

function derivativePublicUrl(filePath: string): string {
  const { data } = supabase.storage.from('derivatives').getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Preview thumbnail for a social post. Uses stored square JPEG when present;
 * otherwise crops from the panel display image using percentage coordinates.
 */
export async function renderSocialPostPreview(
  post: Pick<SocialPost, 'crop_image_path' | 'crop_x_pct' | 'crop_y_pct' | 'crop_size_pct'>,
  panelImageUrl: string | null,
  outputSize = 400
): Promise<string> {
  if (post.crop_image_path) {
    const url = derivativePublicUrl(post.crop_image_path);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, outputSize, outputSize);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }
  if (!panelImageUrl) {
    return Promise.reject(new Error('No image for preview'));
  }
  return renderCropPreview(
    panelImageUrl,
    post.crop_x_pct,
    post.crop_y_pct,
    post.crop_size_pct,
    outputSize
  );
}

export async function renderCropPreview(
  imageUrl: string,
  cropXPct: number,
  cropYPct: number,
  cropSizePct: number,
  outputSize = 400
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const minDim = Math.min(img.naturalWidth, img.naturalHeight);
      const cropPx = Math.round(cropSizePct * minDim);
      const sx = Math.round(cropXPct * img.naturalWidth);
      const sy = Math.round(cropYPct * img.naturalHeight);

      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, cropPx, cropPx, 0, 0, outputSize, outputSize);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
    img.src = imageUrl;
  });
}

// ─── Service Functions ──────────────────────────────────────────

export interface ManualCropPayload {
  card_id: string;
  panel_id: string;
  /** Set when crop is a square extracted from the full-side composite (may span seams). */
  cropped_image_path?: string;
  /** Legacy: crop within a single panel image (ignored if cropped_image_path is set). */
  crop?: {
    x_pct: number;
    y_pct: number;
    size_pct: number;
  };
}

/**
 * Create a social post from a user-selected square crop; AI writes caption only.
 */
export async function createSocialPostFromManualCrop(
  payload: ManualCropPayload
): Promise<{
  result?: GenerateResult;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('suggest-social-post', {
      body: {
        mode: 'manual_crop',
        card_id: payload.card_id,
        panel_id: payload.panel_id,
        ...(payload.cropped_image_path
          ? { cropped_image_path: payload.cropped_image_path }
          : { crop: payload.crop }),
      },
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
      } catch {
        /* ignore */
      }
      return { error: detail };
    }

    if (data?.error) {
      return { error: `${data.error}${data.detail ? ': ' + data.detail : ''}` };
    }

    return { result: data as GenerateResult };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function generateSocialPost(): Promise<{
  result?: GenerateResult;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('suggest-social-post', {
      body: {},
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

    return { result: data as GenerateResult };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchSocialPosts(): Promise<{
  posts?: SocialPostWithCard[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('social_posts')
      .select(`
        *,
        safety_cards(
          title,
          airline:airlines(name),
          card_sides(
            card_panels(
              id,
              panel_images(variant, file_path)
            )
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) return { error: error.message };

    const posts: SocialPostWithCard[] = (data ?? []).map(
      (row: Record<string, unknown>) => {
        const card = row.safety_cards as Record<string, unknown> | null;
        const airline = card?.airline as Record<string, unknown> | null;

        const cropPath = row.crop_image_path as string | null;

        let panelImageUrl: string | null = null;
        if (cropPath) {
          panelImageUrl = derivativePublicUrl(cropPath);
        } else {
          const sides = (card?.card_sides as Array<Record<string, unknown>>) ?? [];
          for (const side of sides) {
            const panels = (side.card_panels as Array<Record<string, unknown>>) ?? [];
            const panel = panels.find(
              (p: Record<string, unknown>) => p.id === row.panel_id
            );
            if (panel) {
              const images = (panel.panel_images as Array<Record<string, unknown>>) ?? [];
              const display =
                images.find((i) => i.variant === 'display') ??
                images.find((i) => i.variant === 'full');
              if (display) {
                panelImageUrl = derivativePublicUrl(display.file_path as string);
              }
              break;
            }
          }
        }

        return {
          id: row.id as string,
          card_id: row.card_id as string,
          panel_id: row.panel_id as string,
          crop_x_pct: row.crop_x_pct as number,
          crop_y_pct: row.crop_y_pct as number,
          crop_size_pct: row.crop_size_pct as number,
          crop_image_path: row.crop_image_path as string | null,
          caption: row.caption as string | null,
          status: row.status as SocialPost['status'],
          scheduled_at: row.scheduled_at as string | null,
          posted_at: row.posted_at as string | null,
          instagram_media_id: (row.instagram_media_id as string | null) ?? null,
          instagram_permalink: (row.instagram_permalink as string | null) ?? null,
          publish_error: (row.publish_error as string | null) ?? null,
          publish_attempted_at: (row.publish_attempted_at as string | null) ?? null,
          created_at: row.created_at as string,
          updated_at: row.updated_at as string,
          card_title: (card?.title as string) ?? null,
          airline_name: (airline?.name as string) ?? null,
          panel_image_url: panelImageUrl,
        };
      }
    );

    return { posts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateSocialPost(
  id: string,
  updates: Partial<Pick<SocialPost, 'caption' | 'status' | 'scheduled_at'>>
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('social_posts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: error.message };
  return {};
}

export async function deleteSocialPost(
  id: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('social_posts')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  return {};
}

/** Publishes a draft, scheduled, or failed post to Instagram via Edge Function. */
export async function publishSocialPostNow(
  postId: string
): Promise<{ error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('publish-instagram', {
      body: { post_id: postId },
    });

    if (error) {
      let detail = error.message;
      try {
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx) {
          const body = await ctx.json();
          detail = (body?.error as string) ?? detail;
          if (body?.detail) detail += ': ' + body.detail;
        }
      } catch {
        /* ignore */
      }
      return { error: detail };
    }

    if (data && typeof data === 'object' && 'error' in data) {
      const errMsg = (data as { error?: string }).error;
      if (errMsg) return { error: errMsg };
    }

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
