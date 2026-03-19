import { supabase } from './supabase';

// ─── Shared Types ─────────────────────────────────────────────────

export interface LookupItem {
  id: string;
  name: string;
}

export interface AirlineDetail {
  id: string;
  name: string;
  slug: string;
  iata_code: string | null;
  icao_code: string | null;
  country: string | null;
  logo_path: string | null;
  logo_url: string | null;
  active: boolean;
  description: string | null;
}

export interface ManufacturerDetail {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  logo_path: string | null;
  logo_url: string | null;
  website_url: string | null;
}

export interface ModelDetail {
  id: string;
  name: string;
  slug: string;
  manufacturer_id: string;
  aircraft_type: string | null;
  first_flight_year: number | null;
  description: string | null;
  image_path: string | null;
  image_url: string | null;
}

export interface VariantDetail {
  id: string;
  name: string;
  slug: string | null;
  model_id: string;
  designation: string | null;
  description: string | null;
}

// ─── Browse Types (with card counts) ──────────────────────────────

export interface AirlineBrowse extends AirlineDetail {
  card_count: number;
}

export interface ManufacturerBrowse extends ManufacturerDetail {
  card_count: number;
}

export interface CountryBrowse {
  name: string;
  card_count: number;
}

export interface ModelBrowse extends ModelDetail {
  manufacturer_name: string;
  manufacturer_slug: string;
  card_count: number;
}

export interface VariantBrowse extends VariantDetail {
  model_name: string;
  model_slug: string;
  manufacturer_id: string;
  manufacturer_name: string;
  manufacturer_slug: string;
  card_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function entityImageUrl(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from('entity-images').getPublicUrl(path).data.publicUrl;
}

export async function uploadEntityImage(
  entityType: 'airlines' | 'manufacturers' | 'models',
  entityId: string,
  file: File
): Promise<{ path: string; url: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${entityType}/${entityId}.${ext}`;

  const { error } = await supabase.storage
    .from('entity-images')
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) throw new Error(`Failed to upload image: ${error.message}`);
  const url = entityImageUrl(path)!;
  return { path, url };
}

export async function deleteEntityImage(path: string): Promise<void> {
  await supabase.storage.from('entity-images').remove([path]);
}

// ─── Airlines ────────────────────────────────────────────────────

export async function fetchAirlines(): Promise<LookupItem[]> {
  const { data } = await supabase
    .from('airlines')
    .select('id, name')
    .order('name');
  return (data ?? []) as LookupItem[];
}

export async function fetchAirlineDetail(id: string): Promise<AirlineDetail | null> {
  const { data } = await supabase
    .from('airlines')
    .select('id, name, slug, iata_code, icao_code, country, logo_path, active, description')
    .eq('id', id)
    .single();
  if (!data) return null;
  return { ...data, logo_url: entityImageUrl(data.logo_path) } as AirlineDetail;
}

export async function fetchAirlinesBrowse(): Promise<AirlineBrowse[]> {
  const { data } = await supabase
    .from('airline_browse')
    .select('*')
    .order('name');
  if (!data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    logo_url: entityImageUrl(row.logo_path as string | null),
  })) as AirlineBrowse[];
}

export async function createAirline(name: string): Promise<LookupItem> {
  const { data, error } = await supabase
    .from('airlines')
    .insert({ name, slug: slugify(name) })
    .select('id, name')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create airline');
  return data as LookupItem;
}

export interface AirlineUpdate {
  name?: string;
  iata_code?: string | null;
  icao_code?: string | null;
  country?: string | null;
  logo_path?: string | null;
  active?: boolean;
  description?: string | null;
}

export async function updateAirline(id: string, update: AirlineUpdate): Promise<void> {
  const patch: Record<string, unknown> = { ...update };
  if (update.name) patch.slug = slugify(update.name);
  const { error } = await supabase.from('airlines').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export interface CollectionStats {
  totalCards: number;
  totalAirlines: number;
  totalCountries: number;
}

export async function fetchCollectionStats(): Promise<CollectionStats> {
  const { data } = await supabase
    .from('airline_browse')
    .select('country, card_count');

  const rows = (data ?? []) as Array<{ country: string | null; card_count: number }>;
  const withCards = rows.filter((r) => r.card_count > 0);
  const countries = new Set(
    withCards.map((r) => r.country).filter(Boolean)
  );
  const totalCards = rows.reduce((sum, r) => sum + r.card_count, 0);

  return {
    totalCards,
    totalAirlines: withCards.length,
    totalCountries: countries.size,
  };
}

export async function fetchCountriesBrowse(): Promise<CountryBrowse[]> {
  const { data } = await supabase
    .from('airline_browse')
    .select('country, card_count');

  const rows = (data ?? []) as Array<{ country: string | null; card_count: number }>;
  const byCountry = new Map<string, number>();
  for (const r of rows) {
    if (r.country && r.card_count > 0) {
      byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + r.card_count);
    }
  }
  return [...byCountry.entries()]
    .map(([name, card_count]) => ({ name, card_count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Aircraft Manufacturers ──────────────────────────────────────

export async function fetchManufacturers(): Promise<LookupItem[]> {
  const { data } = await supabase
    .from('aircraft_manufacturers')
    .select('id, name')
    .order('name');
  return (data ?? []) as LookupItem[];
}

export async function fetchManufacturerDetail(id: string): Promise<ManufacturerDetail | null> {
  const { data } = await supabase
    .from('aircraft_manufacturers')
    .select('id, name, slug, country, logo_path, website_url')
    .eq('id', id)
    .single();
  if (!data) return null;
  return { ...data, logo_url: entityImageUrl(data.logo_path) } as ManufacturerDetail;
}

export async function fetchManufacturersBrowse(): Promise<ManufacturerBrowse[]> {
  const { data } = await supabase
    .from('manufacturer_browse')
    .select('*')
    .order('name');
  if (!data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    logo_url: entityImageUrl(row.logo_path as string | null),
  })) as ManufacturerBrowse[];
}

export async function fetchDistinctLanguageCount(): Promise<number> {
  const { data } = await supabase
    .from('card_languages')
    .select('language');
  if (!data) return 0;
  return new Set((data as Array<{ language: string }>).map((r) => r.language)).size;
}

export async function createManufacturer(name: string): Promise<LookupItem> {
  const { data, error } = await supabase
    .from('aircraft_manufacturers')
    .insert({ name, slug: slugify(name) })
    .select('id, name')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create manufacturer');
  return data as LookupItem;
}

export interface ManufacturerUpdate {
  name?: string;
  country?: string | null;
  logo_path?: string | null;
  website_url?: string | null;
}

export async function updateManufacturer(id: string, update: ManufacturerUpdate): Promise<void> {
  const patch: Record<string, unknown> = { ...update };
  if (update.name) patch.slug = slugify(update.name);
  const { error } = await supabase.from('aircraft_manufacturers').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Aircraft Models ─────────────────────────────────────────────

export async function fetchModels(manufacturerId: string): Promise<LookupItem[]> {
  const { data } = await supabase
    .from('aircraft_models')
    .select('id, name')
    .eq('manufacturer_id', manufacturerId)
    .order('name');
  return (data ?? []) as LookupItem[];
}

export async function fetchModelDetail(id: string): Promise<ModelDetail | null> {
  const { data } = await supabase
    .from('aircraft_models')
    .select('id, name, slug, manufacturer_id, aircraft_type, first_flight_year, description, image_path')
    .eq('id', id)
    .single();
  if (!data) return null;
  return { ...data, image_url: entityImageUrl(data.image_path) } as ModelDetail;
}

export async function fetchModelsBrowse(manufacturerId?: string): Promise<ModelBrowse[]> {
  let query = supabase
    .from('model_browse')
    .select('*')
    .order('name');
  if (manufacturerId) query = query.eq('manufacturer_id', manufacturerId);
  const { data } = await query;
  if (!data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    image_url: entityImageUrl(row.image_path as string | null),
  })) as ModelBrowse[];
}

export async function createModel(manufacturerId: string, name: string): Promise<LookupItem> {
  const { data, error } = await supabase
    .from('aircraft_models')
    .insert({ manufacturer_id: manufacturerId, name, slug: slugify(name) })
    .select('id, name')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create model');
  return data as LookupItem;
}

export interface ModelUpdate {
  name?: string;
  aircraft_type?: string | null;
  first_flight_year?: number | null;
  description?: string | null;
  image_path?: string | null;
}

export async function updateModel(id: string, update: ModelUpdate): Promise<void> {
  const patch: Record<string, unknown> = { ...update };
  if (update.name) patch.slug = slugify(update.name);
  const { error } = await supabase.from('aircraft_models').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Aircraft Variants ───────────────────────────────────────────

export async function fetchVariants(modelId: string): Promise<LookupItem[]> {
  const { data } = await supabase
    .from('aircraft_variants')
    .select('id, name')
    .eq('model_id', modelId)
    .order('name');
  return (data ?? []) as LookupItem[];
}

export async function fetchVariantDetail(id: string): Promise<VariantDetail | null> {
  const { data } = await supabase
    .from('aircraft_variants')
    .select('id, name, slug, model_id, designation, description')
    .eq('id', id)
    .single();
  return data as VariantDetail | null;
}

export async function fetchVariantsBrowse(modelId?: string): Promise<VariantBrowse[]> {
  let query = supabase
    .from('variant_browse')
    .select('*')
    .order('name');
  if (modelId) query = query.eq('model_id', modelId);
  const { data } = await query;
  return (data ?? []) as VariantBrowse[];
}

export async function createVariant(modelId: string, name: string): Promise<LookupItem> {
  const { data, error } = await supabase
    .from('aircraft_variants')
    .insert({ model_id: modelId, name, slug: slugify(name) })
    .select('id, name')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create variant');
  return data as LookupItem;
}

export interface VariantUpdate {
  name?: string;
  slug?: string;
  designation?: string | null;
  description?: string | null;
}

export async function updateVariant(id: string, update: VariantUpdate): Promise<void> {
  const patch: Record<string, unknown> = { ...update };
  if (update.name && !update.slug) patch.slug = slugify(update.name);
  const { error } = await supabase.from('aircraft_variants').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}
