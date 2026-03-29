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
  countries: string[];
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
    .select('id, name, slug, iata_code, icao_code, logo_path, active, description')
    .eq('id', id)
    .single();
  if (!data) return null;

  const { data: countryRows } = await supabase
    .from('airline_countries')
    .select('country_name')
    .eq('airline_id', id)
    .order('country_name');
  const countries = (countryRows ?? []).map((r: { country_name: string }) => r.country_name);

  return { ...data, countries, logo_url: entityImageUrl(data.logo_path) } as AirlineDetail;
}

export async function fetchAirlinesBrowse(): Promise<AirlineBrowse[]> {
  const { data } = await supabase
    .from('airline_browse')
    .select('*')
    .order('name');
  if (!data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    countries: (row.countries as string[] | null) ?? [],
    logo_url: entityImageUrl(row.logo_path as string | null),
  })) as AirlineBrowse[];
}

export async function createAirline(name: string): Promise<LookupItem> {
  const slug = slugify(name);

  const { data: existing } = await supabase
    .from('airlines')
    .select('id, name')
    .ilike('name', name)
    .maybeSingle();
  if (existing) return existing as LookupItem;

  const { data, error } = await supabase
    .from('airlines')
    .insert({ name, slug })
    .select('id, name')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create airline');
  return data as LookupItem;
}

export interface AirlineUpdate {
  name?: string;
  iata_code?: string | null;
  icao_code?: string | null;
  countries?: string[];
  logo_path?: string | null;
  active?: boolean;
  description?: string | null;
}

export async function updateAirline(id: string, update: AirlineUpdate): Promise<void> {
  const { countries, ...rest } = update;
  const patch: Record<string, unknown> = { ...rest };
  if (rest.name) patch.slug = slugify(rest.name);

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('airlines').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  }

  if (countries !== undefined) {
    await supabase.from('airline_countries').delete().eq('airline_id', id);
    if (countries.length > 0) {
      const rows = countries.map((c) => ({ airline_id: id, country_name: c }));
      const { error } = await supabase.from('airline_countries').insert(rows);
      if (error) throw new Error(error.message);
    }
  }
}

export async function deleteAirline(id: string): Promise<void> {
  const detail = await fetchAirlineDetail(id);
  if (detail?.logo_path) {
    await supabase.storage.from('entity-images').remove([detail.logo_path]);
  }
  const { error } = await supabase.from('airlines').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function mergeAirlines(
  sourceId: string,
  targetId: string,
  fieldsToCarry?: Partial<AirlineUpdate>
): Promise<{ movedCards: number }> {
  if (sourceId === targetId) {
    throw new Error('Cannot merge an airline into itself');
  }

  if (fieldsToCarry && Object.keys(fieldsToCarry).length > 0) {
    await updateAirline(targetId, fieldsToCarry);
  }

  // Merge countries from source into target (ON CONFLICT DO NOTHING)
  const { data: sourceCountries } = await supabase
    .from('airline_countries')
    .select('country_name')
    .eq('airline_id', sourceId);
  if (sourceCountries && sourceCountries.length > 0) {
    const rows = sourceCountries.map((r: { country_name: string }) => ({
      airline_id: targetId,
      country_name: r.country_name,
    }));
    await supabase.from('airline_countries').upsert(rows, { onConflict: 'airline_id,country_name' });
  }

  const { data, error: moveErr } = await supabase
    .from('safety_cards')
    .update({ airline_id: targetId })
    .eq('airline_id', sourceId)
    .select('id');
  if (moveErr) throw new Error(`Failed to reassign cards: ${moveErr.message}`);
  const movedCards = data?.length ?? 0;

  const source = await fetchAirlineDetail(sourceId);
  const carriedLogo = fieldsToCarry?.logo_path !== undefined;
  if (source?.logo_path && !carriedLogo) {
    await supabase.storage.from('entity-images').remove([source.logo_path]);
  }

  const { error: delErr } = await supabase.from('airlines').delete().eq('id', sourceId);
  if (delErr) throw new Error(`Failed to delete source airline: ${delErr.message}`);

  return { movedCards };
}

export interface CollectionStats {
  totalCards: number;
  totalAirlines: number;
  totalCountries: number;
}

export async function fetchCollectionStats(): Promise<CollectionStats> {
  const { data: browseData } = await supabase
    .from('airline_browse')
    .select('card_count');
  const browseRows = (browseData ?? []) as Array<{ card_count: number }>;
  const withCards = browseRows.filter((r) => r.card_count > 0);
  const totalCards = browseRows.reduce((sum, r) => sum + r.card_count, 0);

  const { data: countryData } = await supabase
    .from('country_card_counts')
    .select('name');
  const totalCountries = countryData?.length ?? 0;

  return {
    totalCards,
    totalAirlines: withCards.length,
    totalCountries,
  };
}

export async function fetchCountriesBrowse(): Promise<CountryBrowse[]> {
  const { data } = await supabase
    .from('country_card_counts')
    .select('name, card_count')
    .order('name');
  return (data ?? []) as CountryBrowse[];
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
  const slug = slugify(name);

  const { data: existing } = await supabase
    .from('aircraft_manufacturers')
    .select('id, name')
    .ilike('name', name)
    .maybeSingle();
  if (existing) return existing as LookupItem;

  const { data, error } = await supabase
    .from('aircraft_manufacturers')
    .insert({ name, slug })
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
  const slug = slugify(name);

  const { data: existing } = await supabase
    .from('aircraft_models')
    .select('id, name')
    .eq('manufacturer_id', manufacturerId)
    .ilike('name', name)
    .maybeSingle();
  if (existing) return existing as LookupItem;

  const { data, error } = await supabase
    .from('aircraft_models')
    .insert({ manufacturer_id: manufacturerId, name, slug })
    .select('id, name')
    .single();

  if (error?.message?.includes('aircraft_models_slug_key')) {
    const uniqueSlug = `${slug}-${manufacturerId.slice(0, 8)}`;
    const { data: retry, error: retryErr } = await supabase
      .from('aircraft_models')
      .insert({ manufacturer_id: manufacturerId, name, slug: uniqueSlug })
      .select('id, name')
      .single();
    if (retryErr || !retry) throw new Error(retryErr?.message ?? 'Failed to create model');
    return retry as LookupItem;
  }

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
  const slug = slugify(name);

  const { data: existing } = await supabase
    .from('aircraft_variants')
    .select('id, name')
    .eq('model_id', modelId)
    .ilike('name', name)
    .maybeSingle();
  if (existing) return existing as LookupItem;

  const { data, error } = await supabase
    .from('aircraft_variants')
    .insert({ model_id: modelId, name, slug })
    .select('id, name')
    .single();

  if (error?.message?.includes('_slug_key')) {
    const uniqueSlug = `${slug}-${modelId.slice(0, 8)}`;
    const { data: retry, error: retryErr } = await supabase
      .from('aircraft_variants')
      .insert({ model_id: modelId, name, slug: uniqueSlug })
      .select('id, name')
      .single();
    if (retryErr || !retry) throw new Error(retryErr?.message ?? 'Failed to create variant');
    return retry as LookupItem;
  }

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
