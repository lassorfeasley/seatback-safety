import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Plus,
  Trash2,
  Save,
  X,
  Pencil,
  GripVertical,
} from 'lucide-react';
import {
  fetchDirectives,
  createDirective,
  updateDirective,
  toggleDirective,
  deleteDirective,
  DIRECTIVE_CATEGORIES,
  CATEGORY_META,
  ENFORCEMENT_LEVELS,
  ENFORCEMENT_META,
  type StyleDirective,
  type StyleDirectiveInsert,
  type DirectiveCategory,
  type EnforcementLevel,
} from '@/lib/styleGuideService';
import { cn } from '@/lib/utils';

function CategoryBadge({ category }: { category: DirectiveCategory }) {
  const meta = CATEGORY_META[category];
  return (
    <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', meta.color)}>
      {meta.label}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        checked ? 'bg-primary' : 'bg-muted-foreground/25',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
          checked ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  );
}

const EMPTY_DIRECTIVE: StyleDirectiveInsert = {
  label: '',
  directive: '',
  category: 'general',
  enforcement: 'must',
  is_active: true,
  sort_order: 0,
};

function DirectiveForm({
  initial,
  onSave,
  onCancel,
  saving,
  isNew,
  nextSortOrder,
}: {
  initial: StyleDirectiveInsert;
  onSave: (d: StyleDirectiveInsert) => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
  nextSortOrder: number;
}) {
  const [form, setForm] = useState<StyleDirectiveInsert>({
    ...initial,
    sort_order: isNew ? nextSortOrder : initial.sort_order,
  });

  const set = <K extends keyof StyleDirectiveInsert>(key: K, value: StyleDirectiveInsert[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Label</label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="e.g., Haiku format"
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Category</label>
          <select
            value={form.category}
            onChange={(e) => set('category', e.target.value as DirectiveCategory)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {DIRECTIVE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_META[c].label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Enforcement</label>
          <select
            value={form.enforcement}
            onChange={(e) => set('enforcement', e.target.value as EnforcementLevel)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ENFORCEMENT_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>{ENFORCEMENT_META[lvl].label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Order</label>
          <input
            type="number"
            value={form.sort_order}
            onChange={(e) => set('sort_order', parseInt(e.target.value) || 0)}
            className="w-20 rounded-md border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Directive</label>
        <textarea
          value={form.directive}
          onChange={(e) => set('directive', e.target.value)}
          rows={4}
          placeholder="The instruction sent to the LLM..."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onSave(form)}
          disabled={saving || !form.label.trim() || !form.directive.trim()}
          className="gap-1.5"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {isNew ? 'Add' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function DirectiveCard({
  directive,
  onToggle,
  onEdit,
  onDelete,
}: {
  directive: StyleDirective;
  onToggle: (active: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = () => {
    setDeleting(true);
    onDelete();
  };

  return (
    <div
      className={cn(
        'rounded-lg border bg-card transition-opacity',
        !directive.is_active && 'opacity-50'
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-shrink-0 pt-0.5 text-muted-foreground/40">
          <GripVertical className="h-4 w-4" />
        </div>

        <div className="flex-shrink-0 pt-0.5">
          <Toggle checked={directive.is_active} onChange={onToggle} />
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{directive.label}</span>
            <CategoryBadge category={directive.category} />
            <span className={cn(
              'text-[11px] font-medium px-2 py-0.5 rounded-full',
              directive.enforcement === 'must'   && 'bg-red-500/15 text-red-700 dark:text-red-400',
              directive.enforcement === 'should' && 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
              directive.enforcement === 'may'    && 'bg-green-500/15 text-green-700 dark:text-green-400',
            )}>
              {ENFORCEMENT_META[directive.enforcement].label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {directive.directive}
          </p>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {confirmingDelete ? (
            <>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center justify-center rounded-md h-7 px-2 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex items-center justify-center rounded-md h-7 w-7 text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const AdminStyleGuide: React.FC = () => {
  const [directives, setDirectives] = useState<StyleDirective[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    directive: StyleDirectiveInsert;
    id: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { directives: data, error: err } = await fetchDirectives();
    if (err) setError(err);
    else setDirectives(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (editing && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [editing]);

  const activeCount = directives.filter((d) => d.is_active).length;
  const nextSort = directives.length > 0
    ? Math.max(...directives.map((d) => d.sort_order)) + 10
    : 0;

  const handleAdd = () => {
    setEditing({ directive: { ...EMPTY_DIRECTIVE }, id: null });
  };

  const handleEdit = (d: StyleDirective) => {
    setEditing({
      directive: {
        label: d.label,
        directive: d.directive,
        category: d.category,
        enforcement: d.enforcement,
        is_active: d.is_active,
        sort_order: d.sort_order,
      },
      id: d.id,
    });
  };

  const handleSave = async (form: StyleDirectiveInsert) => {
    setSaving(true);
    setError(null);

    if (editing?.id) {
      const { error: err } = await updateDirective(editing.id, form);
      if (err) setError(err);
    } else {
      const { error: err } = await createDirective(form);
      if (err) setError(err);
    }

    setSaving(false);
    setEditing(null);
    await load();
  };

  const handleToggle = async (id: string, active: boolean) => {
    setError(null);
    const { error: err } = await toggleDirective(id, active);
    if (err) setError(err);
    await load();
  };

  const handleDelete = async (id: string) => {
    setError(null);
    const { error: err } = await deleteDirective(id);
    if (err) setError(err);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Style Directives</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeCount} of {directives.length} directives active — these are assembled into the AI prompt at generation time.
          </p>
        </div>
        {!editing && (
          <Button size="sm" onClick={handleAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Directive
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md px-4 py-3 text-sm">
          {error}
          <button onClick={() => setError(null)} className="float-right text-destructive hover:text-destructive/80">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {editing && (
        <div ref={formRef}>
          <DirectiveForm
            initial={editing.directive}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
            saving={saving}
            isNew={!editing.id}
            nextSortOrder={nextSort}
          />
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading directives...</p>
        </div>
      ) : directives.length === 0 && !editing ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div>
            <h3 className="text-lg font-medium">No directives yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Add directives to shape how the AI selects crops and writes captions.
            </p>
          </div>
          <Button onClick={handleAdd} className="gap-1.5 mt-2">
            <Plus className="h-4 w-4" />
            Add Directive
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {directives.map((d) => (
            <DirectiveCard
              key={d.id}
              directive={d}
              onToggle={(active) => handleToggle(d.id, active)}
              onEdit={() => handleEdit(d)}
              onDelete={() => handleDelete(d.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
