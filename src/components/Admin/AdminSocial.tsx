import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Trash2,
  ExternalLink,
  Clock,
  Save,
  Calendar,
  ImagePlus,
  Send,
  Check,
} from 'lucide-react';
import {
  fetchSocialPosts,
  updateSocialPost,
  deleteSocialPost,
  publishSocialPostNow,
  type SocialPostWithCard,
  type SocialPost,
} from '@/lib/socialService';
import {
  fetchAllCrops,
  buildCaption,
  type SocialCropWithCard,
} from '@/lib/socialCropService';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

// ─── Calendar Helpers ───────────────────────────────────────────

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

// ─── Status Badge ───────────────────────────────────────────────

const STATUS_CONFIG: Record<SocialPost['status'], {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
}> = {
  draft: { label: 'Draft', variant: 'secondary' },
  scheduled: { label: 'Scheduled', variant: 'default' },
  posted: { label: 'Posted', variant: 'outline' },
  failed: { label: 'Failed', variant: 'destructive' },
};

function StatusBadge({ status }: { status: SocialPost['status'] }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ─── Crop Preview ───────────────────────────────────────────────

function CropPreview({
  imageUrl,
  size = 120,
}: {
  imageUrl: string;
  size?: number;
}) {
  return (
    <img
      src={imageUrl}
      alt="Crop preview"
      className="rounded-md bg-muted flex-shrink-0 object-cover"
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
}

// ─── Post Editor Panel ──────────────────────────────────────────

function PostEditor({
  post,
  onClose,
  onSave,
  onDelete,
  onPublished,
}: {
  post: SocialPostWithCard;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Pick<SocialPost, 'caption' | 'status' | 'scheduled_at'>>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPublished: (id: string) => Promise<void>;
}) {
  const navigate = useNavigate();

  function utcToLocalInput(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const [caption, setCaption] = useState(post.caption ?? '');
  const [scheduledAt, setScheduledAt] = useState(utcToLocalInput(post.scheduled_at));
  const [status, setStatus] = useState<SocialPost['status']>(
    post.status === 'failed' ? 'scheduled' : post.status,
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    setCaption(post.caption ?? '');
    setScheduledAt(utcToLocalInput(post.scheduled_at));
    if (post.status === 'failed') setStatus('scheduled');
    else if (post.status === 'draft' || post.status === 'scheduled') setStatus(post.status);
    else if (post.status === 'posted') setStatus('posted');
  }, [post.id, post.caption, post.scheduled_at, post.status, post.updated_at, post.publish_error, post.instagram_permalink]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(post.id, {
      caption,
      status,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this social post?')) return;
    setDeleting(true);
    await onDelete(post.id);
    setDeleting(false);
    onClose();
  };

  const handlePublishInstagram = async () => {
    if (!confirm('Publish this post to Instagram now?')) return;
    setPublishing(true);
    const { error: pubErr } = await publishSocialPostNow(post.id);
    setPublishing(false);
    if (pubErr) {
      window.alert(pubErr);
      return;
    }
    await onPublished(post.id);
  };

  const canPublishToInstagram =
    post.status !== 'posted' && ['draft', 'scheduled', 'failed'].includes(post.status);

  const cropImageUrl = post.crop_image_path
    ? supabase.storage.from('derivatives').getPublicUrl(post.crop_image_path).data.publicUrl
    : post.panel_image_url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-lg shadow-xl border w-full max-w-2xl max-h-[90vh] overflow-auto m-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Edit Social Post</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-5">
          <div className="flex gap-4 items-start">
            {cropImageUrl && <CropPreview imageUrl={cropImageUrl} size={200} />}
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-medium">{post.card_title ?? 'Untitled Card'}</p>
              {post.airline_name && (
                <p className="text-sm text-muted-foreground">{post.airline_name}</p>
              )}
              <button
                onClick={() => navigate(`/admin/cards/${post.card_id}`)}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
              >
                View card <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
            <p className="text-xs text-muted-foreground text-right">{caption.length} / 2,200</p>
          </div>

          {post.publish_error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <span className="font-medium">Last publish error: </span>{post.publish_error}
            </div>
          )}

          {post.status === 'posted' && post.instagram_permalink && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium text-muted-foreground">Instagram: </span>
              <a href={post.instagram_permalink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                Open post <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-sm font-medium">Status</label>
                {post.status === 'posted' && <StatusBadge status="posted" />}
                {post.status === 'failed' && <StatusBadge status="failed" />}
              </div>
              {post.status === 'posted' ? (
                <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
                  Published to Instagram. Caption edits here do not sync.
                </p>
              ) : (
                <select
                  value={status === 'draft' || status === 'scheduled' ? status : 'scheduled'}
                  onChange={(e) => setStatus(e.target.value as 'draft' | 'scheduled')}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Scheduled Date <span className="font-normal text-muted-foreground">(ET)</span></label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-t">
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting} className="gap-1.5">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </Button>
          <div className="flex flex-wrap gap-2 justify-end">
            {canPublishToInstagram && (
              <Button variant="secondary" size="sm" onClick={handlePublishInstagram} disabled={publishing || saving} className="gap-1.5">
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Publish to Instagram
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || publishing} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── New Post From Crop Picker ───────────────────────────────────

function defaultScheduleIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

function NewPostPicker({
  onPostCreated,
}: {
  onPostCreated: () => void;
}) {
  const [crops, setCrops] = useState<SocialCropWithCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrop, setSelectedCrop] = useState<SocialCropWithCard | null>(null);
  const [caption, setCaption] = useState('');
  const [scheduledAt, setScheduledAt] = useState(defaultScheduleIso);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllCrops().then(({ crops: data }) => {
      setCrops(data ?? []);
      setLoading(false);
    });
  }, []);

  const handleSelectCrop = (crop: SocialCropWithCard) => {
    setSelectedCrop(crop);
    setCaption(buildCaption(crop.airline_name, crop.published_year));
    setScheduledAt(defaultScheduleIso());
    setError(null);
  };

  const handleSchedule = async () => {
    if (!selectedCrop) return;
    setSaving(true);
    setError(null);

    const { data, error: insertErr } = await supabase
      .from('social_posts')
      .insert({
        card_id: selectedCrop.card_id,
        panel_id: selectedCrop.panel_id,
        social_crop_id: selectedCrop.id,
        crop_image_path: selectedCrop.crop_image_path,
        crop_x_pct: 0,
        crop_y_pct: 0,
        crop_size_pct: 1,
        caption,
        status: 'scheduled',
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      })
      .select()
      .single();

    setSaving(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    if (data) {
      setSelectedCrop(null);
      setCaption('');
      onPostCreated();
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedCrop) return;
    setSaving(true);
    setError(null);

    const { error: insertErr } = await supabase
      .from('social_posts')
      .insert({
        card_id: selectedCrop.card_id,
        panel_id: selectedCrop.panel_id,
        social_crop_id: selectedCrop.id,
        crop_image_path: selectedCrop.crop_image_path,
        crop_x_pct: 0,
        crop_y_pct: 0,
        crop_size_pct: 1,
        caption,
        status: 'draft',
      })
      .select()
      .single();

    setSaving(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    setSelectedCrop(null);
    setCaption('');
    onPostCreated();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (crops.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div>
          <h3 className="text-lg font-medium">No saved crops</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Go to a card's detail page and use the Social Crops section to save dramatic scenes first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {selectedCrop ? (
        <div className="rounded-lg border bg-card p-5 space-y-5 max-w-xl">
          <div className="flex gap-4 items-start">
            <CropPreview imageUrl={selectedCrop.crop_image_url} size={160} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-sm font-medium">{selectedCrop.card_title ?? 'Untitled Card'}</p>
              {selectedCrop.airline_name && (
                <p className="text-xs text-muted-foreground">{selectedCrop.airline_name}</p>
              )}
              <button
                type="button"
                onClick={() => setSelectedCrop(null)}
                className="text-xs text-muted-foreground hover:text-foreground mt-2 underline"
              >
                Choose a different crop
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Schedule <span className="font-normal text-muted-foreground">(ET)</span></label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={handleSchedule} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Schedule post
            </Button>
            <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>
              Save as draft
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold">Pick a crop</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Select a banked crop to schedule as a post.
            </p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {crops.map((crop) => (
              <button
                key={crop.id}
                type="button"
                onClick={() => handleSelectCrop(crop)}
                className="group relative aspect-square rounded-lg overflow-hidden border-2 border-muted hover:border-primary/40 transition-all bg-muted"
              >
                <img
                  src={crop.crop_image_url}
                  alt={crop.card_title ?? 'Crop'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white truncate font-medium">
                    {crop.airline_name ?? crop.card_title ?? 'Card'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

type SocialTab = 'calendar' | 'create';

export const AdminSocial: React.FC = () => {
  const [tab, setTab] = useState<SocialTab>('calendar');
  const [posts, setPosts] = useState<SocialPostWithCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<SocialPostWithCard | null>(null);

  const [showFillSchedule, setShowFillSchedule] = useState(false);
  const [fillStart, setFillStart] = useState('');
  const [fillEnd, setFillEnd] = useState('');
  const [fillTime, setFillTime] = useState('09:00');
  const [filling, setFilling] = useState(false);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const loadPosts = useCallback(async () => {
    const { posts: data, error: err } = await fetchSocialPosts();
    if (err) {
      setError(err);
      setLoading(false);
      return undefined;
    } else {
      setPosts(data ?? []);
      setLoading(false);
      return data ?? [];
    }
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handleSave = async (
    id: string,
    updates: Partial<Pick<SocialPost, 'caption' | 'status' | 'scheduled_at'>>
  ) => {
    const { error: err } = await updateSocialPost(id, updates);
    if (err) setError(err);
    else { await loadPosts(); setEditingPost(null); }
  };

  const handleDelete = async (id: string) => {
    const { error: err } = await deleteSocialPost(id);
    if (err) setError(err);
    else await loadPosts();
  };

  const handleInstagramPublished = async (id: string) => {
    const list = await loadPosts();
    const fresh = list?.find((p) => p.id === id);
    if (fresh) setEditingPost(fresh);
  };

  const handleFillSchedule = async () => {
    if (!fillStart || !fillEnd) return;
    setFilling(true);
    setError(null);

    const { crops: allCropsData } = await fetchAllCrops();
    if (!allCropsData || allCropsData.length === 0) {
      setError('No banked crops available. Save some crops from card detail pages first.');
      setFilling(false);
      return;
    }

    const usedCropIds = new Set(posts.filter((p) => p.social_crop_id).map((p) => p.social_crop_id));
    const unused = allCropsData.filter((c) => !usedCropIds.has(c.id));
    const pool = unused.length > 0 ? unused : allCropsData;

    const start = new Date(fillStart + 'T00:00:00');
    const end = new Date(fillEnd + 'T00:00:00');
    const dayCount = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);

    if (dayCount === 0) {
      setError('End date must be on or after start date.');
      setFilling(false);
      return;
    }

    const [h, m] = fillTime.split(':').map(Number);
    let scheduled = 0;

    for (let i = 0; i < dayCount; i++) {
      const crop = pool[i % pool.length];
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      day.setHours(h, m, 0, 0);

      const caption = buildCaption(crop.airline_name, crop.published_year);

      const { error: insertErr } = await supabase
        .from('social_posts')
        .insert({
          card_id: crop.card_id,
          panel_id: crop.panel_id,
          social_crop_id: crop.id,
          crop_image_path: crop.crop_image_path,
          crop_x_pct: 0,
          crop_y_pct: 0,
          crop_size_pct: 1,
          caption,
          status: 'scheduled',
          scheduled_at: day.toISOString(),
        });

      if (!insertErr) scheduled++;
    }

    await loadPosts();
    setFilling(false);
    setShowFillSchedule(false);
    setFillStart('');
    setFillEnd('');
    alert(`Scheduled ${scheduled} posts from your banked crops.`);
  };

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfWeek(calYear, calMonth);

  const scheduledPostsByDay = new Map<number, SocialPostWithCard[]>();
  for (const post of posts) {
    if (post.scheduled_at) {
      const d = new Date(post.scheduled_at);
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
        const day = d.getDate();
        const existing = scheduledPostsByDay.get(day) ?? [];
        existing.push(post);
        scheduledPostsByDay.set(day, existing);
      }
    }
  }

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };

  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };

  return (
    <>
      <header className="flex-shrink-0">
        <div className="max-w-6xl mx-auto px-6 pt-8 pb-4 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-medium tracking-widest uppercase text-black/60">Social</h1>
            {tab === 'calendar' && (
              <Button
                onClick={() => {
                  const today = new Date();
                  const nextWeek = new Date(today);
                  nextWeek.setDate(today.getDate() + 7);
                  setFillStart(today.toISOString().slice(0, 10));
                  setFillEnd(nextWeek.toISOString().slice(0, 10));
                  setShowFillSchedule(true);
                }}
                size="sm"
                variant="outline"
                className="gap-1.5"
              >
                <Calendar className="h-4 w-4" />
                Fill Schedule
              </Button>
            )}
          </div>
          <div className="flex gap-4 border-b border-black/5 -mb-5 pb-0">
            <button
              onClick={() => setTab('calendar')}
              className={cn(
                'flex items-center gap-1.5 px-1 py-2 text-[10px] font-medium tracking-widest uppercase border-b-2 -mb-px transition-colors',
                tab === 'calendar'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-black/40 hover:text-black/70'
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              Calendar
            </button>
            <button
              onClick={() => setTab('create')}
              className={cn(
                'flex items-center gap-1.5 px-1 py-2 text-[10px] font-medium tracking-widest uppercase border-b-2 -mb-px transition-colors',
                tab === 'create'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-black/40 hover:text-black/70'
              )}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              New post
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
          {tab === 'create' ? (
            <NewPostPicker onPostCreated={loadPosts} />
          ) : (
            <>
              {error && (
                <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md px-4 py-3 text-sm">
                  {error}
                  <button onClick={() => setError(null)} className="float-right text-destructive hover:text-destructive/80">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Calendar Grid */}
              <div className="rounded-lg border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                  <Button variant="ghost" size="icon" onClick={prevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="text-sm font-semibold">{MONTH_NAMES[calMonth]} {calYear}</h2>
                  <Button variant="ghost" size="icon" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-7">
                  {DAY_LABELS.map((d) => (
                    <div key={d} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center border-b">
                      {d}
                    </div>
                  ))}

                  {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[72px] border-b border-r last:border-r-0 bg-muted/10" />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dayPosts = scheduledPostsByDay.get(day) ?? [];
                    const isToday = isSameDay(new Date(calYear, calMonth, day), now);
                    const visible = dayPosts.slice(0, 4);
                    const extra = dayPosts.length - 4;

                    return (
                      <div key={day} className="min-h-[88px] border-b border-r last:border-r-0 p-1.5 relative">
                        <span className={`text-xs font-medium inline-flex items-center justify-center w-5 h-5 rounded-full ${
                          isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                        }`}>
                          {day}
                        </span>
                        {visible.length > 0 && (
                          <div className={cn(
                            'grid gap-0.5 mt-0.5',
                            visible.length === 1 && 'grid-cols-1',
                            visible.length === 2 && 'grid-cols-2',
                            visible.length >= 3 && 'grid-cols-2',
                          )}>
                            {visible.map((p) => {
                              const imgUrl = p.crop_image_path
                                ? supabase.storage.from('derivatives').getPublicUrl(p.crop_image_path).data.publicUrl
                                : p.panel_image_url;
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => setEditingPost(p)}
                                  className="relative aspect-square rounded overflow-hidden bg-muted hover:ring-2 hover:ring-primary/40 transition-all"
                                  title={p.airline_name ?? p.card_title ?? 'Post'}
                                >
                                  {imgUrl ? (
                                    <img
                                      src={imgUrl}
                                      alt=""
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                                      <ImagePlus className="h-3 w-3" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {extra > 0 && (
                          <span className="text-[10px] text-muted-foreground px-0.5 mt-0.5 block">+{extra} more</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Post List */}
              <div>
                <h2 className="text-lg font-semibold mb-4">
                  All Posts
                  <span className="text-sm font-normal text-muted-foreground ml-2">({posts.length})</span>
                </h2>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm">Loading posts...</p>
                  </div>
                ) : posts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                    <div>
                      <h3 className="text-lg font-medium">No social posts yet</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Switch to the "New post" tab to create one from a saved crop.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {posts.map((post) => {
                      const cropUrl = post.crop_image_path
                        ? supabase.storage.from('derivatives').getPublicUrl(post.crop_image_path).data.publicUrl
                        : post.panel_image_url;
                      return (
                        <button
                          key={post.id}
                          onClick={() => setEditingPost(post)}
                          className="w-full flex items-center gap-4 rounded-lg border bg-card p-3 text-left hover:bg-accent/50 transition-colors"
                        >
                          {cropUrl && <CropPreview imageUrl={cropUrl} size={64} />}
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{post.card_title ?? 'Untitled Card'}</span>
                              <StatusBadge status={post.status} />
                            </div>
                            {post.airline_name && (
                              <p className="text-xs text-muted-foreground">{post.airline_name}</p>
                            )}
                            {post.caption && (
                              <p className="text-xs text-muted-foreground truncate max-w-xl">{post.caption}</p>
                            )}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            {post.scheduled_at ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {new Date(post.scheduled_at).toLocaleDateString(undefined, {
                                  month: 'short', day: 'numeric', year: 'numeric',
                                })}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Unscheduled</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {editingPost && (
        <PostEditor
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          onPublished={handleInstagramPublished}
        />
      )}

      {showFillSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-lg shadow-xl border w-full max-w-md m-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Fill Schedule</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowFillSchedule(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Schedule one post per day using your banked crops. Unused crops are prioritized; if you have fewer crops than days, they'll cycle.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Start date</label>
                  <input
                    type="date"
                    value={fillStart}
                    onChange={(e) => setFillStart(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">End date</label>
                  <input
                    type="date"
                    value={fillEnd}
                    onChange={(e) => setFillEnd(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Post time (ET)</label>
                <input
                  type="time"
                  value={fillTime}
                  onChange={(e) => setFillTime(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">Eastern Time</p>
              </div>
              {fillStart && fillEnd && (
                <p className="text-sm text-muted-foreground">
                  {Math.max(0, Math.ceil((new Date(fillEnd).getTime() - new Date(fillStart).getTime()) / 86400000) + 1)} posts will be scheduled
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" size="sm" onClick={() => setShowFillSchedule(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleFillSchedule}
                disabled={filling || !fillStart || !fillEnd}
                className="gap-1.5"
              >
                {filling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                {filling ? 'Scheduling...' : 'Schedule Posts'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
