import { supabase } from './supabase';

export interface SocialCrop {
  id: string;
  card_id: string;
  panel_id: string;
  crop_image_path: string;
  label: string | null;
  created_at: string;
}

export interface SocialCropWithCard extends SocialCrop {
  card_title: string | null;
  airline_name: string | null;
  published_year: number | null;
  crop_image_url: string;
}

function derivativePublicUrl(filePath: string): string {
  const { data } = supabase.storage.from('derivatives').getPublicUrl(filePath);
  return data.publicUrl;
}

export async function createSocialCrop(payload: {
  card_id: string;
  panel_id: string;
  crop_image_path: string;
  label?: string;
}): Promise<{ crop?: SocialCrop; error?: string }> {
  const { data, error } = await supabase
    .from('social_crops')
    .insert({
      card_id: payload.card_id,
      panel_id: payload.panel_id,
      crop_image_path: payload.crop_image_path,
      label: payload.label ?? null,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { crop: data as SocialCrop };
}

export async function fetchCropsForCard(cardId: string): Promise<{
  crops?: SocialCrop[];
  error?: string;
}> {
  const { data, error } = await supabase
    .from('social_crops')
    .select('*')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };
  return { crops: data as SocialCrop[] };
}

export async function fetchAllCrops(): Promise<{
  crops?: SocialCropWithCard[];
  error?: string;
}> {
  const { data, error } = await supabase
    .from('social_crops')
    .select(`
      *,
      safety_cards(
        title,
        published_year,
        airline:airlines(name)
      )
    `)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };

  const crops: SocialCropWithCard[] = (data ?? []).map(
    (row: Record<string, unknown>) => {
      const card = row.safety_cards as Record<string, unknown> | null;
      const airline = card?.airline as Record<string, unknown> | null;
      return {
        id: row.id as string,
        card_id: row.card_id as string,
        panel_id: row.panel_id as string,
        crop_image_path: row.crop_image_path as string,
        label: row.label as string | null,
        created_at: row.created_at as string,
        card_title: (card?.title as string) ?? null,
        airline_name: (airline?.name as string) ?? null,
        published_year: (card?.published_year as number) ?? null,
        crop_image_url: derivativePublicUrl(row.crop_image_path as string),
      };
    }
  );

  return { crops };
}

export async function deleteSocialCrop(id: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('social_crops')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  return {};
}

export function buildCaption(
  airlineName?: string | null,
  year?: number | null,
): string {
  let caption = 'Artwork selected from';
  if (airlineName) caption += ` ✈️ ${airlineName}`;
  caption += ' #SeatbackSafety card';
  if (year) caption += ` c. ${year}`;
  return caption;
}
