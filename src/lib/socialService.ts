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
  social_crop_id: string | null;
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

// ─── Helpers ────────────────────────────────────────────────────

function derivativePublicUrl(filePath: string): string {
  const { data } = supabase.storage.from('derivatives').getPublicUrl(filePath);
  return data.publicUrl;
}

// ─── Service Functions ──────────────────────────────────────────

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
          social_crop_id: (row.social_crop_id as string | null) ?? null,
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

export async function deleteSocialPostsInRange(
  startDate: string,
  endDate: string,
  statusFilter: SocialPost['status'][] = ['scheduled', 'draft'],
): Promise<{ deleted: number; error?: string }> {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T23:59:59.999');

  const { data, error } = await supabase
    .from('social_posts')
    .delete()
    .gte('scheduled_at', start.toISOString())
    .lte('scheduled_at', end.toISOString())
    .in('status', statusFilter)
    .select('id');

  if (error) return { deleted: 0, error: error.message };
  return { deleted: data?.length ?? 0 };
}

export async function createSocialPostFromManualCrop(params: {
  card_id: string;
  panel_id: string;
  cropped_image_path: string;
}): Promise<{
  result?: {
    post: SocialPost;
    card_title: string | null;
    airline_name: string | null;
    panel_image_url: string | null;
  };
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('social_posts')
      .insert({
        card_id: params.card_id,
        panel_id: params.panel_id,
        crop_x_pct: 0,
        crop_y_pct: 0,
        crop_size_pct: 1,
        crop_image_path: params.cropped_image_path,
        status: 'draft',
      })
      .select(`
        *,
        safety_cards(
          title,
          airline:airlines(name)
        )
      `)
      .single();

    if (error) return { error: error.message };

    const card = data.safety_cards as Record<string, unknown> | null;
    const airline = card?.airline as Record<string, unknown> | null;
    const panelImageUrl = data.crop_image_path
      ? derivativePublicUrl(data.crop_image_path)
      : null;

    const post: SocialPost = {
      id: data.id,
      card_id: data.card_id,
      panel_id: data.panel_id,
      crop_x_pct: data.crop_x_pct,
      crop_y_pct: data.crop_y_pct,
      crop_size_pct: data.crop_size_pct,
      crop_image_path: data.crop_image_path,
      social_crop_id: data.social_crop_id ?? null,
      caption: data.caption,
      status: data.status,
      scheduled_at: data.scheduled_at,
      posted_at: data.posted_at,
      instagram_media_id: data.instagram_media_id ?? null,
      instagram_permalink: data.instagram_permalink ?? null,
      publish_error: data.publish_error ?? null,
      publish_attempted_at: data.publish_attempted_at ?? null,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    return {
      result: {
        post,
        card_title: (card?.title as string) ?? null,
        airline_name: (airline?.name as string) ?? null,
        panel_image_url: panelImageUrl,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function renderSocialPostPreview(
  post: SocialPost | SocialPostWithCard,
  imageUrl: string | null,
  size: number
): Promise<string> {
  if (!imageUrl) throw new Error('No image URL');

  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = imageUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  if (post.crop_image_path) {
    ctx.drawImage(img, 0, 0, size, size);
  } else {
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const minDim = Math.min(nw, nh);
    const sx = post.crop_x_pct * nw;
    const sy = post.crop_y_pct * nh;
    const sSize = post.crop_size_pct * minDim;
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, size, size);
  }

  return canvas.toDataURL('image/png');
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
