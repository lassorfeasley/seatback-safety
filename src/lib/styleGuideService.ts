import { supabase } from './supabase';

export const DIRECTIVE_CATEGORIES = [
  'format',
  'voice',
  'theme',
  'crop',
  'hashtag',
  'constraint',
  'example',
  'general',
] as const;

export type DirectiveCategory = (typeof DIRECTIVE_CATEGORIES)[number];

export const CATEGORY_META: Record<DirectiveCategory, { label: string; color: string }> = {
  format:     { label: 'Format',     color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  voice:      { label: 'Voice',      color: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' },
  theme:      { label: 'Theme',      color: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' },
  crop:       { label: 'Crop',       color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  hashtag:    { label: 'Hashtag',    color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  constraint: { label: 'Constraint', color: 'bg-slate-500/15 text-slate-700 dark:text-slate-400' },
  example:    { label: 'Example',    color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  general:    { label: 'General',    color: 'bg-gray-500/15 text-gray-700 dark:text-gray-400' },
};

export const ENFORCEMENT_LEVELS = ['must', 'should', 'may'] as const;
export type EnforcementLevel = (typeof ENFORCEMENT_LEVELS)[number];

export const ENFORCEMENT_META: Record<EnforcementLevel, { label: string; description: string }> = {
  must:   { label: 'Must',   description: 'Strictly enforced — the AI must follow this.' },
  should: { label: 'Should', description: 'Strongly encouraged — the AI should follow this unless it conflicts.' },
  may:    { label: 'May',    description: 'Soft suggestion — the AI may incorporate this at its discretion.' },
};

export interface StyleDirective {
  id: string;
  label: string;
  directive: string;
  category: DirectiveCategory;
  enforcement: EnforcementLevel;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type StyleDirectiveInsert = Pick<
  StyleDirective,
  'label' | 'directive' | 'category' | 'enforcement' | 'is_active' | 'sort_order'
>;

export async function fetchDirectives(): Promise<{
  directives?: StyleDirective[];
  error?: string;
}> {
  const { data, error } = await supabase
    .from('social_style_directives')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return { error: error.message };
  return { directives: data as StyleDirective[] };
}

export async function createDirective(
  d: StyleDirectiveInsert
): Promise<{ directive?: StyleDirective; error?: string }> {
  const { data, error } = await supabase
    .from('social_style_directives')
    .insert(d)
    .select()
    .single();

  if (error) return { error: error.message };
  return { directive: data as StyleDirective };
}

export async function updateDirective(
  id: string,
  updates: Partial<StyleDirectiveInsert>
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('social_style_directives')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: error.message };
  return {};
}

export async function toggleDirective(
  id: string,
  is_active: boolean
): Promise<{ error?: string }> {
  return updateDirective(id, { is_active });
}

export async function deleteDirective(
  id: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('social_style_directives')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  return {};
}
