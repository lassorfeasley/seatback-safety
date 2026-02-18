import { supabase } from './supabase';

interface LookupItem {
  id: string;
  name: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Airlines ────────────────────────────────────────────────────

export async function fetchAirlines(): Promise<LookupItem[]> {
  const { data } = await supabase
    .from('airlines')
    .select('id, name')
    .order('name');
  return (data ?? []) as LookupItem[];
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

// ─── Aircraft Manufacturers ──────────────────────────────────────

export async function fetchManufacturers(): Promise<LookupItem[]> {
  const { data } = await supabase
    .from('aircraft_manufacturers')
    .select('id, name')
    .order('name');
  return (data ?? []) as LookupItem[];
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

// ─── Aircraft Models ─────────────────────────────────────────────

export async function fetchModels(manufacturerId: string): Promise<LookupItem[]> {
  const { data } = await supabase
    .from('aircraft_models')
    .select('id, name')
    .eq('manufacturer_id', manufacturerId)
    .order('name');
  return (data ?? []) as LookupItem[];
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

// ─── Aircraft Variants ───────────────────────────────────────────

export async function fetchVariants(modelId: string): Promise<LookupItem[]> {
  const { data } = await supabase
    .from('aircraft_variants')
    .select('id, name')
    .eq('model_id', modelId)
    .order('name');
  return (data ?? []) as LookupItem[];
}

export async function createVariant(modelId: string, name: string): Promise<LookupItem> {
  const { data, error } = await supabase
    .from('aircraft_variants')
    .insert({ model_id: modelId, name })
    .select('id, name')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create variant');
  return data as LookupItem;
}
